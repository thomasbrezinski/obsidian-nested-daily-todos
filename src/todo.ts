export const UntitledSection = "Untitled";
export interface TodoNode {
    item: string
    complete: boolean
    state: string // A single character like */-
    children: TodoNode[]
}

function escapeRegexCharacter(character: string): string {
    // Escape only the dash, caret, and backslash
    if (['-', '^', '\\'].includes(character)) {
        return '\\' + character;
    }
    return character;
}

/**
 * A recursive function that given an array of strings, will check if current line is a Todo, and if so, find all the
 * nested Todos belonging to it. If it is not, it will return a null todo.
 *
 * @param lines - The text to search for todos
 * @param lineNum - Which line of the body of text to search this iteration
 * @param level - The nesting level of this level of items. When next item at this level is found, processing ends.
 * @param allowedChars An array of the characters that will be recognized as valid states of a todo
 * @param completeChars A set of the characters that signify a todo is complete
 * @returns A TodoNode which will contain any children, and the number of Todos found for this line of processing
 */
export function parseForTodos(allowedChars: Set<string>, completeChars: Set<string>, lines: string[], lineNum: number, level = -1): {
    todo: TodoNode | null,
    numItems: number
} {
    // Create a RegExp that will match and of the supportedTodoChar values
    const charsForRegex = Array.from(allowedChars)
        .map(escapeRegexCharacter)
        .join('');
    const regexPattern = `^\\s*- \\[([${charsForRegex}])]`;
    const todoRegex = new RegExp(`${regexPattern} (.*)`, 'g');

    if (lineNum >= lines.length) {
        return {todo: null, numItems: 0}
    }
    const line = lines[lineNum]
    const match = todoRegex.exec(line)
    if (match == null) {
        return {todo: null, numItems: 0}
    }
    const indentLevel = line.split("-")[0].length
    if (indentLevel <= level) {
        return {todo: null, numItems: 0}
    }

    const state = match[1]
    const todoText = match[2]
    const complete = completeChars.has(state);
    const newNode: TodoNode = {item: todoText, state: state, children: [], complete: complete}
    let numItems = 1

    // Scan for nested Todos belonging to this Todo
    let child: { todo: TodoNode | null; numItems: number };
    for (; (child = parseForTodos(allowedChars, completeChars, lines, lineNum + numItems, indentLevel)).todo !== null; numItems += child.numItems) {
        newNode.children.push(child.todo);
    }
    return {todo: newNode, numItems: numItems}
}

export function todoHasIncompleteItem(node: TodoNode): boolean {
    if (!node.complete) {
        return true
    }
    for (const child of node.children) {
        if (todoHasIncompleteItem(child)) {
            return true
        }
    }
    return false
}

/**
 * Parse a body of text for any items, returning all included todos optionally grouped by section
 * @param text
 * @param bySection
 * @param allowedChars An array of the characters that will be recognized as valid states of a todo
 * @param completeChars A set of the characters that signify a todo is complete
 */
export function parseTextForTodos(text: string, bySection: boolean, allowedChars: Set<string>, completeChars: Set<string>): Map<string, TodoNode[]> {
    const lines = text.split('\n')

    let sectionTitle: string | null = null
    const todosBySection = new Map<string, TodoNode[]>();

    for (let i = 0; i < lines.length; i++) {
        const result = parseForTodos(allowedChars, completeChars, lines, i, -1)
        if (null === result.todo) {
            sectionTitle = parseLineForTitle(lines[i])
        }
        if (null !== result.todo && result.todo.item !== '') {
            if (bySection && sectionTitle != null) {
                updateElseSet(todosBySection, sectionTitle, result.todo)
            } else {
                updateElseSet(todosBySection, UntitledSection, result.todo)
            }
            i += result.numItems - 1;
        }
    }
    return todosBySection
}

