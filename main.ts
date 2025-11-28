import { App, Plugin, PluginSettingTab, Setting, TAbstractFile, TFile, TFolder, Menu, Notice, ItemView, WorkspaceLeaf } from 'obsidian';

const VIEW_TYPE_PINNED_NOTES = 'pinned-notes-view';

interface PinNotesSettings {
	pinnedFiles: string[];
}

const DEFAULT_SETTINGS: PinNotesSettings = {
	pinnedFiles: []
}

class PinnedNotesView extends ItemView {
	plugin: PinNotesPlugin;

	constructor(leaf: WorkspaceLeaf, plugin: PinNotesPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return VIEW_TYPE_PINNED_NOTES;
	}

	getDisplayText(): string {
		return 'Pinned Notes';
	}

	getIcon(): string {
		return 'pin';
	}

	async onOpen() {
		this.render();
	}

	render() {
		const container = this.containerEl.children[1];
		container.empty();
		container.addClass('pinned-notes-container');

		// Add a header
		const header = container.createDiv({ cls: 'pinned-notes-header' });
		header.createEl('h4', { text: 'Pinned Notes' });

		// Create list of pinned files
		const list = container.createDiv({ cls: 'pinned-notes-list' });

		if (this.plugin.settings.pinnedFiles.length === 0) {
			list.createDiv({ 
				cls: 'pinned-notes-empty',
				text: 'No pinned notes. Right-click any file to pin it here.'
			});
		} else {
			this.plugin.settings.pinnedFiles.forEach((filePath) => {
				const file = this.app.vault.getAbstractFileByPath(filePath);
				if (!file) return;

				const isFolder = file instanceof TFolder;
				const item = list.createDiv({ cls: isFolder ? 'pinned-note-item tree-item nav-folder' : 'pinned-note-item tree-item nav-file' });
				const itemSelf = item.createDiv({ cls: isFolder ? 'tree-item-self nav-folder-title' : 'tree-item-self nav-file-title' });
				
				// Icon (different for folders vs files)
				const icon = itemSelf.createDiv({ cls: 'tree-item-icon' });
				if (isFolder) {
					// Pinned folder icon (folder with emphasis)
					icon.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>';
					icon.style.color = 'var(--text-accent)';
				} else {
					icon.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>';
				}
				
				// Name
				const fileName = file.name;
				itemSelf.createDiv({ cls: 'tree-item-inner nav-file-title-content', text: fileName });

				// Click to open/reveal
				itemSelf.addEventListener('click', async (e) => {
					e.preventDefault();
					if (isFolder) {
						// Reveal folder in file explorer
						const fileExplorer = this.app.workspace.getLeavesOfType('file-explorer')[0];
						if (fileExplorer) {
							(fileExplorer.view as any).revealInFolder(file);
						}
					} else {
						const leaf = this.app.workspace.getLeaf(e.ctrlKey || e.metaKey);
						await leaf.openFile(file as TFile);
					}
				});

				// Right-click for context menu
				itemSelf.addEventListener('contextmenu', (e) => {
					e.preventDefault();
					const menu = new Menu();
					
					menu.addItem((item) => {
						item
							.setTitle('Unpin')
							.setIcon('pin-off')
							.onClick(() => {
								this.plugin.togglePin(filePath);
							});
					});

					if (!isFolder) {
						menu.addItem((item) => {
							item
								.setTitle('Open in new tab')
								.setIcon('file-plus')
								.onClick(async () => {
									const newLeaf = this.app.workspace.getLeaf('tab');
									await newLeaf.openFile(file as TFile);
								});
						});
					}

					menu.showAtMouseEvent(e);
				});

				// Drag support
				itemSelf.draggable = true;
				itemSelf.addEventListener('dragstart', (e) => {
					const dragData = {
						type: 'file',
						file: file
					};
					e.dataTransfer?.setData('text/plain', JSON.stringify(dragData));
				});
			});
		}
	}

	async onClose() {
		// Cleanup if needed
	}
}

export default class PinNotesPlugin extends Plugin {
	settings: PinNotesSettings;

