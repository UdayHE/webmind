/**
 * Content Script — runs in isolated world on every page.
 *
 * Responsibilities:
 * - Receive EXECUTE_TASK / STOP_TASK messages from background
 * - Validate auth token
 * - Create/manage WebMindCore agent instance
 * - Forward agent events back to background (status, activity, history)
 * - Route PAGE_CONTROL actions to main-world script
 */

import { WebMindCore } from '@webmind/core'
import type { AgentConfig, ExecutionResult } from '@webmind/core'
import type { ExecuteTaskMessage, StopTaskMessage } from '../types/messages.js'
import { storeToken } from '../lib/auth.js'

export default defineContentScript({
	matches: ['<all_urls>'],
	runAt: 'document_idle',
	main() {
		init()
	},
})

let activeAgent: WebMindCore | null = null

function isExecuteMsg(msg: unknown): msg is ExecuteTaskMessage {
	return typeof msg === 'object' && msg !== null && (msg as Record<string, unknown>).type === 'EXECUTE_TASK'
}

function isStopMsg(msg: unknown): msg is StopTaskMessage {
	return typeof msg === 'object' && msg !== null && (msg as Record<string, unknown>).type === 'STOP_TASK'
}

function init(): void {
	chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
		if (isExecuteMsg(msg)) {
			// Store and validate auth token
			storeToken(msg.authToken)

			void handleExecute(msg, sendResponse)
			return true // Keep channel open for async response
		}

		if (isStopMsg(msg)) {
			activeAgent?.stop()
			sendResponse({ ok: true })
			return false
		}

		if (msg.type === 'PAGE_CONTROL') {
			// Forward to main world via custom event
			document.dispatchEvent(
				new CustomEvent('webmind_page_control', {
					detail: msg.action,
				}),
			)
			// The main-world script will respond via webmind_page_control_result
			const handler = (e: Event) => {
				document.removeEventListener('webmind_page_control_result', handler)
				sendResponse((e as CustomEvent).detail)
			}
			document.addEventListener('webmind_page_control_result', handler, { once: true })
			return true
		}

		return false
	})
}

async function handleExecute(
	msg: ExecuteTaskMessage,
	sendResponse: (r: unknown) => void,
): Promise<void> {
	if (activeAgent) {
		activeAgent.stop()
		activeAgent.dispose()
		activeAgent = null
	}

	const config: AgentConfig = {
		...(msg.config as Partial<AgentConfig>),
		baseURL: (msg.config as Partial<AgentConfig>).baseURL ?? '',
		model: (msg.config as Partial<AgentConfig>).model ?? '',
		apiKey: (msg.config as Partial<AgentConfig>).apiKey ?? '',
	}

	const agent = new WebMindCore(config)
	activeAgent = agent

	// Forward events to background
	agent.addEventListener('statuschange', (e) => {
		const detail = (e as CustomEvent<{ status: string }>).detail
		chrome.runtime.sendMessage({ type: 'TASK_STATUS', taskId: msg.taskId, ...detail })
	})

	agent.addEventListener('activity', (e) => {
		const detail = (e as CustomEvent<{ activity: unknown }>).detail
		chrome.runtime.sendMessage({ type: 'TASK_ACTIVITY', taskId: msg.taskId, ...detail })
	})

	agent.addEventListener('historychange', (e) => {
		const detail = (e as CustomEvent<{ history: unknown[] }>).detail
		chrome.runtime.sendMessage({ type: 'TASK_HISTORY', taskId: msg.taskId, ...detail })
	})

	const result: ExecutionResult = await agent.run(msg.task)

	activeAgent = null
	agent.dispose()

	sendResponse(result)

	chrome.runtime.sendMessage({ type: 'TASK_RESULT', taskId: msg.taskId, result })
}
