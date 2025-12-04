import {
    App,
    Modal,
    Notice,
    Plugin,
    Setting,
    TFile,
    TextComponent,
    TextAreaComponent,
    DropdownComponent,
    moment
} from 'obsidian';
import { initializeLabDashboard } from './lab-dashboard';


// Each lab member has a name and ID
interface LabMember {
    name: string;
    id: string;  // unique identifier (initials, email, etc.)
}

// A single clock-in/out session
interface ShiftSession {
    userId: string;              // who
    clockInTime: string;        // ISO timestamp
    clockOutTime: string | null; // null if still clocked in
    handoffNote: string | null;  // their end-of-shift summary
}

// Tracks who has seen a specific popup/announcement
interface PopupAcknowledgment {
    popupId: string;
    seenBy: string[];  // list of user IDs who've seen it
    createdAt: string;
}

// Settings specific to shift handoff feature
export interface ShiftHandoffSettings {
    labMembers: LabMember[];           // all registered lab members
    currentUser: string | null;        // ID of whoever set up this Obsidian instance
    activeSessions: ShiftSession[];    // currently clocked-in people
    sessionHistory: ShiftSession[];    // past sessions
    acknowledgments: PopupAcknowledgment[];
    handoffFolder: string;             // where to save handoff notes
}

export const DEFAULT_SHIFT_SETTINGS: ShiftHandoffSettings = {
    labMembers: [],
    currentUser: null,
    activeSessions: [],
    sessionHistory: [],
    acknowledgments: [],
    handoffFolder: '_lab-handoffs'
};

// ============================================================
// MAIN INITIALIZATION FUNCTION
// This is what main.ts will call to set up the feature
// ============================================================

