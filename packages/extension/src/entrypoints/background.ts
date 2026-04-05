/**
 * Background Service Worker — extension orchestration hub.
 *
 * Responsibilities:
 * - Tab management and lifecycle events
 * - UUID auth token generation per tab
 * - Message routing between sidepanel ↔ content scripts
 * - WebSocket connection to MCP hub server
 * - Side panel UI management
 * - CDP signal capture via chrome.debugger (network, websocket, console, errors)
 */

import type { ExecuteTaskMessage, StopTaskMessage } from '../types/messages.js'
import type { HubInboundMessage, HubResultMessage, HubErrorMessage, HubStatusChangedMessage } from '../types/messages.js'
import type { GetSignalsMessage } from '../types/messages.js'
import { generateAuthToken, storeTabToken, getTabToken } from '../lib/auth.js'
import { HUB_WS_URL } from '../agent/constants.js'
import { SignalBus } from '../signals/index.js'
import type { NetworkSignalEvent } from '../signals/index.js'
import { emptySignals } from '../signals/index.js'

export default defineBackground(() => {
	// ─── Hub WebSocket ────────────────────────────────────────────────────────────

	let hubWs: WebSocket | null = null
	let hubConnected = false
	let currentAgentStatus = 'idle'
	let currentTask: string | null = null

	function broadcastHubStatus(): void {
		const msg: HubStatusChangedMessage = {
			type: 'HUB_STATUS_CHANGED',
			hubConnected,
			agentStatus: currentAgentStatus,
			currentTask,
		}
		chrome.runtime.sendMessage(msg).catch(() => {
			// No listeners open — that's fine
		})
	}

	function connectToHub(): void {
		if (hubWs?.readyState === WebSocket.OPEN) return

		hubWs = new WebSocket(HUB_WS_URL)

		hubWs.onopen = () => {
			console.log('[WebMind BG] Connected to hub')
			hubConnected = true
			broadcastHubStatus()
		}

		hubWs.onmessage = async (event: MessageEvent<string>) => {
			let msg: HubInboundMessage
			try {
				msg = JSON.parse(event.data) as HubInboundMessage
			} catch {
				return
			}

			if (msg.type === 'execute') {
				const activeTab = await getActiveTab()
				if (!activeTab?.id) {
					sendToHub({ type: 'error', task_id: msg.task_id, message: 'No active tab' })
					return
				}

				const token = await getTabToken(activeTab.id) ?? generateAuthToken()
				await storeTabToken(activeTab.id, token)

				// Attach CDP debugger before task starts so we capture all network activity
				attachDebugger(activeTab.id)

				const executeMsg: ExecuteTaskMessage = {
					type: 'EXECUTE_TASK',
					taskId: msg.task_id,
					task: msg.task,
					config: msg.config ?? {},
					authToken: token,
				}

				chrome.tabs.sendMessage(activeTab.id, executeMsg, (response) => {
					if (chrome.runtime.lastError) {
						sendToHub({
							type: 'error',
							task_id: msg.task_id,
							message: chrome.runtime.lastError.message ?? 'Failed to send to content script',
						})
					} else if (response) {
						sendToHub({
							type: 'result',
							task_id: msg.task_id,
							success: response.success,
							data: response.data,
							steps: response.steps ?? 0,
							history: response.history ?? [],
						})
					}
				})
			}

			if (msg.type === 'stop') {
				const activeTab = await getActiveTab()
				if (activeTab?.id) {
					const stopMsg: StopTaskMessage = {
						type: 'STOP_TASK',
						authToken: '',
					}
					chrome.tabs.sendMessage(activeTab.id, stopMsg)
				}
			}
		}

		hubWs.onclose = () => {
			console.log('[WebMind BG] Hub disconnected, reconnecting in 3s...')
			hubConnected = false
			broadcastHubStatus()
			setTimeout(connectToHub, 3000)
		}

		hubWs.onerror = () => {
			hubWs?.close()
		}
	}

	function sendToHub(msg: object): void {
		if (hubWs?.readyState === WebSocket.OPEN) {
			hubWs.send(JSON.stringify(msg))
		}
	}

	// ─── CDP Signal Capture ───────────────────────────────────────────────────────

	/** One SignalBus per tab — kept alive after detach so agent can still query */
	const signalBuses = new Map<number, SignalBus>()

	/**
	 * Partial network events awaiting response body.
	 * Key: `${tabId}:${requestId}` to avoid collisions across tabs.
	 */
	const pendingNetworkEvents = new Map<string, Partial<NetworkSignalEvent>>()

	function attachDebugger(tabId: number): void {
		if (signalBuses.has(tabId)) {
			// Clear stale signals from previous task
			signalBuses.get(tabId)!.clear()
			return
		}

		const bus = new SignalBus()
		signalBuses.set(tabId, bus)

		chrome.debugger.attach({ tabId }, '1.3', () => {
			if (chrome.runtime.lastError) {
				console.warn('[WebMind CDP] Failed to attach:', chrome.runtime.lastError.message)
				signalBuses.delete(tabId)
				return
			}
			chrome.debugger.sendCommand({ tabId }, 'Network.enable', {})
			chrome.debugger.sendCommand({ tabId }, 'Runtime.enable', {})
			console.log(`[WebMind CDP] Attached to tab ${tabId}`)
		})
	}

	function detachDebugger(tabId: number): void {
		chrome.debugger.detach({ tabId }, () => {
			// Ignore lastError — tab may have already closed
			void chrome.runtime.lastError
		})
		console.log(`[WebMind CDP] Detached from tab ${tabId}`)
	}

	/** Normalize a CDP headers array or object to a plain Record */
	function normalizeHeaders(
		headers: Array<{ name: string; value: string }> | Record<string, string> | undefined,
	): Record<string, string> {
		if (!headers) return {}
		if (Array.isArray(headers)) {
			const out: Record<string, string> = {}
			for (const h of headers) out[h.name.toLowerCase()] = h.value
			return out
		}
		return headers
	}

	/** Mask sensitive header values before exposing to the agent */
	function maskSensitiveHeaders(headers: Record<string, string>): Record<string, string> {
		const SENSITIVE = ['authorization', 'cookie', 'set-cookie', 'x-api-key', 'x-auth-token']
		const out: Record<string, string> = {}
		for (const [k, v] of Object.entries(headers)) {
			out[k] = SENSITIVE.includes(k.toLowerCase()) ? '[MASKED]' : v
		}
		return out
	}

	function newEventId(): string {
		return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
	}

	// Global CDP event listener
	chrome.debugger.onEvent.addListener((source, method, params) => {
		const tabId = source.tabId
		if (!tabId) return

		const bus = signalBuses.get(tabId)
		if (!bus) return

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const p = params as any

		switch (method) {
			case 'Network.requestWillBeSent': {
				const key = `${tabId}:${p.requestId}`
				// Skip non-XHR assets
				const resourceType: string = p.type ?? ''
				if (['Image', 'Font', 'Stylesheet', 'Media'].includes(resourceType)) break

				pendingNetworkEvents.set(key, {
					id: newEventId(),
					type: 'network',
					source: 'cdp',
					timestamp: Date.now(),
					requestId: p.requestId,
					url: p.request?.url ?? '',
					method: p.request?.method ?? 'GET',
					status: 0,
					requestHeaders: maskSensitiveHeaders(normalizeHeaders(p.request?.headers)),
					responseHeaders: {},
					requestBody: p.request?.postData?.slice(0, 2048),
					duration: -1,
					startTime: Date.now(),
				})
				break
			}

			case 'Network.responseReceived': {
				const key = `${tabId}:${p.requestId}`
				const partial = pendingNetworkEvents.get(key)
				if (partial) {
					partial.status = p.response?.status ?? 0
					partial.responseHeaders = maskSensitiveHeaders(normalizeHeaders(p.response?.headers))
				}
				break
			}

			case 'Network.loadingFinished': {
				const key = `${tabId}:${p.requestId}`
				const partial = pendingNetworkEvents.get(key)
				if (!partial) break

				partial.duration = partial.startTime ? Date.now() - partial.startTime : -1

				chrome.debugger.sendCommand({ tabId }, 'Network.getResponseBody', { requestId: p.requestId }, (result) => {
					void chrome.runtime.lastError
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					const r = result as any
					if (r?.body) partial.responseBody = String(r.body).slice(0, 2048)
					bus.push(partial as NetworkSignalEvent)
					pendingNetworkEvents.delete(key)
				})
				break
			}

			case 'Network.webSocketFrameReceived':
				bus.push({
					id: newEventId(),
					type: 'websocket',
					source: 'cdp',
					timestamp: Date.now(),
					url: p.response?.url ?? p.url ?? '',
					direction: 'receive',
					payload: String(p.response?.payloadData ?? '').slice(0, 2048),
				})
				break

			case 'Network.webSocketFrameSent':
				bus.push({
					id: newEventId(),
					type: 'websocket',
					source: 'cdp',
					timestamp: Date.now(),
					url: p.response?.url ?? p.url ?? '',
					direction: 'send',
					payload: String(p.response?.payloadData ?? '').slice(0, 2048),
				})
				break

			case 'Runtime.consoleAPICalled': {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const args: string[] = (p.args ?? []).map((a: any) =>
					a.value !== undefined ? String(a.value) : (a.description ?? ''),
				)
				bus.push({
					id: newEventId(),
					type: 'console',
					source: 'cdp',
					timestamp: Date.now(),
					level: p.type ?? 'log',
					message: args.join(' ').slice(0, 1024),
				})
				break
			}

			case 'Runtime.exceptionThrown': {
				const ex = p.exceptionDetails
				bus.push({
					id: newEventId(),
					type: 'error',
					source: 'cdp',
					timestamp: Date.now(),
					message: ex?.exception?.description ?? ex?.text ?? 'Unknown error',
					stack: ex?.stackTrace?.callFrames
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						?.map((f: any) => `  at ${f.functionName || '(anonymous)'} (${f.url}:${f.lineNumber})`)
						.join('\n'),
				})
				break
			}
		}
	})

	chrome.debugger.onDetach.addListener((source) => {
		if (source.tabId) console.log(`[WebMind CDP] Externally detached from tab ${source.tabId}`)
	})

	// ─── Extension setup ──────────────────────────────────────────────────────────

	chrome.runtime.onInstalled.addListener(() => {
		console.log('[WebMind] Extension installed')
		chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
	})

	chrome.action.onClicked.addListener(async (tab) => {
		if (!tab.id) return
		await chrome.sidePanel.open({ tabId: tab.id })
	})

	chrome.tabs.onCreated.addListener(async (tab) => {
		if (!tab.id) return
		const token = generateAuthToken()
		await storeTabToken(tab.id, token)
	})

	chrome.tabs.onRemoved.addListener((tabId) => {
		signalBuses.delete(tabId)
		for (const key of pendingNetworkEvents.keys()) {
			if (key.startsWith(`${tabId}:`)) pendingNetworkEvents.delete(key)
		}
	})

	chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
		if (msg.type === 'TASK_STATUS') {
			currentAgentStatus = msg.status
			if (msg.status === 'idle' || msg.status === 'completed' || msg.status === 'error') {
				currentTask = null
				const tabId = sender.tab?.id
				if (tabId) detachDebugger(tabId)
			}
			broadcastHubStatus()
		}

		if (
			msg.type === 'TASK_STATUS' ||
			msg.type === 'TASK_RESULT' ||
			msg.type === 'TASK_ACTIVITY' ||
			msg.type === 'TASK_HISTORY' ||
			msg.type === 'ASK_USER'
		) {
			chrome.runtime.sendMessage(msg).catch(() => {})
		}

		if (msg.type === 'USER_ANSWER' && sender.tab === undefined) {
			getActiveTab().then((tab) => {
				if (tab?.id) chrome.tabs.sendMessage(tab.id, msg)
			})
		}

		if (msg.type === 'GET_HUB_STATUS') {
			sendResponse({ hubConnected, agentStatus: currentAgentStatus, currentTask })
			return false
		}

		if (msg.type === 'START_TASK') {
			currentTask = msg.task ?? null
			currentAgentStatus = 'running'
			broadcastHubStatus()
			getActiveTab().then((tab) => {
				if (tab?.id) attachDebugger(tab.id)
			})
		}

		if (msg.type === 'GET_SIGNALS') {
			const { tabId } = msg as GetSignalsMessage
			const bus = signalBuses.get(tabId)
			sendResponse({ signals: bus?.snapshot() ?? emptySignals() })
			return false
		}

		sendResponse({ ok: true })
		return false
	})

	connectToHub()
})

async function getActiveTab(): Promise<chrome.tabs.Tab | null> {
	const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
	return tab ?? null
}
