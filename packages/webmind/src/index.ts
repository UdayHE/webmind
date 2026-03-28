export { WebMind } from './WebMind.js'
export type { WebMindConfig } from './WebMind.js'

// Re-export core types for convenience
export type {
	AgentActivity,
	AgentConfig,
	AgentStatus,
	ExecutionResult,
	HistoricalEvent,
	MacroToolInput,
} from '@webmind/core'

// Re-export LLM config
export type { LLMConfig } from '@webmind/llms'
