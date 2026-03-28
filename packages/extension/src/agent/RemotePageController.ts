/**
 * RemotePageController — controls a page via message-passing to the content script.
 *
 * The extension agent runs in the background service worker, but needs to
 * interact with the DOM which lives in the content script context.
 * This class sends messages to the content script and awaits responses.
 *
 * Pattern: Proxy (remote access via messages), Adapter (same interface as PageController)
 */

import type { BrowserState } from '@webmind/page-controller'

export interface RemoteAction {
	type: string
	[key: string]: unknown
}

export interface RemoteActionResult {
	success: boolean
	data?: unknown
	error?: string
}

export class RemotePageController {
	constructor(private readonly tabId: number) {}

	async updateTree(): Promise<string> {
		const result = await this.sendAction({ type: 'updateTree' })
		return (result.data as string) ?? ''
	}

	async getBrowserState(): Promise<BrowserState> {
		const result = await this.sendAction({ type: 'getBrowserState' })
		return result.data as BrowserState
	}

	async clickElement(index: number): Promise<void> {
		await this.sendAction({ type: 'clickElement', index })
	}

	async inputText(index: number, text: string): Promise<void> {
		await this.sendAction({ type: 'inputText', index, text })
	}

	async selectDropdownOption(index: number, optionText: string): Promise<void> {
		await this.sendAction({ type: 'selectDropdownOption', index, optionText })
	}

	async scroll(direction: 'up' | 'down', amount?: number, elementIndex?: number): Promise<void> {
		await this.sendAction({ type: 'scroll', direction, amount, elementIndex })
	}

	async scrollHorizontally(direction: 'left' | 'right', amount?: number): Promise<void> {
		await this.sendAction({ type: 'scrollHorizontally', direction, amount })
	}

	async executeJavaScript(code: string): Promise<unknown> {
		const result = await this.sendAction({ type: 'executeJavaScript', code })
		return result.data
	}

	async wait(seconds: number): Promise<void> {
		await this.sendAction({ type: 'wait', seconds })
	}

	async showMask(): Promise<void> {
		await this.sendAction({ type: 'showMask' })
	}

	async hideMask(): Promise<void> {
		await this.sendAction({ type: 'hideMask' })
	}

	dispose(): void {
		// No persistent resources
	}

	private async sendAction(action: RemoteAction): Promise<RemoteActionResult> {
		return new Promise((resolve) => {
			chrome.tabs.sendMessage(
				this.tabId,
				{ type: 'PAGE_CONTROL', action },
				(response: RemoteActionResult | undefined) => {
					if (chrome.runtime.lastError) {
						resolve({ success: false, error: chrome.runtime.lastError.message })
					} else {
						resolve(response ?? { success: true })
					}
				},
			)
		})
	}
}