export function initializeShiftHandoff(
    plugin: Plugin,
    settings: any,  // the main plugin settings object
    saveSettings: () => Promise<void>
) {
    // Ensure our settings exist (merge defaults if missing)
    // This is like: settings.shiftHandoff = settings.shiftHandoff or DEFAULT_SHIFT_SETTINGS
    if (!settings.shiftHandoff) {
        settings.shiftHandoff = { ...DEFAULT_SHIFT_SETTINGS };
    }
    
    const shiftSettings: ShiftHandoffSettings = settings.shiftHandoff;

    // Initialize the Lab Dashboard sidebar view
    initializeLabDashboard(plugin, shiftSettings);

    // If no user is set, prompt them to set up their identity
    plugin.app.workspace.onLayoutReady(() => {
        if (!shiftSettings.currentUser) {
            new UserSetupModal(plugin.app, shiftSettings, saveSettings).open();
        }
    });

    // ---- COMMANDS ----
    // These show up in the command palette (Ctrl/Cmd + P)

    plugin.addCommand({
        id: 'clock-in',
        name: 'Clock in to lab',
        callback: () => clockIn(plugin, shiftSettings, saveSettings)
    });

    plugin.addCommand({
        id: 'clock-out',
        name: 'Clock out of lab',
        callback: () => {
            if (!isUserClockedIn(shiftSettings)) {
                new Notice('You are not clocked in!');
                return;
            }
            new ClockOutModal(plugin.app, plugin, shiftSettings, saveSettings).open();
        }
    });

    plugin.addCommand({
        id: 'view-whos-in',
        name: 'View who\'s currently in the lab',
        callback: () => showWhosIn(plugin, shiftSettings)
    });

    plugin.addCommand({
        id: 'view-recent-handoffs',
        name: 'View recent handoff notes',
        callback: () => new RecentHandoffsModal(plugin.app, plugin, shiftSettings).open()
    });

    plugin.addCommand({
        id: 'set-lab-identity',
        name: 'Set your lab identity',
        callback: () => new UserSetupModal(plugin.app, shiftSettings, saveSettings).open()
    });

    plugin.addCommand({
        id: 'manage-lab-members',
        name: 'Manage lab members',
        callback: () => new ManageMembersModal(plugin.app, shiftSettings, saveSettings).open()
    });

    // ---- STATUS BAR ----
    // Shows current clock-in status at bottom of Obsidian
    const statusBar = plugin.addStatusBarItem();
    updateStatusBar(statusBar, shiftSettings);

    // Update status bar periodically (every 30 seconds)
    plugin.registerInterval(
        window.setInterval(() => updateStatusBar(statusBar, shiftSettings), 30000)
    );
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

function isUserClockedIn(settings: ShiftHandoffSettings): boolean {
    if (!settings.currentUser) return false;
    return settings.activeSessions.some(s => s.userId === settings.currentUser);
}

function getCurrentUserSession(settings: ShiftHandoffSettings): ShiftSession | undefined {
    if (!settings.currentUser) return undefined;
    return settings.activeSessions.find(s => s.userId === settings.currentUser);
}

function updateStatusBar(el: HTMLElement, settings: ShiftHandoffSettings) {
    const session = getCurrentUserSession(settings);
    if (session) {
        const duration = getSessionDuration(session.clockInTime);
        el.setText(`🟢 Clocked in: ${duration}`);
        el.style.cursor = 'pointer';
        el.title = 'Click to clock out';
    } else if (settings.currentUser) {
        el.setText('⚪ Not clocked in');
        el.style.cursor = 'pointer';
        el.title = 'Click to clock in';
    } else {
        el.setText('⚠️ Set up lab identity');
    }
}

function getSessionDuration(clockInTime: string): string {
    const start = moment(clockInTime);
    const now = moment();
    const diff = moment.duration(now.diff(start));
    const hours = Math.floor(diff.asHours());
    const mins = diff.minutes();
    return `${hours}h ${mins}m`;
}

function getMemberName(settings: ShiftHandoffSettings, userId: string): string {
    const member = settings.labMembers.find(m => m.id === userId);
    return member ? member.name : userId;
}

// ============================================================
// CLOCK IN / OUT LOGIC
// ============================================================

async function clockIn(
    plugin: Plugin,
    settings: ShiftHandoffSettings,
    saveSettings: () => Promise<void>
) {
    if (!settings.currentUser) {
        new Notice('Please set up your lab identity first!');
        new UserSetupModal(plugin.app, settings, saveSettings).open();
        return;
    }

    if (isUserClockedIn(settings)) {
        new Notice('You are already clocked in!');
        return;
    }

    const session: ShiftSession = {
        userId: settings.currentUser,
        clockInTime: new Date().toISOString(),
        clockOutTime: null,
        handoffNote: null
    };

    settings.activeSessions.push(session);
    await saveSettings();

    const name = getMemberName(settings, settings.currentUser);
    new Notice(`Welcome, ${name}! You are now clocked in.`);
}

async function clockOut(
    plugin: Plugin,
    settings: ShiftHandoffSettings,
    saveSettings: () => Promise<void>,
    handoffData: HandoffFormData
) {
    const sessionIndex = settings.activeSessions.findIndex(
        s => s.userId === settings.currentUser
    );

    if (sessionIndex === -1) {
        new Notice('Error: No active session found');
        return;
    }

    const session = settings.activeSessions[sessionIndex];
    session.clockOutTime = new Date().toISOString();
    session.handoffNote = JSON.stringify(handoffData);

    // Move from active to history
    settings.activeSessions.splice(sessionIndex, 1);
    settings.sessionHistory.push(session);

    // Keep only last 100 sessions in history
    if (settings.sessionHistory.length > 100) {
        settings.sessionHistory = settings.sessionHistory.slice(-100);
    }

    // Save handoff note as a markdown file
    await saveHandoffNote(plugin, settings, session, handoffData);
    await saveSettings();

    new Notice('Clocked out! Your handoff note has been saved.');
}

// ============================================================
// HANDOFF NOTE GENERATION
// ============================================================

interface HandoffFormData {
    whatYouDid: string;
    whatsRunning: string;
    needsAttention: string;
    tagNextPerson: string;
    additionalNotes: string;
}

async function saveHandoffNote(
    plugin: Plugin,
    settings: ShiftHandoffSettings,
    session: ShiftSession,
    data: HandoffFormData
) {
    const folder = settings.handoffFolder;
    
    // Ensure folder exists
    if (!plugin.app.vault.getAbstractFileByPath(folder)) {
        await plugin.app.vault.createFolder(folder);
    }

    const userName = getMemberName(settings, session.userId);
    const date = moment(session.clockOutTime).format('YYYY-MM-DD');
    const time = moment(session.clockOutTime).format('HH-mm');
    const filename = `${folder}/${date}_${time}_${userName}.md`;

    const duration = moment(session.clockOutTime).diff(moment(session.clockInTime));
    const durationStr = moment.utc(duration).format('H[h] m[m]');

    const content = `# Shift Handoff - ${userName}
**Date:** ${moment(session.clockOutTime).format('MMMM D, YYYY')}
**Time:** ${moment(session.clockInTime).format('h:mm A')} → ${moment(session.clockOutTime).format('h:mm A')}
**Duration:** ${durationStr}

---

## What I Did
${data.whatYouDid || '_No notes_'}

## What's Currently Running
${data.whatsRunning || '_Nothing noted_'}

## Needs Attention
${data.needsAttention || '_Nothing urgent_'}

## Tagged for Next Shift
${data.tagNextPerson ? `@${data.tagNextPerson}` : '_No one tagged_'}

## Additional Notes
${data.additionalNotes || '_None_'}

---
_Generated by ELL Knowledge Builder Plugin_
`;

    await plugin.app.vault.create(filename, content);
}

// ============================================================
// MODALS (Popup windows)
// ============================================================

// --- User Setup Modal ---
// Prompts user to set their identity on first launch

class UserSetupModal extends Modal {
    settings: ShiftHandoffSettings;
    saveSettings: () => Promise<void>;

    constructor(app: App, settings: ShiftHandoffSettings, saveSettings: () => Promise<void>) {
        super(app);
        this.settings = settings;
        this.saveSettings = saveSettings;
    }

    onOpen() {
        const { contentEl, titleEl } = this;
        titleEl.setText('Set Up Your Lab Identity');
        contentEl.empty();

        contentEl.createEl('p', {
            text: 'Who are you? Select your name or add yourself to the lab roster.'
        });

        // If there are existing members, show dropdown
        if (this.settings.labMembers.length > 0) {
            new Setting(contentEl)
                .setName('Select your name')
                .addDropdown(dropdown => {
                    dropdown.addOption('', '-- Select --');
                    this.settings.labMembers.forEach(member => {
                        dropdown.addOption(member.id, member.name);
                    });
                    dropdown.onChange(async (value) => {
                        if (value) {
                            this.settings.currentUser = value;
                            await this.saveSettings();
                            new Notice(`Welcome, ${getMemberName(this.settings, value)}!`);
                            this.close();
                        }
                    });
                });

            contentEl.createEl('hr');
            contentEl.createEl('p', { text: 'Or add yourself:' });
        }

        // Add new member form
        let nameInput: TextComponent;
        let idInput: TextComponent;

        new Setting(contentEl)
            .setName('Your name')
            .addText(text => {
                nameInput = text;
                text.setPlaceholder('Jane Doe');
            });

        new Setting(contentEl)
            .setName('Your ID')
            .setDesc('Short identifier (initials, username, etc.)')
            .addText(text => {
                idInput = text;
                text.setPlaceholder('jdoe');
            });

        new Setting(contentEl)
            .addButton(btn => btn
                .setButtonText('Add me & set as current user')
                .setCta()
                .onClick(async () => {
                    const name = nameInput.getValue().trim();
                    const id = idInput.getValue().trim().toLowerCase();

                    if (!name || !id) {
                        new Notice('Please fill in both fields');
                        return;
                    }

                    if (this.settings.labMembers.some(m => m.id === id)) {
                        new Notice('That ID is already taken');
                        return;
                    }

                    this.settings.labMembers.push({ name, id });
                    this.settings.currentUser = id;
                    await this.saveSettings();

                    new Notice(`Welcome to the lab, ${name}!`);
                    this.close();
                }));
    }

    onClose() {
        this.contentEl.empty();
    }
}

// --- Clock Out Modal ---
// The end-of-shift handoff form

class ClockOutModal extends Modal {
    plugin: Plugin;
    settings: ShiftHandoffSettings;
    saveSettings: () => Promise<void>;

    constructor(
        app: App,
        plugin: Plugin,
        settings: ShiftHandoffSettings,
        saveSettings: () => Promise<void>
    ) {
        super(app);
        this.plugin = plugin;
        this.settings = settings;
        this.saveSettings = saveSettings;
    }

    onOpen() {
        const { contentEl, titleEl } = this;
        const session = getCurrentUserSession(this.settings);
        const duration = session ? getSessionDuration(session.clockInTime) : '??';

        titleEl.setText('End of Shift Handoff');
        contentEl.empty();
        contentEl.addClass('shift-handoff-modal');

        contentEl.createEl('p', {
            text: `You've been clocked in for ${duration}. Fill out your handoff notes:`
        });

        const formData: HandoffFormData = {
            whatYouDid: '',
            whatsRunning: '',
            needsAttention: '',
            tagNextPerson: '',
            additionalNotes: ''
        };

        // What you did
        contentEl.createEl('h4', { text: '📝 What did you work on?' });
        new Setting(contentEl)
            .addTextArea(text => {
                text.setPlaceholder('Describe what you accomplished...');
                text.inputEl.rows = 3;
                text.inputEl.style.width = '100%';
                text.onChange(val => formData.whatYouDid = val);
            });

        // What's running
        contentEl.createEl('h4', { text: '⚙️ What\'s currently running?' });
        new Setting(contentEl)
            .addTextArea(text => {
                text.setPlaceholder('Any experiments, processes, or tasks in progress...');
                text.inputEl.rows = 2;
                text.inputEl.style.width = '100%';
                text.onChange(val => formData.whatsRunning = val);
            });

        // Needs attention
        contentEl.createEl('h4', { text: '⚠️ What needs attention?' });
        new Setting(contentEl)
            .addTextArea(text => {
                text.setPlaceholder('Anything urgent or important for the next person...');
                text.inputEl.rows = 2;
                text.inputEl.style.width = '100%';
                text.onChange(val => formData.needsAttention = val);
            });

        // Tag next person
        contentEl.createEl('h4', { text: '👤 Tag the next person' });
        new Setting(contentEl)
            .addDropdown(dropdown => {
                dropdown.addOption('', '-- Optional --');
                this.settings.labMembers.forEach(member => {
                    if (member.id !== this.settings.currentUser) {
                        dropdown.addOption(member.id, member.name);
                    }
                });
                dropdown.onChange(val => formData.tagNextPerson = val);
            });

        // Additional notes
        contentEl.createEl('h4', { text: '📎 Additional notes' });
        new Setting(contentEl)
            .addTextArea(text => {
                text.setPlaceholder('Anything else...');
                text.inputEl.rows = 2;
                text.inputEl.style.width = '100%';
                text.onChange(val => formData.additionalNotes = val);
            });

        // Submit button
        new Setting(contentEl)
            .addButton(btn => btn
                .setButtonText('Clock Out & Save Handoff')
                .setCta()
                .onClick(async () => {
                    await clockOut(this.plugin, this.settings, this.saveSettings, formData);
                    this.close();
                }))
            .addButton(btn => btn
                .setButtonText('Cancel')
                .onClick(() => this.close()));
    }

    onClose() {
        this.contentEl.empty();
    }
}

// --- Who's In Modal ---
// Shows currently clocked-in lab members

function showWhosIn(plugin: Plugin, settings: ShiftHandoffSettings) {
    const active = settings.activeSessions;

    if (active.length === 0) {
        new Notice('No one is currently clocked in');
        return;
    }

    const names = active.map(s => {
        const name = getMemberName(settings, s.userId);
        const duration = getSessionDuration(s.clockInTime);
        return `${name} (${duration})`;
    }).join('\n');

    new Notice(`Currently in the lab:\n${names}`, 5000);
}

// --- Recent Handoffs Modal ---
// Shows recent handoff notes

class RecentHandoffsModal extends Modal {
    plugin: Plugin;
    settings: ShiftHandoffSettings;

    constructor(app: App, plugin: Plugin, settings: ShiftHandoffSettings) {
        super(app);
        this.plugin = plugin;
        this.settings = settings;
    }

    async onOpen() {
        const { contentEl, titleEl } = this;
        titleEl.setText('Recent Handoffs');
        contentEl.empty();

        // Get handoff files
        const folder = this.settings.handoffFolder;
        const files = this.plugin.app.vault.getMarkdownFiles()
            .filter(f => f.path.startsWith(folder + '/'))
            .sort((a, b) => b.stat.mtime - a.stat.mtime)
            .slice(0, 10);

        if (files.length === 0) {
            contentEl.createEl('p', { text: 'No handoff notes yet.' });
            return;
        }

        for (const file of files) {
            const content = await this.plugin.app.vault.cachedRead(file);
            const preview = content.slice(0, 300) + '...';

            const item = contentEl.createDiv({ cls: 'handoff-item' });
            item.createEl('h4', { text: file.basename });
            item.createEl('p', { text: preview, cls: 'handoff-preview' });

            item.addEventListener('click', () => {
                this.plugin.app.workspace.getLeaf().openFile(file);
                this.close();
            });
        }
    }

    onClose() {
        this.contentEl.empty();
    }
}

// --- Manage Members Modal ---
// Add/remove lab members

class ManageMembersModal extends Modal {
    settings: ShiftHandoffSettings;
    saveSettings: () => Promise<void>;

    constructor(app: App, settings: ShiftHandoffSettings, saveSettings: () => Promise<void>) {
        super(app);
        this.settings = settings;
        this.saveSettings = saveSettings;
    }

    onOpen() {
        const { contentEl, titleEl } = this;
        titleEl.setText('Manage Lab Members');
        this.render();
    }

    render() {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl('h4', { text: 'Current Members' });

        if (this.settings.labMembers.length === 0) {
            contentEl.createEl('p', { text: 'No members yet.' });
        } else {
            this.settings.labMembers.forEach((member, index) => {
                new Setting(contentEl)
                    .setName(member.name)
                    .setDesc(`ID: ${member.id}`)
                    .addButton(btn => btn
                        .setButtonText('Remove')
                        .setWarning()
                        .onClick(async () => {
                            this.settings.labMembers.splice(index, 1);
                            if (this.settings.currentUser === member.id) {
                                this.settings.currentUser = null;
                            }
                            await this.saveSettings();
                            this.render();
                        }));
            });
        }

        contentEl.createEl('hr');
        contentEl.createEl('h4', { text: 'Add New Member' });

        let nameInput: TextComponent;
        let idInput: TextComponent;

        new Setting(contentEl)
            .setName('Name')
            .addText(text => {
                nameInput = text;
                text.setPlaceholder('Jane Doe');
            });

        new Setting(contentEl)
            .setName('ID')
            .addText(text => {
                idInput = text;
                text.setPlaceholder('jdoe');
            });

        new Setting(contentEl)
            .addButton(btn => btn
                .setButtonText('Add Member')
                .setCta()
                .onClick(async () => {
                    const name = nameInput.getValue().trim();
                    const id = idInput.getValue().trim().toLowerCase();

                    if (!name || !id) {
                        new Notice('Please fill in both fields');
                        return;
                    }

                    if (this.settings.labMembers.some(m => m.id === id)) {
                        new Notice('That ID already exists');
                        return;
                    }

                    this.settings.labMembers.push({ name, id });
                    await this.saveSettings();
                    new Notice(`Added ${name}`);
                    this.render();
                }));
    }

    onClose() {
        this.contentEl.empty();
    }
}