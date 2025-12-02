import {
    App,
    Modal,
    Notice,
    Plugin,
    TFile,
} from "obsidian";

interface PinnedMessagesSettings {
    messagesFolder: string;   // folder that holds the pinned messages/notes
    showOnStartup: boolean;   // show pinned messages automatically when vault opens
    autoDeleteEnabled: boolean; // automatically delete messages after a certain time
    autoDeleteHours: number;    // number of hours before auto-deleting (default 24)
}

const DEFAULT_SETTINGS: PinnedMessagesSettings = {
    messagesFolder: "PinnedMessages",
    showOnStartup: true,
    autoDeleteEnabled: true,
    autoDeleteHours: 24,
};

interface PinnedMessage {
    title: string;
    content: string;
    path: string;
    fileCreated: number;
}

export default class PinnedMessagesPlugin extends Plugin {
    settings: PinnedMessagesSettings;

    async onload() {
        await this.loadSettings();

        // ribbon icon to open messages manually
        // CURRENTLY DOES NOT WORK?? *
        /*
        this.addRibbonIcon(
            "message-circle",
            "Open Pinned Messages",
            (_evt: MouseEvent) => {
                this.showMessages();
            }
        );
        */

        // command palette entry
        this.addCommand({
            id: "open-pinned-messages",
            name: "Open Pinned Messages",
            callback: () => {
                this.showMessages();
            },
        });

        // auto show on startup
        if (this.settings.showOnStartup) {
            this.app.workspace.onLayoutReady(() => {
                this.showMessages();
            });
        }
    }

    onunload() {
        // empty for now
    }

    // load plugin settings
    async loadSettings() {
        this.settings = Object.assign(
            {},
            DEFAULT_SETTINGS,
            await this.loadData()
        );
    }

    // save plugin settings
    async saveSettings() {
        await this.saveData(this.settings);
    }

    // read the markdown files inside the messages folder
    private async loadMessages(): Promise<PinnedMessage[]> {
        const folderPath = this.settings.messagesFolder.replace(/\/+$/, ""); // remove trailing slashes
        const allMarkdown = this.app.vault.getMarkdownFiles();
        const files = allMarkdown.filter((file) =>
            file.path.startsWith(folderPath + "/")
        );

        const messages: PinnedMessage[] = [];

        for (const file of files) {
            const content = await this.app.vault.cachedRead(file);
            messages.push({
                title: file.basename,
                content,
                path: file.path,
                fileCreated: file.stat.ctime,
            });
        }

        // sort them so they appear consistently
        messages.sort((a, b) => a.title.localeCompare(b.title));
        return messages;
    }

    // show the messages in a modal
    private async showMessages() {
        const messages = await this.loadMessages();

        if (messages.length === 0) {
            new Notice("No pinned messages found.");
            return;
        }

        new PinnedMessagesModal(this.app, messages).open();
    }

    private async deleteMessage(filePath: string) {
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (file instanceof TFile) {
            await this.app.vault.delete(file);
            new Notice(`Deleted message: ${file.basename}`);
        } else {
            new Notice("File not found.");
        }
    }
} // end of plugin class

// modal class (the popup window)

class PinnedMessagesModal extends Modal {
    private messages: PinnedMessage[];
    private index: number;
    private autoDeleteHours: number;

    constructor(app: App, messages: PinnedMessage[], autoDeleteHours: number = 24) {
        super(app);
        this.messages = messages;
        this.index = 0;
        this.autoDeleteHours = autoDeleteHours;
    }

    onOpen() {
        const { contentEl, titleEl } = this;
        titleEl.setText("Pinned Messages");
        contentEl.empty();

        if (this.messages.length === 0) {
            contentEl.createEl("p", { text: "No pinned messages found." });
            return;
        }

        this.renderMessage(contentEl);
    }

