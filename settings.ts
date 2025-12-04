import { App, PluginSettingTab, Setting, Plugin } from 'obsidian';

export interface ELLKnowledgeBuilderPluginSettings {
	pinnedFiles: string[];
	shiftHandoff?: any;  // Add this line
	
	// Popup window settings
	popupWindow: {
		messagesFolder: string;
		showOnStartup: boolean;
		autoDeleteEnabled: boolean;
		autoDeleteHours: number;
		oldPopupsRetentionDays: number;
	};
}

export const DEFAULT_SETTINGS: ELLKnowledgeBuilderPluginSettings = {
	pinnedFiles: [],
	popupWindow: {
		messagesFolder: "PinnedMessages",
		showOnStartup: true,
		autoDeleteEnabled: true,
		autoDeleteHours: 24,
		oldPopupsRetentionDays: 14,
	},
}

export class ELLKnowledgeBuilderPluginSettingsTab extends PluginSettingTab {
	plugin: Plugin & { settings: ELLKnowledgeBuilderPluginSettings };

	constructor(app: App, plugin: Plugin & { settings: ELLKnowledgeBuilderPluginSettings }) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;
		containerEl.empty();

		containerEl.createEl('h2', {text: 'Plugin Settings'});

		containerEl.createEl('h3', {text: 'Pinned Notes'});
		
		new Setting(containerEl)
			.setName('Pinned files')
			.setDesc('Files and folders pinned in the Pinned Notes view');

		const pinnedList = containerEl.createDiv('pinned-files-list');
		
		if (this.plugin.settings.pinnedFiles.length === 0) {
			pinnedList.createEl('p', {
				text: 'No files pinned yet. Right-click on a file to pin it.',
				cls: 'setting-item-description'
			});
		} else {
			this.plugin.settings.pinnedFiles.forEach((filePath, index) => {
				const fileItem = pinnedList.createDiv('pinned-file-item');
				fileItem.style.display = 'flex';
				fileItem.style.justifyContent = 'space-between';
				fileItem.style.alignItems = 'center';
				fileItem.style.padding = '8px';
				fileItem.style.marginBottom = '4px';
				fileItem.style.backgroundColor = 'var(--background-secondary)';
				fileItem.style.borderRadius = '4px';

				const fileName = filePath.split('/').pop() || filePath;
				fileItem.createSpan({text: fileName});

				const removeButton = fileItem.createEl('button', {text: 'Remove'});
				removeButton.onclick = async () => {
					this.plugin.settings.pinnedFiles.splice(index, 1);
					await (this.plugin as any).saveSettings();
					const leaves = this.plugin.app.workspace.getLeavesOfType('pinned-notes-view');
					leaves.forEach((leaf) => {
						(leaf.view as any).render();
					});
					this.display();
				};
			});
		}

		if (this.plugin.settings.pinnedFiles.length > 0) {
			new Setting(containerEl)
				.addButton(button => button
					.setButtonText('Clear all pinned files')
					.setWarning()
					.onClick(async () => {
						this.plugin.settings.pinnedFiles = [];
						await (this.plugin as any).saveSettings();
						const leaves = this.plugin.app.workspace.getLeavesOfType('pinned-notes-view');
						leaves.forEach((leaf) => {
							(leaf.view as any).render();
						});
						this.display();
					}));
		}

		/* =============== SHIFT HANDOFF =============== */
		
    containerEl.createEl('h3', {text: 'Shift Handoff'});
		containerEl.createEl('p', {
			text: 'Use the command palette (Ctrl+P) to clock in/out and manage lab members.',
			cls: 'setting-item-description'
		});
    
    /* =============== POPUP WINDOW =============== */

    containerEl.createEl('h3', {text: 'Popup Window Messages'});

		new Setting(containerEl)
			.setName('Messages folder')
			.setDesc('Folder containing pinned messages to display')
			.addText(text => text
				.setPlaceholder('PinnedMessages')
				.setValue(this.plugin.settings.popupWindow.messagesFolder)
				.onChange(async (value) => {
					this.plugin.settings.popupWindow.messagesFolder = value;
					await (this.plugin as any).saveSettings();
				}));

		new Setting(containerEl)
			.setName('Show on startup')
			.setDesc('Automatically show pinned messages when vault opens')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.popupWindow.showOnStartup)
				.onChange(async (value) => {
					this.plugin.settings.popupWindow.showOnStartup = value;
					await (this.plugin as any).saveSettings();
				}));

		new Setting(containerEl)
			.setName('Auto-delete messages')
			.setDesc('Automatically delete messages after a certain time')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.popupWindow.autoDeleteEnabled)
				.onChange(async (value) => {
					this.plugin.settings.popupWindow.autoDeleteEnabled = value;
					await (this.plugin as any).saveSettings();
				}));

		new Setting(containerEl)
			.setName('Auto-delete time (hours)')
			.setDesc('Number of hours before messages are automatically deleted')
			.addText(text => text
				.setPlaceholder('24')
				.setValue(String(this.plugin.settings.popupWindow.autoDeleteHours))
				.onChange(async (value) => {
					const hours = parseFloat(value);
					if (!isNaN(hours) && hours > 0) {
						this.plugin.settings.popupWindow.autoDeleteHours = hours;
						await (this.plugin as any).saveSettings();
					}
				}));

		new Setting(containerEl)
			.setName('Retention in Old Popups (days)')
			.setDesc('After this many days, items in Old Popups are auto-deleted')
			.addText(text => text
				.setPlaceholder('14')
				.setValue(String(this.plugin.settings.popupWindow.oldPopupsRetentionDays))
				.onChange(async (value) => {
					const days = parseInt(value, 10);
					if (!isNaN(days) && days > 0) {
						this.plugin.settings.popupWindow.oldPopupsRetentionDays = days;
						await (this.plugin as any).saveSettings();
					}
				}));

        /* =============== ADD NEXT FEATURE NAME =============== */

		// Add other feature settings sections here
		// containerEl.createEl('h3', {text: 'Feature 2'});
		// ... more settings ...
	}
}