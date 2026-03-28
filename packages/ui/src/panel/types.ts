import type { AgentStatus, HistoricalEvent } from '@webmind/core'
import type { Locale } from '../i18n/index.js'

export interface PanelConfig {
	locale?: Locale
	position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'
}

export interface HistoryEntry {
	id: string
	task: string
	status: AgentStatus
	startedAt: number
	completedAt: number | null
	success: boolean | null
	data: string
	history: HistoricalEvent[]
}

export interface PanelState {
	status: AgentStatus
	currentTask: string
	steps: StepLog[]
	history: HistoryEntry[]
	pendingQuestion: string | null
	isVisible: boolean
	isSettingsOpen: boolean
}

export interface StepLog {
	step: number
	tool: string
	args: Record<string, unknown>
	thinking: string
	timestamp: number
}
