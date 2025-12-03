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
        // Calculate deletion time: created time + (hours * 60 minutes * 60 seconds * 1000 milliseconds)
        const deleteDate = new Date(message.fileCreated + (this.autoDeleteHours * 60 * 60 * 1000));
        
        timestamps.createEl("p", { 
            text: `Expiring On: ${deleteDate.toLocaleString()}`,
            cls: "timestamp-line"
        });

        // body
        const body = container.createDiv({ cls: "pinned-message-body" });
        const pre = body.createEl("pre", { text: message.content });
        
        // Ensure text wraps and stays within bounds
        pre.style.whiteSpace = "pre-wrap";
        pre.style.wordWrap = "break-word";
        pre.style.overflowWrap = "break-word";
        pre.style.maxWidth = "100%";
        pre.style.overflow = "auto";

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
            console.log("Opening file:", message.path);
            const file = this.app.vault.getAbstractFileByPath(message.path);
            if (file instanceof TFile) {
                this.app.workspace.getLeaf().openFile(file);
            }
        };

        // mark as seen button
        const markAsSeenButton = controls.createEl("button", { text: "Mark as Seen" });
        markAsSeenButton.onclick = async () => {
            // Path to the template file
            const templatePath = "Have you seen this popup?.md";
            const templateFile = this.app.vault.getAbstractFileByPath(templatePath);
            
            if (!(templateFile instanceof TFile)) {
                new Notice("Template file 'Have you seen this popup?.md' not found.");
                return;
            }
            
            // Read the template content
            const templateContent = await this.app.vault.read(templateFile);
            
            // Create a copy with timestamp
            const seenFolderPath = "SeenMessages";
            const currentMessageTitle = message.title.replace(/[/\\?%*:|"<>]/g, '-'); // sanitize title for filename
            const newPath = `${seenFolderPath}/${currentMessageTitle}.md`;
            
            // Create the SeenMessages folder if it doesn't exist
            const seenFolder = this.app.vault.getAbstractFileByPath(seenFolderPath);
            if (!seenFolder) {
                await this.app.vault.createFolder(seenFolderPath);
            }
            
            const seenFile = this.app.vault.getAbstractFileByPath(newPath);
            if (!seenFile) {
                // Add a link to the current message at the beginning of the template
                const linkToMessage = `Link to message: [[${message.path}|${message.title}]]\n\n`;
                const fileContent = linkToMessage + templateContent;
                
                // Create the copy of the template
                await this.app.vault.create(newPath, fileContent);
            }

            if (seenFile instanceof TFile) {
                this.app.workspace.getLeaf().openFile(seenFile);
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
                const seenFile = plugin.app.vault.getAbstractFileByPath(`SeenMessages/${file.basename}.md`);
                await plugin.app.vault.delete(file);
                if (seenFile) await plugin.app.vault.delete(seenFile);
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