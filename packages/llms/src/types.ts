import type { ZodTypeAny } from 'zod'

export interface LLMConfig {
	baseURL: string
	model: string
	apiKey: string
	temperature?: number
	maxRetries?: number
	disableNamedToolChoice?: boolean
	customFetch?: typeof fetch
	lang?: 'en-US' | 'zh-CN'
}

export interface ContentPart {
	type: 'text' | 'image_url'
	text?: string
	image_url?: { url: string }
}

export interface ToolCall {
	id: string
	name: string
	arguments: Record<string, unknown>
}

export interface LLMMessage {
	role: 'system' | 'user' | 'assistant' | 'tool'
	content: string | ContentPart[]
	tool_call_id?: string
	tool_calls?: ToolCall[]
	name?: string
}

export interface ToolDefinition {
	name: string
	description: string
	schema: ZodTypeAny
}

export interface TokenUsage {
	inputTokens: number
	outputTokens: number
	cachedTokens: number
	reasoningTokens: number
}

export interface LLMResponse {
	content: string
	toolCalls: ToolCall[]
	usage: TokenUsage
	finishReason: string
}

export interface CallParams {
	messages: LLMMessage[]
	tools?: ToolDefinition[]
	toolChoice?: 'auto' | 'none' | { name: string }
	temperature?: number
}

// Raw OpenAI-wire types
export interface OpenAITool {
	type: 'function'
	function: {
		name: string
		description: string
		parameters: Record<string, unknown>
	}
}

export interface OpenAIToolCall {
	id: string
	type: 'function'
	function: {
		name: string
		arguments: string
	}
}

export interface OpenAIMessage {
	role: string
	content: string | null
	tool_calls?: OpenAIToolCall[]
	tool_call_id?: string
	name?: string
}

export interface OpenAIUsage {
	prompt_tokens: number
	completion_tokens: number
	prompt_tokens_details?: {
		cached_tokens?: number
	}
	completion_tokens_details?: {
		reasoning_tokens?: number
	}
}

export interface OpenAIResponse {
	id: string
	choices: Array<{
		message: OpenAIMessage
		finish_reason: string
	}>
	usage: OpenAIUsage
}
