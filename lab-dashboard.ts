import {
    ItemView,
    WorkspaceLeaf,
    Plugin,
    moment
} from 'obsidian';

import { ShiftHandoffSettings } from './shift-handoff';

const VIEW_TYPE_LAB_DASHBOARD = 'lab-dashboard-view';

interface MemberStats {
    odentifier: string;
    name: string;
    totalTimeMs: number;
    sessionCount: number;
    lastActive: string | null;
    currentlyIn: boolean;
    currentSessionStart: string | null;
}

class LabDashboardView extends ItemView {
    plugin: Plugin;
    settings: ShiftHandoffSettings;
    refreshInterval: number;

    constructor(leaf: WorkspaceLeaf, plugin: Plugin, settings: ShiftHandoffSettings) {
        super(leaf);
        this.plugin = plugin;
        this.settings = settings;
    }

    getViewType(): string {
        return VIEW_TYPE_LAB_DASHBOARD;
    }

    getDisplayText(): string {
        return 'Lab Dashboard';
    }

    getIcon(): string {
        return 'users';
    }

    async onOpen() {
        this.render();
        this.refreshInterval = window.setInterval(() => {
            this.render();
        }, 30000);
    }

    async onClose() {
        if (this.refreshInterval) {
            window.clearInterval(this.refreshInterval);
        }
    }

    calculateStats(): MemberStats[] {
        const stats: Map<string, MemberStats> = new Map();

        for (const member of this.settings.labMembers) {
            stats.set(member.id, {
                odentifier: member.id,
                name: member.name,
                totalTimeMs: 0,
                sessionCount: 0,
                lastActive: null,
                currentlyIn: false,
                currentSessionStart: null
            });
        }

        for (const session of this.settings.sessionHistory) {
            let memberStats = stats.get(session.userId);
            
            if (!memberStats) {
                memberStats = {
                    odentifier: session.userId,
                    name: session.userId,
                    totalTimeMs: 0,
                    sessionCount: 0,
                    lastActive: null,
                    currentlyIn: false,
                    currentSessionStart: null
                };
                stats.set(session.userId, memberStats);
            }

            if (session.clockOutTime) {
                const duration = moment(session.clockOutTime).diff(moment(session.clockInTime));
                memberStats.totalTimeMs += duration;
                memberStats.sessionCount += 1;

                if (!memberStats.lastActive || session.clockOutTime > memberStats.lastActive) {
                    memberStats.lastActive = session.clockOutTime;
                }
            }
        }

        for (const session of this.settings.activeSessions) {
            let memberStats = stats.get(session.userId);
            
            if (!memberStats) {
                memberStats = {
                    odentifier: session.userId,
                    name: session.userId,
                    totalTimeMs: 0,
                    sessionCount: 0,
                    lastActive: null,
                    currentlyIn: false,
                    currentSessionStart: null
                };
                stats.set(session.userId, memberStats);
            }

            memberStats.currentlyIn = true;
            memberStats.currentSessionStart = session.clockInTime;
            const currentDuration = moment().diff(moment(session.clockInTime));
            memberStats.totalTimeMs += currentDuration;
        }

        return Array.from(stats.values()).sort((a, b) => b.totalTimeMs - a.totalTimeMs);
    }

    formatDuration(ms: number): string {
        const duration = moment.duration(ms);
        const hours = Math.floor(duration.asHours());
        const mins = duration.minutes();
        if (hours === 0) return `${mins}m`;
        return `${hours}h ${mins}m`;
    }

    formatRelativeTime(isoString: string): string {
        return moment(isoString).fromNow();
    }

    render() {
        const container = this.containerEl.children[1];
        container.empty();
        container.addClass('lab-dashboard-container');

        const header = container.createDiv({ cls: 'lab-dashboard-header' });
        header.createEl('h4', { text: 'Lab Dashboard' });

        const activeSection = container.createDiv({ cls: 'lab-dashboard-section' });
        activeSection.createEl('h5', { text: '🟢 Currently In' });

        if (this.settings.activeSessions.length === 0) {
            activeSection.createDiv({ cls: 'lab-dashboard-empty', text: 'No one is clocked in' });
        } else {
            const activeList = activeSection.createDiv({ cls: 'lab-dashboard-active-list' });
            for (const session of this.settings.activeSessions) {
                const member = this.settings.labMembers.find(m => m.id === session.userId);
                const name = member ? member.name : session.userId;
                const duration = this.formatDuration(moment().diff(moment(session.clockInTime)));
                const item = activeList.createDiv({ cls: 'lab-dashboard-active-item' });
                item.createSpan({ cls: 'lab-dashboard-name', text: name });
                item.createSpan({ cls: 'lab-dashboard-time', text: duration });
            }
        }

        const statsSection = container.createDiv({ cls: 'lab-dashboard-section' });
        statsSection.createEl('h5', { text: '📊 All Time Stats' });
        const allStats = this.calculateStats();

        if (allStats.length === 0) {
            statsSection.createDiv({ cls: 'lab-dashboard-empty', text: 'No lab members yet' });
        } else {
            const statsTable = statsSection.createDiv({ cls: 'lab-dashboard-stats' });
            for (const stat of allStats) {
                const row = statsTable.createDiv({ cls: 'lab-dashboard-stat-row' });
                row.createSpan({ cls: 'lab-dashboard-status', text: stat.currentlyIn ? '🟢' : '⚪' });
                row.createSpan({ cls: 'lab-dashboard-name', text: stat.name });
                row.createSpan({ cls: 'lab-dashboard-total', text: this.formatDuration(stat.totalTimeMs) });
                const count = stat.sessionCount + (stat.currentlyIn ? 1 : 0);
                row.createSpan({ cls: 'lab-dashboard-sessions', text: `${count} shift${count !== 1 ? 's' : ''}` });
            }
        }
    }
}

export function initializeLabDashboard(plugin: Plugin, settings: ShiftHandoffSettings) {
    plugin.registerView(VIEW_TYPE_LAB_DASHBOARD, (leaf) => new LabDashboardView(leaf, plugin, settings));

    plugin.addCommand({
        id: 'open-lab-dashboard',
        name: 'Open lab dashboard',
        callback: () => {
            const { workspace } = plugin.app;
            let leaf = workspace.getLeavesOfType(VIEW_TYPE_LAB_DASHBOARD)[0];
            if (!leaf) {
                leaf = workspace.getRightLeaf(false)!;
                leaf.setViewState({ type: VIEW_TYPE_LAB_DASHBOARD, active: true });
            }
            workspace.revealLeaf(leaf);
        }
    });
}

export { VIEW_TYPE_LAB_DASHBOARD };