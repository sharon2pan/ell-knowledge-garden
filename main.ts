import {
	App,
	Modal,
	Notice,
	Plugin,
	TFile,
	MarkdownRenderer, 
	Component,
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

	private async renderMessage(container: HTMLElement) {
	container.empty();

	const message = this.messages[this.index];

	// body (render markdown so [[links]] work)
	const body = container.createDiv({ cls: "pinned-message-body" });

	// create a small Component just for markdown rendering
	const mdComponent = new Component();

	// decided to use markdown renderer so we can have links in the actual note
	await MarkdownRenderer.render(
		this.app,
		message.content,   // markdown text
		body,              // container element
		message.path,      // source path so [[links]] resolve correctly
		mdComponent        // component context for event handling
	);

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
		if (this.index < this.messages.length - 1) {
			this.index++;
			this.renderMessage(container);
		}
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













