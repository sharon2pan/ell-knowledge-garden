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
}

const DEFAULT_SETTINGS: PinnedMessagesSettings = {
    messagesFolder: "PinnedMessages",
    showOnStartup: true,
};

interface PinnedMessage {
    title: string;
    content: string;
    path: string;
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
} // end of plugin class

// modal class (the popup window)

class PinnedMessagesModal extends Modal {
    private messages: PinnedMessage[];
    private index: number;

    constructor(app: App, messages: PinnedMessage[]) {
        super(app);
        this.messages = messages;
        this.index = 0;
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
            });
        }

        messages.sort((a, b) => a.title.localeCompare(b.title));
        return messages;
    };

    // Helper function to show messages
    const showMessages = async () => {
        const messages = await loadMessages();

        if (messages.length === 0) {
            new Notice("No pinned messages found.");
            return;
        }

        new PinnedMessagesModal(plugin.app, messages).open();
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
    }
}