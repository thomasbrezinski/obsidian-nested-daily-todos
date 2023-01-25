import {App, PluginSettingTab, Setting} from "obsidian";
import NestedDailyTodos, {DEFAULT_SETTINGS} from "./main";

export class NestedDailyTodosSettingTab extends PluginSettingTab {
    plugin: NestedDailyTodos;

    constructor(app: App, plugin: NestedDailyTodos) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const {containerEl} = this;

        containerEl.empty();

        new Setting(containerEl)
            .setName('Number of previous days to check for todos')
            .addText(text => {
                text.setPlaceholder('7');
                text.inputEl.type = "number";
                text.setValue(this.plugin.settings.daysLookBack.toString())
                text.onChange(async (value) => {
                    this.plugin.settings.daysLookBack = parseInt(value, 10);
                    await this.plugin.saveSettings();
                })
            });
        new Setting(containerEl)
            .setName('Group todos by section')
            .setDesc('Enable this to group incomplete todos by any headings they are under. If disabled, or a previous' +
                'heading is not found in today\'s note, the incomplete todos are ended to the end of today\'s note.')
            .addToggle((toggle) => toggle
                .setValue(this.plugin.settings.groupBySection)
                .onChange(async (value) => {
                    this.plugin.settings.groupBySection = value
                    await this.plugin.saveSettings();
                })
            )
        new Setting(containerEl)
            .setName('Remove empty todos')
            .setDesc('Remove empty todos from the updated note.')
            .addToggle((toggle) => toggle
                .setValue(this.plugin.settings.removeEmptyTodos)
                .onChange(async (value) => {
                    this.plugin.settings.removeEmptyTodos = value
                    await this.plugin.saveSettings();
                })
            )
        new Setting(containerEl)
            .setName('Supported Todo characters')
            .setDesc('Todo items with these values will be considered todos and carried forward if incomplete. If ' +
                'you use a theme or plugin that makes use of non-standard values like - [!] and you want that entry ' +
                'to carry forward, include "!" in this setting.')
            .addText(text => text
                .setPlaceholder('xX/-')
                .setValue(Array.from(this.plugin.settings.supportedTodoChars).join(""))
                .onChange(async (value) => {
                    this.plugin.settings.supportedTodoChars = new Set(value.length > 0 ? value.split("") : DEFAULT_SETTINGS.supportedTodoChars);
                    await this.plugin.saveSettings();
                })
            )
        new Setting(containerEl)
            .setName('"complete" Todo Values')
            .setDesc('Todo items with these values will be considered "compete" and won\'t carry forward.')
            .addText(text => text
                .setPlaceholder('xX-')
                .setValue([...this.plugin.settings.completeTodoChars].join(""))
                .onChange(async (value) => {
                    this.plugin.settings.completeTodoChars = new Set(value.length > 0 ? value.split("") : DEFAULT_SETTINGS.completeTodoChars);
                    await this.plugin.saveSettings();
                })
            )
    }
}