/**
 * Given a Map of ToDoNodes optionally grouped by section that have been considered for addition to today's daily note,
 * remove them from the previous parsed note text
 *
 * Updating the previous note with the new text is done outside of this function
 *
 * WARNING: The plugin does not enforce equality of children nodes between todos, meaning if a Todo had different
 * children in a later note, the information about the previous children will be lost forever when this removes the old
 * Todo and its children
 *
 * @param previousText The text of the previous note
 * @param incompleteTodos Map of section to incomplete TodoNodes that should be removed
 * @param bySection Whether the provided Todos and the previous notes should attempt to only match Todos in the same section
 * @param allowedChars An array of the characters that will be recognized as valid states of a todo
 * @param completeChars A set of the characters that signify a todo is complete
 */
export function removeIncompleteTodos(
    previousText: string,
    incompleteTodos: Map<string, TodoNode[]>,
    bySection: boolean,
    allowedChars: Set<string>,
    completeChars: Set<string>
): string {
    const lines = previousText.split('\n');
    const updatedNoteText: string[] = [];

    let sectionTitle: string | null = null;

    for (let i = 0; i < lines.length; i++) {
       const result = parseForTodos(allowedChars, completeChars, lines, i, -1)
       if (null === result.todo) {
           sectionTitle = parseLineForTitle(lines[i])
       }
       if (null !== result.todo && result.todo.item !== '') {
           // It's an Todo item, check if it's one that we should keep or remove
           const sectionToCheck = (bySection && sectionTitle !== null) ? sectionTitle : UntitledSection;
           const item = result.todo.item;

           const todosToCheck = incompleteTodos.get(sectionToCheck);
           let itemFound = false;
           if (todosToCheck) {
               for (let j = 0; j < todosToCheck.length; j++) {
                   if (todosToCheck[j].item === item) {
                       itemFound = true;
                       break;
                   }
               }
           }
           if (itemFound) {
               if (result.todo.complete && !todoHasIncompleteItem(result.todo)) {
                   // If the item is complete with no incomplete children, it's likely that a later note re-introduced
                   // the incomplete item. It should not be removed from this note
                   console.info(`Not removing ${item} because it is complete`);
                   updatedNoteText.push(...lines.slice(i, i + result.numItems));
               } else {
                   console.info(`Removing ${item} because it is incomplete and was added to today's note`);
               }
           } else {
               updatedNoteText.push(...lines.slice(i, i + result.numItems));
           }
           i += result.numItems - 1;
       } else {
           // line is not a todo, keep it
           updatedNoteText.push(lines[i]);
       }
    }
    return updatedNoteText.join("\n");
}

export function parseLineForTitle(line: string): string | null {
    const titleRegex = /^#+\s(.+)/;
    if (titleRegex.test(line)) {
        return line
    } else {
        return null
    }
}


/**
 * This function takes all the todos from the previous days and returns a list of only the still incomplete ones
 * - If an incomplete todo is complete on a later day, it will be removed.
 * - The children Todos are not checked for equality
 * - todos that are in sections are only compared to the same section across days
 * The result map should be Todos that have most recently appeared with some incomplete item in their hierarchy
 */
export function calculateRemainingIncompleteTodos(previousTodos: Map<string, TodoNode[]>[]): Map<string, TodoNode[]> {
    const incompleteTodos: Map<string, TodoNode[]> = new Map<string, TodoNode[]>();
    for (const dayOfTodos of previousTodos) {
        for (const [sectionTitle, sectionTodos] of dayOfTodos.entries()) {
            for (const todo of sectionTodos) {
                if (todoHasIncompleteItem(todo)) {
                    if (incompleteTodos.has(sectionTitle)) {
                        // Replace or add the incomplete todo
                        const previousIncompleteTodos = incompleteTodos.get(sectionTitle) ?? []
                        const index = previousIncompleteTodos.findIndex(previousTodo => previousTodo.item == todo.item);
                        if (index !== -1) {
                            previousIncompleteTodos[index] = todo;
                        } else {
                            previousIncompleteTodos.push(todo);
                        }
                    } else {
                        incompleteTodos.set(sectionTitle, [todo])
                    }
                } else {
                    // This item is complete, so if it was previously added to the list of incomplete, remove it
                    if (incompleteTodos.has(sectionTitle)) {
                        const previousIncompleteTodos = incompleteTodos.get(sectionTitle) ?? []
                        const index = previousIncompleteTodos.findIndex(previousTodo => previousTodo.item == todo.item);
                        if (index !== -1) {
                            previousIncompleteTodos.splice(index, 1);
                        }
                    }
                }
            }
        }
    }
    return incompleteTodos;
}

