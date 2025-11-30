import { App, Plugin, TAbstractFile, TFile, TFolder, Menu, Notice, ItemView, WorkspaceLeaf } from 'obsidian';

const VIEW_TYPE_PINNED_NOTES = 'pinned-notes-view';

interface PinNotesSettings {
	pinnedFiles: string[];
}

class PinnedNotesView extends ItemView {
	plugin: Plugin;
	settings: PinNotesSettings;
	refreshCallback: () => void;

	constructor(leaf: WorkspaceLeaf, plugin: Plugin, settings: PinNotesSettings, refreshCallback: () => void) {
		super(leaf);
		this.plugin = plugin;
		this.settings = settings;
		this.refreshCallback = refreshCallback;
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

		const header = container.createDiv({ cls: 'pinned-notes-header' });
		header.createEl('h4', { text: 'Pinned Notes' });

		const list = container.createDiv({ cls: 'pinned-notes-list' });

		if (this.settings.pinnedFiles.length === 0) {
			list.createDiv({ 
				cls: 'pinned-notes-empty',
				text: 'No pinned notes. Right-click any file to pin it here.'
			});
		} else {
			this.settings.pinnedFiles.forEach((filePath) => {
				const file = this.app.vault.getAbstractFileByPath(filePath);
				if (!file) return;

				const isFolder = file instanceof TFolder;
				const item = list.createDiv({ cls: isFolder ? 'pinned-note-item tree-item nav-folder' : 'pinned-note-item tree-item nav-file' });
				const itemSelf = item.createDiv({ cls: isFolder ? 'tree-item-self nav-folder-title' : 'tree-item-self nav-file-title' });
				
				const icon = itemSelf.createDiv({ cls: 'tree-item-icon' });
				if (isFolder) {
					icon.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>';
					icon.style.color = 'var(--text-accent)';
				} else {
					icon.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>';
				}
				
				const fileName = file.name;
				itemSelf.createDiv({ cls: 'tree-item-inner nav-file-title-content', text: fileName });

				itemSelf.addEventListener('click', async (e) => {
					e.preventDefault();
					if (isFolder) {
						const fileExplorer = this.app.workspace.getLeavesOfType('file-explorer')[0];
						if (fileExplorer) {
							(fileExplorer.view as any).revealInFolder(file);
						}
					} else {
						const leaf = this.app.workspace.getLeaf(e.ctrlKey || e.metaKey);
						await leaf.openFile(file as TFile);
					}
				});

				itemSelf.addEventListener('contextmenu', (e) => {
					e.preventDefault();
					const menu = new Menu();
					
					menu.addItem((item) => {
						item
							.setTitle('Unpin')
							.setIcon('pin-off')
							.onClick(() => {
								this.togglePin(filePath);
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

	togglePin(filePath: string) {
		const index = this.settings.pinnedFiles.indexOf(filePath);
		
		if (index > -1) {
			this.settings.pinnedFiles.splice(index, 1);
			new Notice('File unpinned');
		} else {
			this.settings.pinnedFiles.push(filePath);
			new Notice('File pinned');
		}
		
		this.refreshCallback();
		this.render();
	}

	async onClose() {
		// Cleanup if needed
	}
}

export function initializePinnedNotes(plugin: Plugin, settings: any, saveSettings: () => Promise<void>) {
	// Ensure pinned files array exists
	if (!settings.pinnedFiles) {
		settings.pinnedFiles = [];
	}

	// Register the view
	plugin.registerView(
		VIEW_TYPE_PINNED_NOTES,
		(leaf) => new PinnedNotesView(leaf, plugin, settings, async () => {
			await saveSettings();
			refreshPinnedNotesView(plugin);
		})
	);

	// Add command to open the pinned notes view
	plugin.addCommand({
		id: 'open-pinned-notes',
		name: 'Open Pinned Notes',
		callback: () => {
			activatePinnedNotesView(plugin);
		}
	});

	// Add command to toggle pin for current file
	plugin.addCommand({
		id: 'toggle-pin-current-file',
		name: 'Toggle pin for current file',
		callback: () => {
			const activeFile = plugin.app.workspace.getActiveFile();
			if (activeFile) {
				togglePin(plugin, settings, activeFile.path, saveSettings);
			}
		}
	});

	// Add context menu option for files
	plugin.registerEvent(
		plugin.app.workspace.on('file-menu', (menu: Menu, file: TAbstractFile) => {
			const isPinned = settings.pinnedFiles.includes(file.path);
			menu.addItem((item) => {
				item
					.setTitle(isPinned ? 'Unpin from Pinned Notes' : 'Pin to Pinned Notes')
					.setIcon(isPinned ? 'pin-off' : 'pin')
					.onClick(() => {
						togglePin(plugin, settings, file.path, saveSettings);
					});
			});
		})
	);

	// Add context menu option for folders
	plugin.registerEvent(
		plugin.app.workspace.on('files-menu', (menu: Menu, files: TAbstractFile[]) => {
			if (files.length === 1) {
				const file = files[0];
				const isPinned = settings.pinnedFiles.includes(file.path);
				menu.addItem((item) => {
					item
						.setTitle(isPinned ? 'Unpin from Pinned Notes' : 'Pin to Pinned Notes')
						.setIcon(isPinned ? 'pin-off' : 'pin')
						.onClick(() => {
							togglePin(plugin, settings, file.path, saveSettings);
						});
				});
			}
		})
	);

	// Open pinned notes view on startup
	plugin.app.workspace.onLayoutReady(() => {
		activatePinnedNotesView(plugin);
	});

	// Add styles
	addPinnedNotesStyles();
}

async function activatePinnedNotesView(plugin: Plugin) {
	const { workspace } = plugin.app;

	let leaf: WorkspaceLeaf | null = null;
	const leaves = workspace.getLeavesOfType(VIEW_TYPE_PINNED_NOTES);

	if (leaves.length > 0) {
		leaf = leaves[0];
	} else {
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

async function togglePin(plugin: Plugin, settings: PinNotesSettings, filePath: string, saveSettings: () => Promise<void>) {
	const index = settings.pinnedFiles.indexOf(filePath);
	
	if (index > -1) {
		settings.pinnedFiles.splice(index, 1);
		new Notice('File unpinned');
	} else {
		settings.pinnedFiles.push(filePath);
		new Notice('File pinned');
	}
	
	await saveSettings();
	refreshPinnedNotesView(plugin);
}

function refreshPinnedNotesView(plugin: Plugin) {
	const leaves = plugin.app.workspace.getLeavesOfType(VIEW_TYPE_PINNED_NOTES);
	leaves.forEach((leaf) => {
		if (leaf.view instanceof PinnedNotesView) {
			leaf.view.render();
		}
	});
}

function addPinnedNotesStyles() {
	const style = document.createElement('style');
	style.id = 'pinned-notes-styles';
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
	
	// Remove existing styles if present
	const existing = document.getElementById('pinned-notes-styles');
	if (existing) {
		existing.remove();
	}
	
	document.head.appendChild(style);
}