    private renderMessage(container: HTMLElement) {
        container.empty();

        const message = this.messages[this.index];
        
        // title
        const header = container.createDiv({ cls: "pinned-message-header" });
        header.createEl("h3", {
            text: `${this.index + 1} / ${this.messages.length}: ${message.title}`,
        });

        // timestamps
        const timestamps = container.createDiv({ cls: "pinned-message-timestamps" });
        const createdDate = new Date(message.fileCreated);
        // Calculate deletion time: created time + (hours * 60 minutes * 60 seconds * 1000 milliseconds)
        const deleteDate = new Date(message.fileCreated + (this.autoDeleteHours * 60 * 60 * 1000));
        
        timestamps.createEl("p", { 
            text: `Created: ${createdDate.toLocaleString()}`,
            cls: "timestamp-line"
        });
        timestamps.createEl("p", { 
            text: `Will be deleted: ${deleteDate.toLocaleString()}`,
            cls: "timestamp-line"
        });

        // body
        const body = container.createDiv({ cls: "pinned-message-body" });
        body.createEl("pre", { text: message.content });

        // controls container
        const controls = container.createDiv({ cls: "pinned-message-controls" });

        // previous button
        const prevButton = controls.createEl("button", { text: "← Previous" });
        prevButton.onclick = () => {
            if (this.index > 0) {
                this.index--;
                this.renderMessage(container);
            }
        };	
        
        // next button
        const nextButton = controls.createEl("button", { text: "Next →" });
        nextButton.disabled = this.index === this.messages.length - 1;
        nextButton.onclick = () => {
            this.index++;
            this.renderMessage(container);
        };

        // open button
        const openButton = controls.createEl("button", { text: "Open Message" });
        openButton.onclick = () => {
            const file = this.app.vault.getAbstractFileByPath(message.path);
            if (file instanceof TFile) {
                this.app.workspace.getLeaf().openFile(file);
            }
        };

    }
}

// Helper function to initialize popup window feature
export function initializePopupWindow(plugin: Plugin, settings?: any, saveSettings?: () => Promise<void>) {
    // Merge settings with defaults
    const popupSettings: PinnedMessagesSettings = Object.assign(
        {},
        DEFAULT_SETTINGS,
        settings?.popupWindow || {}
    );

    // Helper function to load messages
    const loadMessages = async (): Promise<PinnedMessage[]> => {
        const folderPath = popupSettings.messagesFolder.replace(/\/+$/, "");
        const allMarkdown = plugin.app.vault.getMarkdownFiles();
        const files = allMarkdown.filter((file) =>
            file.path.startsWith(folderPath + "/")
        );

        const messages: PinnedMessage[] = [];

        for (const file of files) {
            const content = await plugin.app.vault.cachedRead(file);
            messages.push({
                title: file.basename,
                content,
                path: file.path,
                fileCreated: file.stat.ctime,
            });
        }

        messages.sort((a, b) => a.title.localeCompare(b.title));
        return messages;
    };

    // Helper function to delete expired messages
    const deleteExpiredMessages = async () => {
        if (!popupSettings.autoDeleteEnabled) {
            return;
        }

        const folderPath = popupSettings.messagesFolder.replace(/\/+$/, "");
        const allMarkdown = plugin.app.vault.getMarkdownFiles();
        const files = allMarkdown.filter((file) =>
            file.path.startsWith(folderPath + "/")
        );

        const now = Date.now();
        const expirationTime = popupSettings.autoDeleteHours * 60 * 60 * 1000; // Convert hours to milliseconds
        let deletedCount = 0;

        for (const file of files) {
            const age = now - file.stat.ctime;
            if (age > expirationTime) {
                await plugin.app.vault.delete(file);
                deletedCount++;
            }
        }

        if (deletedCount > 0) {
            new Notice(`Auto-deleted ${deletedCount} expired message(s)`);
        }
    };

    // Helper function to show messages
    const showMessages = async () => {
        // Clean up expired messages before showing
        await deleteExpiredMessages();
        
        const messages = await loadMessages();

        if (messages.length === 0) {
            new Notice("No pinned messages found.");
            return;
        }

        new PinnedMessagesModal(plugin.app, messages, popupSettings.autoDeleteHours).open();
    };

    // Add command to open pinned messages
    plugin.addCommand({
        id: "open-pinned-messages",
        name: "Open Pinned Messages",
        callback: () => {
            showMessages();
        },
    });

    // Auto show on startup if enabled
    if (popupSettings.showOnStartup) {
        plugin.app.workspace.onLayoutReady(() => {
            showMessages();
        });
    } else if (popupSettings.autoDeleteEnabled) {
        // Even if not showing on startup, still clean up expired messages
        plugin.app.workspace.onLayoutReady(() => {
            deleteExpiredMessages();
        });
    }
}