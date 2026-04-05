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
 * - CDP signal capture tools (get_network_logs, get_ws_messages, get_console_logs)
 */

import { z } from 'zod'
import { WebMindCore } from '@webmind/core'
import type { AgentConfig, ExecutionResult } from '@webmind/core'
import type { ToolCall, ToolDefinition } from '@webmind/llms'
import type { LLMMessage } from '@webmind/llms'
import { HEARTBEAT_INTERVAL_MS } from './constants.js'
import { TabsController } from './TabsController.js'
import { RemotePageController } from './RemotePageController.js'
import type { BrowserSignals, ConsoleSignalEvent, ErrorSignalEvent, NetworkSignalEvent } from '../signals/index.js'
import { emptySignals } from '../signals/index.js'
import type { GetSignalsMessage } from '../types/messages.js'

export interface MultiPageAgentConfig extends AgentConfig {
	tabId?: number
}

// ─── Signal Tools ──────────────────────────────────────────────────────────────

const SIGNAL_TOOLS: ToolDefinition[] = [
	{
		name: 'get_network_logs',
		description: 'Get captured HTTP/HTTPS network requests made by the page. Use to inspect API calls, see what endpoints the page is hitting, check request or response data, diagnose failed requests.',
		schema: z.object({
			url_filter: z.string().optional().describe('Filter by URL substring (e.g. "/api/", "graphql")'),
			method: z.string().optional().describe('Filter by HTTP method (GET, POST, PUT, DELETE, PATCH)'),
			status: z.number().optional().describe('Filter by HTTP status code (e.g. 401, 500)'),
			limit: z.number().min(1).max(50).optional().describe('Max results to return (default 20)'),
		}),
	},
	{
		name: 'get_ws_messages',
		description: 'Get captured WebSocket messages. Use to inspect real-time data, chat payloads, live price updates, or streaming API messages.',
		schema: z.object({
			url_filter: z.string().optional().describe('Filter by WebSocket URL substring'),
			direction: z.enum(['send', 'receive']).optional().describe('Filter by message direction'),
			limit: z.number().min(1).max(50).optional().describe('Max results to return (default 20)'),
		}),
	},
	{
		name: 'get_console_logs',
		description: 'Get browser console output and JavaScript errors. Use to diagnose bugs, see logged application state, or inspect thrown exceptions.',
		schema: z.object({
			level: z.enum(['log', 'warn', 'error', 'info', 'debug']).optional().describe('Filter by console level'),
			limit: z.number().min(1).max(50).optional().describe('Max results to return (default 20)'),
		}),
	},
]

// ─── MultiPageAgent ────────────────────────────────────────────────────────────

export class MultiPageAgent extends WebMindCore {
	private readonly tabsController: TabsController
	private readonly remoteController: RemotePageController
	private readonly tabId: number
	private heartbeatInterval: ReturnType<typeof setInterval> | null = null

