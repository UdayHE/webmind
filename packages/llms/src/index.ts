import { DEFAULT_MAX_RETRIES, RETRY_BASE_DELAY_MS } from './constants.js'
import { AuthError, ContextLengthError } from './errors.js'
import { OpenAIClient } from './OpenAIClient.js'
import { normalizeResponse } from './autoFixer.js'
import type { CallParams, LLMConfig, LLMResponse, ToolDefinition } from './types.js'

export type { LLMConfig, LLMMessage, LLMResponse, ToolCall, ToolDefinition, TokenUsage, CallParams } from './types.js'
export { LLMError, AuthError, RateLimitError, ContextLengthError, ContentFilterError, ServerError } from './errors.js'
export { normalizeResponse, validateAction, safeJsonParse, retrieveJsonFromString } from './autoFixer.js'
export { toolDefinitionToOpenAI, applyModelPatches } from './utils.js'

/**
 * LLM — main entry point for all LLM interactions.
 *
 * Extends EventTarget to emit:
 *   - "retry" CustomEvent<{ attempt: number; error: Error }>
 *   - "error" CustomEvent<{ error: Error }>
 *
 * Pattern: Strategy (OpenAIClient is swappable), Observer (EventTarget events)
 */
export class LLM extends EventTarget {
	private readonly config: LLMConfig
	private readonly client: OpenAIClient

	constructor(config: LLMConfig) {
		super()
		this.config = config
		this.client = new OpenAIClient(config)
	}

	get model(): string {
		return this.config.model
	}

	/**
	 * Call the LLM with retry logic and response normalization.
	 */
	async call(params: CallParams): Promise<LLMResponse> {
		const maxRetries = this.config.maxRetries ?? DEFAULT_MAX_RETRIES
		const availableToolNames = (params.tools ?? []).map((t: ToolDefinition) => t.name)

		let lastError: Error | undefined

		for (let attempt = 0; attempt <= maxRetries; attempt++) {
			try {
				const response = await this.client.complete(params)
				// Auto-fix malformed responses
				return normalizeResponse(response, availableToolNames)
			} catch (err) {
				lastError = err as Error

				// Do NOT retry auth or context length errors — they won't resolve
				if (err instanceof AuthError || err instanceof ContextLengthError) {
					this.dispatchEvent(
						new CustomEvent('error', { detail: { error: err } }),
					)
					throw err
				}

				if (attempt < maxRetries) {
					this.dispatchEvent(
						new CustomEvent('retry', { detail: { attempt, error: err } }),
					)
					await delay(RETRY_BASE_DELAY_MS * (attempt + 1))
				}
			}
		}

		this.dispatchEvent(
			new CustomEvent('error', { detail: { error: lastError } }),
		)
		throw lastError
	}
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms))
}
