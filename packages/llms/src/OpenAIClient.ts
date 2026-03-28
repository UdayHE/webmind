import {
	DEFAULT_MAX_TOKENS,
	DEFAULT_TEMPERATURE,
} from './constants.js'
import { categorizeHttpError } from './errors.js'
import {
	applyModelPatches,
	buildToolChoice,
	toolDefinitionToOpenAI,
} from './utils.js'
import type {
	CallParams,
	LLMConfig,
	LLMMessage,
	LLMResponse,
	OpenAIMessage,
	OpenAIResponse,
	OpenAIToolCall,
	TokenUsage,
	ToolCall,
} from './types.js'

/**
 * OpenAI-compatible HTTP client.
 * Works with: OpenAI, Azure OpenAI, Qwen/DashScope, Grok, Gemini (via proxy),
 * MiniMax, Anthropic (via proxy), and any other OpenAI-compatible endpoint.
 */
export class OpenAIClient {
	private readonly config: LLMConfig

	constructor(config: LLMConfig) {
		this.config = config
	}

	async complete(params: CallParams): Promise<LLMResponse> {
		const { messages, tools, toolChoice, temperature } = params
		const { baseURL, model, apiKey, customFetch, disableNamedToolChoice } = this.config

		const fetchFn = customFetch ?? fetch

		const openAIMessages = messages.map(toOpenAIMessage)
		const openAITools = tools?.map(toolDefinitionToOpenAI)

		const toolChoiceValue =
			openAITools && openAITools.length > 0
				? buildToolChoice(toolChoice, disableNamedToolChoice ?? false)
				: undefined

		let requestBody: Record<string, unknown> = {
			model,
			messages: openAIMessages,
			temperature: temperature ?? this.config.temperature ?? DEFAULT_TEMPERATURE,
			max_tokens: DEFAULT_MAX_TOKENS,
			stream: false,
		}

		if (openAITools && openAITools.length > 0) {
			requestBody.tools = openAITools
			requestBody.tool_choice = toolChoiceValue
		}

		// Apply model-specific patches
		requestBody = applyModelPatches(model, requestBody)

		const url = `${baseURL.replace(/\/$/, '')}/chat/completions`

		const resp = await fetchFn(url, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${apiKey}`,
			},
			body: JSON.stringify(requestBody),
		})

		if (!resp.ok) {
			const body = await resp.text().catch(() => `HTTP ${resp.status}`)
			throw categorizeHttpError(resp.status, body)
		}

		const data = (await resp.json()) as OpenAIResponse

		const choice = data.choices[0]
		const msg = choice.message

		const content = msg.content ?? ''
		const toolCalls = parseToolCalls(msg.tool_calls ?? [])
		const usage = parseUsage(data)
		const finishReason = choice.finish_reason ?? 'stop'

		return { content, toolCalls, usage, finishReason }
	}
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toOpenAIMessage(msg: LLMMessage): OpenAIMessage {
	const base: OpenAIMessage = {
		role: msg.role,
		content: typeof msg.content === 'string'
			? msg.content
			: msg.content.map((p) => p.text ?? '').join(''),
	}

	if (msg.tool_call_id) base.tool_call_id = msg.tool_call_id
	if (msg.name) base.name = msg.name

	if (msg.tool_calls && msg.tool_calls.length > 0) {
		base.tool_calls = msg.tool_calls.map((tc) => ({
			id: tc.id,
			type: 'function' as const,
			function: {
				name: tc.name,
				arguments: JSON.stringify(tc.arguments),
			},
		}))
	}

	return base
}

function parseToolCalls(rawCalls: OpenAIToolCall[]): ToolCall[] {
	return rawCalls.map((tc) => {
		let args: Record<string, unknown> = {}
		try {
			const parsed = JSON.parse(tc.function.arguments)
			if (typeof parsed === 'object' && parsed !== null) {
				args = parsed as Record<string, unknown>
			}
		} catch {
			// Leave empty object
		}
		return {
			id: tc.id,
			name: tc.function.name,
			arguments: args,
		}
	})
}

function parseUsage(data: OpenAIResponse): TokenUsage {
	const u = data.usage
	return {
		inputTokens: u?.prompt_tokens ?? 0,
		outputTokens: u?.completion_tokens ?? 0,
		cachedTokens: u?.prompt_tokens_details?.cached_tokens ?? 0,
		reasoningTokens: u?.completion_tokens_details?.reasoning_tokens ?? 0,
	}
}