export function filterOutExistingTodos(previousTodos: Map<string, TodoNode[]>, existingTodos: Map<string, TodoNode[]>): Map<string, TodoNode[]> {
    const remainingTodos = new Map<string, TodoNode[]>()

    for (const [sectionTitle, entries] of previousTodos) {
        const existingEntries = existingTodos.get(sectionTitle);
        if (!existingEntries) {
            remainingTodos.set(sectionTitle, entries);
        } else {
            const newEntries = entries.filter(entry => !existingEntries.some(existingEntry => existingEntry.item === entry.item));
            if (newEntries.length > 0) {
                remainingTodos.set(sectionTitle, newEntries);
            }
        }
    }
    return remainingTodos;
}

/**
 * A recursive function that given a todo (with potential children) and the current indentation level, return a text
 * representation of the todo and its children
 * @param todo - The todo to turn into a text representation
 * @param indentLevel - The indentation level that the current todo should be rendered at
 */
export function todoToString(todo: TodoNode, indentLevel: number): string[] {
    let entries = [`${'\t'.repeat(indentLevel)}- [${todo.state}] ${todo.item}`]
    for (const node of todo.children) {
        entries = entries.concat(todoToString(node, indentLevel + 1))
    }
    return entries
}

export function todosToString(todos: TodoNode[]) {
    let entries: string[] = []
    for (const todo of todos) {
        entries = entries.concat(todoToString(todo, 0))
    }
    return entries.join("\n")
}

/**
 * Returns an updated version of the note text with the provided todos added after the selected header
 * @param incompleteTodos - The Todos to add by section they belong to.
 * @param noteText - The original note text
 * @param bySection - If true, will attempt to add the previous items to the matching sections in the new note
 * @returns - Note text with the todos added, intended to be used to update the current daily note
 */
export function insertIncompleteTodos(incompleteTodos: Map<string, TodoNode[]>, bySection: boolean, noteText: string,) {
    console.info(`Adding missing todos to today's note.`)
    let newNoteText: string = noteText;
    if (bySection) {
        for (const sectionTitle of incompleteTodos.keys()) {
            const sectionTitleIndex = noteText.indexOf(sectionTitle);
            if (sectionTitleIndex === -1) {
                console.error(`Failed to find header: ${sectionTitle} in new note. Adding items to end of note`);
                newNoteText += "\n" + todosToString(incompleteTodos.get(sectionTitle) ?? [])
            } else {
                console.debug(`Adding todos for section ${sectionTitle} under matching header`)
                const splitNote = newNoteText.split(sectionTitle);
                newNoteText = `${splitNote[0]}${sectionTitle}\n`
                newNoteText += todosToString(incompleteTodos.get(sectionTitle) ?? [])
                newNoteText += splitNote[1]
            }
        }
    } else {
        console.debug("Adding incomplete todos to end of note")
        for (const sectionOfTodos of incompleteTodos.values()) {
            newNoteText += "\n" + todosToString(sectionOfTodos)
        }
    }
    return newNoteText;
}

/**
 * Returns an updated version of the note text with the provided todos added after the selected header
 * @param noteText - The original note text
 * @returns - Note text with empty todos removed
 */
export function removeEmptyTodos(noteText: string) {
    console.info("Removing empty todos from today's note");
    const emptyTodoRegex = new RegExp(`^\\s*- \\[ \\]\\s*$`, 'gm');
    return noteText.replace(emptyTodoRegex, '');
}


function updateElseSet<T, V>(m: Map<T, V[]>, k: T, v: V) {
    const entries = m.get(k) || []
    entries.push(v)
    m.set(k, entries)
}