	constructor(config: MultiPageAgentConfig) {
		// Merge signal tools into customTools so the LLM knows about them
		super({
			...config,
			customTools: [...(config.customTools ?? []), ...SIGNAL_TOOLS],
		})
		this.tabsController = new TabsController()
		this.tabId = config.tabId ?? 0
		this.remoteController = new RemotePageController(this.tabId)
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

				// ─── Signal tools ────────────────────────────────────────────────
				case 'get_network_logs':
				case 'get_ws_messages':
				case 'get_console_logs': {
					const signals = await this.fetchSignals()
					return formatSignals(name, signals, args)
				}

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

	/** Request captured signals from the background service worker. */
	private fetchSignals(): Promise<BrowserSignals> {
		return new Promise((resolve) => {
			const msg: GetSignalsMessage = { type: 'GET_SIGNALS', tabId: this.tabId }
			chrome.runtime.sendMessage(msg, (res) => {
				void chrome.runtime.lastError // suppress unchecked error
				resolve((res as { signals: BrowserSignals } | undefined)?.signals ?? emptySignals())
			})
		})
	}
}

// ─── Signal formatting helpers ─────────────────────────────────────────────────

function formatSignals(
	toolName: string,
	signals: BrowserSignals,
	args: Record<string, unknown>,
): string {
	switch (toolName) {
		case 'get_network_logs':
			return formatNetworkLogs(signals.network, args)
		case 'get_ws_messages':
			return formatWsMessages(signals.websocket, args)
		case 'get_console_logs':
			return formatConsoleLogs(signals.console, signals.errors, args)
		default:
			return ''
	}
}

function formatNetworkLogs(
	items: NetworkSignalEvent[],
	args: Record<string, unknown>,
): string {
	let filtered = items

	if (args.url_filter) {
		const filter = String(args.url_filter).toLowerCase()
		filtered = filtered.filter((e) => e.url.toLowerCase().includes(filter))
	}
	if (args.method) {
		const method = String(args.method).toUpperCase()
		filtered = filtered.filter((e) => e.method.toUpperCase() === method)
	}
	if (typeof args.status === 'number') {
		filtered = filtered.filter((e) => e.status === args.status)
	}

	const limit = typeof args.limit === 'number' ? args.limit : 20
	filtered = filtered.slice(-limit)

	if (filtered.length === 0) return 'No network requests captured yet.'

	return filtered
		.map((e) => {
			const durationStr = e.duration >= 0 ? `${e.duration}ms` : 'pending'
			let out = `[${e.method}] ${e.url}\n  Status: ${e.status || '(pending)'} | Duration: ${durationStr}`
			if (e.requestBody) out += `\n  Request body: ${e.requestBody.slice(0, 300)}`
			if (e.responseBody) out += `\n  Response: ${e.responseBody.slice(0, 500)}`
			return out
		})
		.join('\n\n')
}

function formatWsMessages(
	items: import('../signals/index.js').WebSocketSignalEvent[],
	args: Record<string, unknown>,
): string {
	let filtered = items

	if (args.url_filter) {
		const filter = String(args.url_filter).toLowerCase()
		filtered = filtered.filter((e) => e.url.toLowerCase().includes(filter))
	}
	if (args.direction) {
		filtered = filtered.filter((e) => e.direction === args.direction)
	}

	const limit = typeof args.limit === 'number' ? args.limit : 20
	filtered = filtered.slice(-limit)

	if (filtered.length === 0) return 'No WebSocket messages captured yet.'

	return filtered
		.map((e) => `[${e.direction.toUpperCase()}] ${e.url}\n  ${e.payload.slice(0, 500)}`)
		.join('\n\n')
}

function formatConsoleLogs(
	consoleItems: ConsoleSignalEvent[],
	errorItems: ErrorSignalEvent[],
	args: Record<string, unknown>,
): string {
	let filteredConsole = consoleItems
	let filteredErrors = errorItems

	if (args.level) {
		const level = String(args.level)
		filteredConsole = filteredConsole.filter((e) => e.level === level)
		// Only include JS errors if level is 'error' or unfiltered
		if (level !== 'error') filteredErrors = []
	}

	const limit = typeof args.limit === 'number' ? args.limit : 20

	const combined: Array<ConsoleSignalEvent | ErrorSignalEvent> = [
		...filteredConsole,
		...filteredErrors,
	].sort((a, b) => a.timestamp - b.timestamp).slice(-limit)

	if (combined.length === 0) return 'No console output captured yet.'

	return combined
		.map((e) => {
			if (e.type === 'console') {
				const ce = e as ConsoleSignalEvent
				return `[${ce.level.toUpperCase()}] ${ce.message}`
			}
			const ee = e as ErrorSignalEvent
			return `[JS ERROR] ${ee.message}${ee.stack ? '\n' + ee.stack : ''}`
		})
		.join('\n')
}
