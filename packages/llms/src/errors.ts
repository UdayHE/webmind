export class LLMError extends Error {
	constructor(
		message: string,
		public readonly code: string,
		public readonly status?: number,
	) {
		super(message)
		this.name = 'LLMError'
	}
}

export class AuthError extends LLMError {
	constructor(msg: string) {
		super(msg, 'AUTH_ERROR', 401)
		this.name = 'AuthError'
	}
}

export class RateLimitError extends LLMError {
	constructor(msg: string) {
		super(msg, 'RATE_LIMIT', 429)
		this.name = 'RateLimitError'
	}
}

export class ContextLengthError extends LLMError {
	constructor(msg: string) {
		super(msg, 'CONTEXT_LENGTH', 400)
		this.name = 'ContextLengthError'
	}
}

export class ContentFilterError extends LLMError {
	constructor(msg: string) {
		super(msg, 'CONTENT_FILTER', 400)
		this.name = 'ContentFilterError'
	}
}

export class ServerError extends LLMError {
	constructor(msg: string, status?: number) {
		super(msg, 'SERVER_ERROR', status)
		this.name = 'ServerError'
	}
}

export function categorizeHttpError(status: number, body: string): LLMError {
	const lower = body.toLowerCase()

	if (status === 401 || status === 403) {
		return new AuthError(`Authentication failed (${status}): ${body}`)
	}

	if (status === 429) {
		return new RateLimitError(`Rate limit exceeded: ${body}`)
	}

	if (status === 400) {
		if (lower.includes('context length') || lower.includes('max_tokens') || lower.includes('too long')) {
			return new ContextLengthError(`Context length exceeded: ${body}`)
		}
		if (lower.includes('content filter') || lower.includes('safety') || lower.includes('violat')) {
			return new ContentFilterError(`Content filtered: ${body}`)
		}
	}

	return new ServerError(`Server error (${status}): ${body}`, status)
}