	async onload() {
		await this.loadSettings();

		// Register the view
		this.registerView(
			VIEW_TYPE_PINNED_NOTES,
			(leaf) => new PinnedNotesView(leaf, this)
		);

		// Add command to open the pinned notes view
		this.addCommand({
			id: 'open-pinned-notes',
			name: 'Open Pinned Notes',
			callback: () => {
				this.activateView();
			}
		});

		// Add command to toggle pin for current file
		this.addCommand({
			id: 'toggle-pin-current-file',
			name: 'Toggle pin for current file',
			callback: () => {
				const activeFile = this.app.workspace.getActiveFile();
				if (activeFile) {
					this.togglePin(activeFile.path);
				}
			}
		});

		// Add context menu option
		this.registerEvent(
			this.app.workspace.on('file-menu', (menu: Menu, file: TAbstractFile) => {
				const isPinned = this.settings.pinnedFiles.includes(file.path);
				menu.addItem((item) => {
					item
						.setTitle(isPinned ? 'Unpin from Pinned Notes' : 'Pin to Pinned Notes')
						.setIcon(isPinned ? 'pin-off' : 'pin')
						.onClick(() => {
							this.togglePin(file.path);
						});
				});
			})
		);

		// Open pinned notes view on startup
		this.app.workspace.onLayoutReady(() => {
			this.activateView();
		});

		this.addSettingTab(new PinNotesSettingTab(this.app, this));

		// Add styles
		this.addStyles();
	}

	async activateView() {
		const { workspace } = this.app;

		let leaf: WorkspaceLeaf | null = null;
		const leaves = workspace.getLeavesOfType(VIEW_TYPE_PINNED_NOTES);

		if (leaves.length > 0) {
			// View already exists, just reveal it
			leaf = leaves[0];
		} else {
			// Create new leaf in the left sidebar
			leaf = workspace.getLeftLeaf(false);
			await leaf?.setViewState({
				type: VIEW_TYPE_PINNED_NOTES,
				active: true,
			});
		}

		if (leaf) {
			workspace.revealLeaf(leaf);
		}
	}

	async togglePin(filePath: string) {
		const index = this.settings.pinnedFiles.indexOf(filePath);
		
		if (index > -1) {
			this.settings.pinnedFiles.splice(index, 1);
			new Notice('File unpinned');
		} else {
			this.settings.pinnedFiles.push(filePath);
			new Notice('File pinned');
		}
		
		await this.saveSettings();
		this.refreshView();
	}

	refreshView() {
		const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_PINNED_NOTES);
		leaves.forEach((leaf) => {
			if (leaf.view instanceof PinnedNotesView) {
				leaf.view.render();
			}
		});
	}

	addStyles() {
		const style = document.createElement('style');
		style.textContent = `
			.pinned-notes-container {
				padding: 8px;
				height: 100%;
				overflow-y: auto;
			}
			
			.pinned-notes-header {
				padding: 8px 4px;
				border-bottom: 1px solid var(--background-modifier-border);
				margin-bottom: 8px;
			}
			
			.pinned-notes-header h4 {
				margin: 0;
				font-size: 14px;
				font-weight: 600;
				color: var(--text-muted);
			}
			
			.pinned-notes-list {
				display: flex;
				flex-direction: column;
				gap: 2px;
			}
			
			.pinned-notes-empty {
				padding: 16px;
				text-align: center;
				color: var(--text-muted);
				font-size: 13px;
			}
			
			.pinned-note-item {
				cursor: pointer;
			}
			
			.pinned-note-item .tree-item-self {
				padding: 4px 8px;
				border-radius: 4px;
				display: flex;
				align-items: center;
				gap: 2px;
			}
			
			.pinned-note-item .tree-item-self:hover {
				background-color: var(--background-modifier-hover);
			}
			
			.pinned-note-item .tree-item-icon {
				display: flex;
				align-items: center;
				width: 16px;
				height: 16px;
				flex-shrink: 0;
				margin-left: 2px;
			}
			
			.pinned-note-item .tree-item-icon svg {
				width: 16px;
				height: 16px;
				color: var(--text-muted);
			}
			
			.pinned-note-item .tree-item-inner {
				flex: 1;
				font-size: 13px;
				white-space: nowrap;
				overflow: hidden;
				text-overflow: ellipsis;
				margin-left: 22px;
			}
		`;
		document.head.appendChild(style);
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class PinNotesSettingTab extends PluginSettingTab {
	plugin: PinNotesPlugin;

	constructor(app: App, plugin: PinNotesPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;
		containerEl.empty();

		containerEl.createEl('h2', {text: 'Pinned Notes Settings'});

		new Setting(containerEl)
			.setName('Pinned files')
			.setDesc('Files pinned in the Pinned Notes view');

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
					await this.plugin.saveSettings();
					this.plugin.refreshView();
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
						await this.plugin.saveSettings();
						this.plugin.refreshView();
						this.display();
					}));
		}
	}
}