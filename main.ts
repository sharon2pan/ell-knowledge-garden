import { Plugin } from 'obsidian';
import { initializePinnedNotes } from './pinned-notes';
import { initializePopupWindow } from './popup-window';
import { initializeShiftHandoff } from './shift-handoff';
import { ELLKnowledgeBuilderPluginSettings, DEFAULT_SETTINGS, ELLKnowledgeBuilderPluginSettingsTab } from './settings';

export default class MyPlugin extends Plugin {
	settings: ELLKnowledgeBuilderPluginSettings;

	async onload() {
		await this.loadSettings();

		// Initialize pinned notes feature
		initializePinnedNotes(this, this.settings, this.saveSettings.bind(this));

		// Initialize popup window feature
		initializePopupWindow(this, this.settings, this.saveSettings.bind(this));

		// Initialize shift handoff feature
		initializeShiftHandoff(this, this.settings, this.saveSettings.bind(this));

		this.addSettingTab(new ELLKnowledgeBuilderPluginSettingsTab(this.app, this));
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}