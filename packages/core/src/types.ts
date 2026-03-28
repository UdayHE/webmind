import type { LLMConfig, LLMMessage, LLMResponse, ToolDefinition } from '@webmind/llms'
import type { BrowserState } from '@webmind/page-controller'

// ─── Agent Status ─────────────────────────────────────────────────────────────

export type AgentStatus = 'idle' | 'running' | 'completed' | 'error'

export type AgentActivity =
	| { type: 'thinking'; text: string }
	| { type: 'executing'; tool: string; args: Record<string, unknown> }
	| { type: 'retrying'; attempt: number; reason: string }
	| { type: 'error'; message: string }
	| { type: 'asking'; question: string }

// ─── History Events ───────────────────────────────────────────────────────────

export interface StepEvent {
	type: 'step'
	step: number
	reflection: AgentReflection
	tool: string
	args: Record<string, unknown>
	timestamp: number
}

export interface ObservationEvent {
	type: 'observation'
	step: number
	simplifiedHTML: string
	browserState: BrowserState
	timestamp: number
}

export interface RetryEvent {
	type: 'retry'
	step: number
	attempt: number
	reason: string
	timestamp: number
}

export interface ErrorEvent {
	type: 'error'
	step: number
	message: string
	timestamp: number
}

export interface TakeoverEvent {
	type: 'takeover'
	step: number
	question: string
	answer: string
	timestamp: number
}

export type HistoricalEvent =
	| StepEvent
	| ObservationEvent
	| RetryEvent
	| ErrorEvent
	| TakeoverEvent

// ─── Reflection ───────────────────────────────────────────────────────────────

export interface AgentReflection {
	evaluation_previous_goal: string
	memory: string
	next_goal: string
}

export interface MacroToolInput {
	reflection: AgentReflection
	action: {
		name: string
		args: Record<string, unknown>
	}
}

// ─── Execution Result ─────────────────────────────────────────────────────────

export interface ExecutionResult {
	success: boolean
	data: string
	history: HistoricalEvent[]
	steps: number
}

// ─── Config ───────────────────────────────────────────────────────────────────

export interface AgentConfig extends LLMConfig {
	maxSteps?: number
	stepDelay?: number
	enableMask?: boolean
	lang?: 'en-US' | 'zh-CN'
	customSystemPrompt?: string
	customTools?: ToolDefinition[]
	transformPageContent?: (html: string) => string
	fetchLlmsTxt?: boolean

	// Lifecycle hooks
	onBeforeStep?: (step: number) => void | Promise<void>
	onAfterStep?: (step: number, result: MacroToolInput) => void | Promise<void>
	onBeforeTask?: (task: string) => void | Promise<void>
	onAfterTask?: (result: ExecutionResult) => void | Promise<void>
}

// ─── Internal conversation state ──────────────────────────────────────────────

export interface ConversationContext {
	messages: LLMMessage[]
	lastResponse: LLMResponse | null
}
