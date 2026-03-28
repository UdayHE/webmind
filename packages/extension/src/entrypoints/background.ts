/**
 * Background Service Worker — extension orchestration hub.
 *
 * Responsibilities:
 * - Tab management and lifecycle events
 * - UUID auth token generation per tab
 * - Message routing between sidepanel ↔ content scripts
 * - WebSocket connection to MCP hub server
 * - Side panel UI management
 */

import type { ExecuteTaskMessage, StopTaskMessage } from '../types/messages.js'
import type { HubInboundMessage, HubResultMessage, HubErrorMessage, HubStatusChangedMessage } from '../types/messages.js'
import { generateAuthToken, storeTabToken, getTabToken } from '../lib/auth.js'
import { HUB_WS_URL } from '../agent/constants.js'

// ─── Hub WebSocket ──────────────────────────────────────────────────────────────

let hubWs: WebSocket | null = null
let hubConnected = false
let currentAgentStatus = 'idle'
let currentTask: string | null = null
const pendingTasks = new Map<string, { tabId: number; resolve: (r: HubResultMessage | HubErrorMessage) => void }>()

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

// ─── Extension setup ────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
	console.log('[WebMind] Extension installed')
	// Configure side panel to open on action click
	chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
})

chrome.action.onClicked.addListener(async (tab) => {
	if (!tab.id) return
	await chrome.sidePanel.open({ tabId: tab.id })
})

// Generate auth token for each new tab
chrome.tabs.onCreated.addListener(async (tab) => {
	if (!tab.id) return
	const token = generateAuthToken()
	await storeTabToken(tab.id, token)
})

// Route messages between content scripts and sidepanel
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
	// Track agent status changes
	if (msg.type === 'TASK_STATUS') {
		currentAgentStatus = msg.status
		if (msg.status === 'idle' || msg.status === 'completed' || msg.status === 'error') {
			currentTask = null
		}
		broadcastHubStatus()
	}

	// Forward task status/activity/result from content → sidepanel/hub
	if (
		msg.type === 'TASK_STATUS' ||
		msg.type === 'TASK_RESULT' ||
		msg.type === 'TASK_ACTIVITY' ||
		msg.type === 'TASK_HISTORY' ||
		msg.type === 'ASK_USER'
	) {
		// Broadcast to all extension pages (sidepanel + hub)
		chrome.runtime.sendMessage(msg).catch(() => {
			// No open pages — that's fine
		})
	}

	// Forward user answers from sidepanel → content script
	if (msg.type === 'USER_ANSWER' && sender.tab === undefined) {
		getActiveTab().then((tab) => {
			if (tab?.id) {
				chrome.tabs.sendMessage(tab.id, msg)
			}
		})
	}

	// Hub page requesting current status snapshot
	if (msg.type === 'GET_HUB_STATUS') {
		sendResponse({
			hubConnected,
			agentStatus: currentAgentStatus,
			currentTask,
		})
		return false
	}

	// Track task start from side panel
	if (msg.type === 'START_TASK') {
		currentTask = msg.task ?? null
		currentAgentStatus = 'running'
		broadcastHubStatus()
	}

	sendResponse({ ok: true })
	return false
})

// Attempt hub connection on startup
connectToHub()

async function getActiveTab(): Promise<chrome.tabs.Tab | null> {
	const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
	return tab ?? null
}
