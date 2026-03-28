import type { AgentStatus, ExecutionResult, HistoricalEvent } from '@webmind/core'
import type { AgentConfig } from '@webmind/core'

export type MessageTarget = 'background' | 'content' | 'sidepanel'

// Messages from background → content
export interface ExecuteTaskMessage {
	type: 'EXECUTE_TASK'
	taskId: string
	task: string
	config: Partial<AgentConfig>
	authToken: string
}

export interface StopTaskMessage {
	type: 'STOP_TASK'
	authToken: string
}

// Messages from content → background
export interface TaskStatusMessage {
	type: 'TASK_STATUS'
	taskId: string
	status: AgentStatus
}

export interface TaskResultMessage {
	type: 'TASK_RESULT'
	taskId: string
	result: ExecutionResult
}

export interface TaskActivityMessage {
	type: 'TASK_ACTIVITY'
	taskId: string
	activity: { type: string; [key: string]: unknown }
}

export interface TaskHistoryMessage {
	type: 'TASK_HISTORY'
	taskId: string
	history: HistoricalEvent[]
}

// Hub WebSocket messages
export interface HubExecuteMessage {
	type: 'execute'
	task: string
	task_id: string
	config?: Partial<AgentConfig>
}

export interface HubStopMessage {
	type: 'stop'
	task_id: string
}

export interface HubResultMessage {
	type: 'result'
	task_id: string
	success: boolean
	data: string
	steps: number
	history: HistoricalEvent[]
}

export interface HubErrorMessage {
	type: 'error'
	task_id: string
	message: string
}

export type HubInboundMessage = HubExecuteMessage | HubStopMessage
export type HubOutboundMessage = HubResultMessage | HubErrorMessage

// Messages from hub page → background
export interface GetHubStatusMessage {
	type: 'GET_HUB_STATUS'
}

// Messages from background → hub page / sidepanel
export interface HubStatusChangedMessage {
	type: 'HUB_STATUS_CHANGED'
	hubConnected: boolean
	agentStatus: string
	currentTask: string | null
}

export interface AskUserMessage {
	type: 'ASK_USER'
	question: string
}

export interface UserAnswerMessage {
	type: 'USER_ANSWER'
	answer: string
}

export type BackgroundMessage =
	| ExecuteTaskMessage
	| StopTaskMessage

export type ContentMessage =
	| TaskStatusMessage
	| TaskResultMessage
	| TaskActivityMessage
	| TaskHistoryMessage
