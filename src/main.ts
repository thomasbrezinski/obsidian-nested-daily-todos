import {moment, Notice, Plugin, TFile} from 'obsidian';
import {createDailyNote, getAllDailyNotes, getDailyNote} from 'obsidian-daily-notes-interface';
import {
    calculateRemainingIncompleteTodos,
    filterOutExistingTodos,
    insertIncompleteTodos,
    parseTextForTodos,
    removeEmptyTodos,
    TodoNode
} from './todo';
import {NestedDailyTodosSettingTab} from './settings';

interface NestedDailyTodosSettings {
    daysLookBack: number;
    groupBySection: boolean;
    removeEmptyTodos: boolean;
    supportedTodoChars: Set<string>;
    completeTodoChars: Set<string>;
}

export const DEFAULT_SETTINGS: NestedDailyTodosSettings = {
    daysLookBack: 7,
    groupBySection: true,
    removeEmptyTodos: true,
    supportedTodoChars: new Set(['x', 'X', '/', '-']),
    completeTodoChars: new Set(['x', 'X', '-'])
};

export default class NestedDailyTodos extends Plugin {
    settings: NestedDailyTodosSettings;

    async onload() {
        console.info('Loading Nested Daily Todos plugin');
        await this.loadSettings();

        this.addRibbonIcon(
            'bullet-list-glyph',
            'Add incomplete todos to today\'s note',
            (evt: MouseEvent) => {
                new Notice('Running Nested Daily Todos');
                addIncompleteTodosToTodaysNote(this);
            }
        );

        this.addCommand({
            id: 'add-incomplete-todos',
            name: 'Add previous incomplete todos',
            callback: () => addIncompleteTodosToTodaysNote(this)
        });

        this.addSettingTab(new NestedDailyTodosSettingTab(this.app, this));
    }

    onunload() {
        console.info('Unloading Nested Daily Todos plugin');
    }

    async loadSettings() {
        const savedSettings = await this.loadData();
        if (typeof savedSettings?.supportedTodoChars === 'string' && savedSettings?.supportedTodoChars.length !== 0) {
            savedSettings.supportedTodoChars = new Set(savedSettings.supportedTodoChars.split(''));
        }
        if (typeof savedSettings?.completeTodoChars === 'string' && savedSettings?.completeTodoChars.length !== 0) {
            savedSettings.completeTodoChars = new Set(savedSettings.completeTodoChars.split(''));
        }

        this.settings = {
            ...DEFAULT_SETTINGS,
            ...savedSettings,
            supportedTodoChars: savedSettings?.supportedTodoChars || new Set(DEFAULT_SETTINGS.supportedTodoChars),
            completeTodoChars: savedSettings?.completeTodoChars || new Set(DEFAULT_SETTINGS.completeTodoChars)
        }

        this.settings.supportedTodoChars.add(' ');
    }

    async saveSettings() {
        // Convert Set<string> to comma-separated strings
        const supportedTodoChars = Array.from(this.settings.supportedTodoChars).join('');
        const completeTodoChars = Array.from(this.settings.completeTodoChars).join('');

        await this.saveData({
            ...this.settings,
            supportedTodoChars,
            completeTodoChars
        });
    }
}

export async function addIncompleteTodosToTodaysNote(plugin: NestedDailyTodos) {
    const settings = plugin.settings;
    const days = Array.from({length: settings.daysLookBack + 1}, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - i);
        return moment(d);
    });
    const today = days[0];
    const dates = days.reverse();

    // TODO: Use getAbstractFileByPath() with daily note paths
    const allDailyNotes = getAllDailyNotes();

    let todayNote = getDailyNote(today, allDailyNotes);
    if (null === todayNote) {
        try {
            console.info('Today\'s Daily Note not found. Creating daily note for today');
            await createDailyNote(today).then((newNote: TFile) => (todayNote = newNote));
        } catch (e) {
            console.error(`Failed to create missing note for today: ${e}`);
            throw e;
        }
    }

    const notes = Array.from(dates, (date) => getDailyNote(date, allDailyNotes)).filter(note => note !== null);
    console.debug(`Running with: supportedTodoChars: "${Array.from(settings.supportedTodoChars).join("")}", completeTodoChars: "${Array.from(settings.completeTodoChars).join("")}"`)
    console.info(`Checking notes: ${notes.map(note => note.name).join(', ')}`);

    const existingTodos: Map<string, TodoNode[]>[] = await parseFilesForTodos(
        notes,
        settings.groupBySection,
        settings.supportedTodoChars,
        settings.completeTodoChars
    );
    existingTodos.forEach((dayOfTodos, index) => {
        console.info(`Todos for ${notes[index].name}`);
        const numberOfTopLevelTodos = Array.from(dayOfTodos.values()).reduce((sum, currentArray) => sum + currentArray.length, 0);
        console.info(`Number of top-level todos found: ${numberOfTopLevelTodos}`);
        dayOfTodos.forEach((todos, group) => {
            console.debug(`  Group: ${group}`);
            console.debug(todos);
        });
    });
    const previousExistingTodos = existingTodos.slice(0, -1)
    const incompleteTodos = calculateRemainingIncompleteTodos(previousExistingTodos);

    const numberOfIncompleteTodos = Array.from(incompleteTodos.values()).reduce((sum, currentArray) => sum + currentArray.length, 0);
    const incompleteTodosNotice = `${numberOfIncompleteTodos} top-level incomplete todos found in previous days`;
    new Notice(incompleteTodosNotice);
    console.info(incompleteTodosNotice);

    const todaysExistingTodos = existingTodos[existingTodos.length - 1];
    const missingIncompleteTodos = filterOutExistingTodos(incompleteTodos, todaysExistingTodos);

    const numMissingTodos = Array.from(missingIncompleteTodos.values()).reduce((sum, currentArray) => sum + currentArray.length, 0);
    const numMissingTodosNotice = `Of previous todos, ${numMissingTodos} not found in today's note.`;
    new Notice(numMissingTodosNotice);
    console.info(numMissingTodosNotice);

    if (numMissingTodos > 0) {
        this.app.vault
            .process(
                todayNote,
                insertIncompleteTodos.bind(null, missingIncompleteTodos, settings.groupBySection)
            )
    }

    if (settings.removeEmptyTodos) {
        this.app.vault
            .process(
                todayNote,
                removeEmptyTodos.bind(null)
            )
    }
}

export async function parseFilesForTodos(
    notes: TFile[],
    groupBySection: boolean,
    supportedChars: Set<string>,
    completeTodoChars: Set<string>
): Promise<Map<string, TodoNode[]>[]> {
    // compromise to improve testability given inability to write tests that rely on obsidian methods
    // Build the collection of todos and have a separate function reconcile what should be removed
    const todos: Map<string, TodoNode[]>[] = [];
    for (const note of notes) {
        if (note !== null) {
            const text: string = await this.app.vault.read(note);
            const found = parseTextForTodos(
                text,
                groupBySection,
                supportedChars,
                completeTodoChars
            );
            todos.push(found);
        }
    }
    return todos;
}
