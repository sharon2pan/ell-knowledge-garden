import { App, PluginSettingTab, Setting, Plugin } from 'obsidian';

export interface ELLKnowledgeBuilderPluginSettings {
	pinnedFiles: string[];
	shiftHandoff?: any;  // Add this line
}

export const DEFAULT_SETTINGS: ELLKnowledgeBuilderPluginSettings = {
	pinnedFiles: [],
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
	}
}