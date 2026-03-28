/**
 * TabsController — manages browser tabs for multi-tab automation.
 *
 * Pattern: Repository (tab state management), Observer (tab events)
 */

import { TAB_LOAD_TIMEOUT_MS } from './constants.js'

export interface TabInfo {
	id: number
	url: string
	title: string
	status: 'loading' | 'complete'
}

export class TabsController {
	private tabs: Map<number, TabInfo> = new Map()
	private activeTabId: number | null = null

	constructor() {
		chrome.tabs.onUpdated.addListener(this.handleTabUpdated.bind(this))
		chrome.tabs.onRemoved.addListener(this.handleTabRemoved.bind(this))
		chrome.tabs.onActivated.addListener(this.handleTabActivated.bind(this))
	}

	private handleTabUpdated(
		tabId: number,
		changeInfo: chrome.tabs.TabChangeInfo,
		tab: chrome.tabs.Tab,
	): void {
		if (tab.id === undefined) return
		this.tabs.set(tabId, {
			id: tabId,
			url: tab.url ?? '',
			title: tab.title ?? '',
			status: changeInfo.status === 'complete' ? 'complete' : 'loading',
		})
	}

	private handleTabRemoved(tabId: number): void {
		this.tabs.delete(tabId)
		if (this.activeTabId === tabId) {
			this.activeTabId = null
		}
	}

	private handleTabActivated(info: chrome.tabs.TabActiveInfo): void {
		this.activeTabId = info.tabId
	}

	/** Get current active tab. */
	async getActiveTab(): Promise<chrome.tabs.Tab | null> {
		const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
		return tab ?? null
	}

	/** Get all open tabs. */
	async getAllTabs(): Promise<chrome.tabs.Tab[]> {
		return chrome.tabs.query({ currentWindow: true })
	}

	/** Get a summary of all tabs as a markdown table. */
	async getTabsSummary(): Promise<string> {
		const tabs = await this.getAllTabs()
		const rows = tabs.map((t, i) =>
			`| ${i} | ${t.id} | ${(t.title ?? 'Untitled').slice(0, 40)} | ${(t.url ?? '').slice(0, 60)} |`,
		)
		return [
			'| # | ID | Title | URL |',
			'|---|----|----|-----|',
			...rows,
		].join('\n')
	}

	/** Navigate the active tab to a URL and wait for it to load. */
	async navigateTo(url: string): Promise<void> {
		const tab = await this.getActiveTab()
		if (!tab?.id) throw new Error('No active tab')

		await chrome.tabs.update(tab.id, { url })
		await this.waitForTabLoad(tab.id)
	}

	/** Open a new tab and wait for it to load. */
	async openTab(url: string): Promise<number> {
		const tab = await chrome.tabs.create({ url })
		if (!tab.id) throw new Error('Failed to create tab')
		await this.waitForTabLoad(tab.id)
		return tab.id
	}

	/** Close a tab by ID. */
	async closeTab(tabId: number): Promise<void> {
		await chrome.tabs.remove(tabId)
	}

	/** Switch to a tab by ID. */
	async switchToTab(tabId: number): Promise<void> {
		await chrome.tabs.update(tabId, { active: true })
		this.activeTabId = tabId
	}

	/** Wait for a tab to finish loading with timeout. */
	async waitForTabLoad(tabId: number): Promise<void> {
		return new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				chrome.tabs.onUpdated.removeListener(listener)
				reject(new Error(`Tab ${tabId} did not load within ${TAB_LOAD_TIMEOUT_MS}ms`))
			}, TAB_LOAD_TIMEOUT_MS)

			function listener(
				updatedTabId: number,
				changeInfo: chrome.tabs.TabChangeInfo,
			): void {
				if (updatedTabId === tabId && changeInfo.status === 'complete') {
					clearTimeout(timeout)
					chrome.tabs.onUpdated.removeListener(listener)
					resolve()
				}
			}

			chrome.tabs.onUpdated.addListener(listener)

			// Check if already loaded
			chrome.tabs.get(tabId).then((tab) => {
				if (tab.status === 'complete') {
					clearTimeout(timeout)
					chrome.tabs.onUpdated.removeListener(listener)
					resolve()
				}
			})
		})
	}

	/** Group tabs by color for organization. */
	async groupTabs(tabIds: number[], title: string, color: chrome.tabGroups.ColorEnum): Promise<number> {
		const groupId = await chrome.tabs.group({ tabIds })
		await chrome.tabGroups.update(groupId, { title, color })
		return groupId
	}

	dispose(): void {
		chrome.tabs.onUpdated.removeListener(this.handleTabUpdated.bind(this))
		chrome.tabs.onRemoved.removeListener(this.handleTabRemoved.bind(this))
		chrome.tabs.onActivated.removeListener(this.handleTabActivated.bind(this))
	}
}
