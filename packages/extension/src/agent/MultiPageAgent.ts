/**
 * MultiPageAgent — extends WebMindCore for multi-tab browser extension context.
 *
 * Replaces the in-page PageController with a RemotePageController that
 * communicates via Chrome extension message passing.
 *
 * Also manages:
 * - Tab lifecycle (loading verification per step)
 * - Heartbeat to keep service worker alive
 * - Hub WebSocket connection for MCP control
 */

import { WebMindCore } from '@webmind/core'
import type { AgentConfig, ExecutionResult } from '@webmind/core'
import type { ToolCall } from '@webmind/llms'
import type { LLMMessage } from '@webmind/llms'
import { HEARTBEAT_INTERVAL_MS } from './constants.js'
import { TabsController } from './TabsController.js'
import { RemotePageController } from './RemotePageController.js'

export interface MultiPageAgentConfig extends AgentConfig {
	tabId?: number
}

export class MultiPageAgent extends WebMindCore {
	private readonly tabsController: TabsController
	private readonly remoteController: RemotePageController
	private heartbeatInterval: ReturnType<typeof setInterval> | null = null

	constructor(config: MultiPageAgentConfig) {
		super(config)
		this.tabsController = new TabsController()

		const tabId = config.tabId ?? 0
		this.remoteController = new RemotePageController(tabId)

		this.startHeartbeat()
	}

	// Override executeTool to use RemotePageController
	protected override async executeTool(
		toolCall: ToolCall,
		messages: LLMMessage[],
	): Promise<string> {
		const { name, arguments: args } = toolCall

		// Verify tab still exists before each action
		await this.verifyTabLoaded()

		try {
			switch (name) {
				case 'click_element_by_index':
					await this.remoteController.clickElement(Number(args.index))
					return 'Clicked element successfully'

				case 'input_text':
					await this.remoteController.inputText(Number(args.index), String(args.text))
					return 'Text entered successfully'

				case 'select_dropdown_option':
					await this.remoteController.selectDropdownOption(
						Number(args.index),
						String(args.option_text),
					)
					return 'Option selected successfully'

				case 'scroll':
					await this.remoteController.scroll(
						args.direction as 'up' | 'down',
						typeof args.amount === 'number' ? args.amount : undefined,
						typeof args.element_index === 'number' ? args.element_index : undefined,
					)
					return 'Scrolled successfully'

				case 'scroll_horizontally':
					await this.remoteController.scrollHorizontally(
						args.direction as 'left' | 'right',
						typeof args.amount === 'number' ? args.amount : undefined,
					)
					return 'Scrolled horizontally'

				case 'execute_javascript': {
					const result = await this.remoteController.executeJavaScript(String(args.code))
					return result !== undefined ? String(result) : 'JavaScript executed'
				}

				case 'wait':
					await this.remoteController.wait(Number(args.seconds))
					return `Waited ${args.seconds} second(s)`

				case 'open_tab': {
					const tabId = await this.tabsController.openTab(String(args.url))
					return `Opened tab ${tabId}`
				}

				case 'close_tab':
					await this.tabsController.closeTab(Number(args.tab_id))
					return 'Tab closed'

				case 'switch_tab':
					await this.tabsController.switchToTab(Number(args.tab_id))
					return 'Switched to tab'

				case 'get_tabs':
					return await this.tabsController.getTabsSummary()

				case 'ask_user': {
					const question = String(args.question)
					const answer = await this.waitForUserAnswerFromSidePanel(question)
					return answer
				}

				case 'done':
					return String(args.message ?? 'Task complete')

				default:
					// Fallback to base implementation
					return super.executeTool(toolCall, messages)
			}
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err)
			return `Error executing ${name}: ${msg}`
		}
	}

	override async run(task: string): Promise<ExecutionResult> {
		await this.remoteController.showMask()
		try {
			return await super.run(task)
		} finally {
			await this.remoteController.hideMask()
		}
	}

	override dispose(): void {
		this.stopHeartbeat()
		this.remoteController.dispose()
		this.tabsController.dispose()
		super.dispose()
	}

	// ─── Private ────────────────────────────────────────────────────────────────

	private async verifyTabLoaded(): Promise<void> {
		const tab = await this.tabsController.getActiveTab()
		if (!tab) throw new Error('No active tab available')
		if (tab.status === 'loading') {
			// Wait for tab to finish loading
			if (tab.id) await this.tabsController.waitForTabLoad(tab.id)
		}
	}

	private startHeartbeat(): void {
		// Keep service worker alive with periodic chrome API calls
		this.heartbeatInterval = setInterval(() => {
			chrome.runtime.getPlatformInfo(() => {
				// No-op — just keeps the service worker alive
			})
		}, HEARTBEAT_INTERVAL_MS)
	}

	private stopHeartbeat(): void {
		if (this.heartbeatInterval) {
			clearInterval(this.heartbeatInterval)
			this.heartbeatInterval = null
		}
	}

	private async waitForUserAnswerFromSidePanel(question: string): Promise<string> {
		return new Promise((resolve) => {
			// Send question to side panel
			chrome.runtime.sendMessage({ type: 'ASK_USER', question })

			// Listen for answer
			const listener = (msg: { type: string; answer: string }) => {
				if (msg.type === 'USER_ANSWER') {
					chrome.runtime.onMessage.removeListener(listener)
					resolve(msg.answer)
				}
			}
			chrome.runtime.onMessage.addListener(listener)
		})
	}
}
