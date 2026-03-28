import type { LLMResponse, ToolCall } from './types.js'

/**
 * Safely parse JSON — returns null on failure instead of throwing.
 */
export function safeJsonParse(str: string): unknown {
	try {
		return JSON.parse(str)
	} catch {
		return null
	}
}

/**
 * Extract the first valid JSON object from a text string.
 * Searches between the first '{' and the matching '}'.
 */
export function retrieveJsonFromString(text: string): unknown {
	const start = text.indexOf('{')
	if (start === -1) return null

	let depth = 0
	let inString = false
	let escape = false

	for (let i = start; i < text.length; i++) {
		const ch = text[i]
		if (escape) {
			escape = false
			continue
		}
		if (ch === '\\') {
			escape = true
			continue
		}
		if (ch === '"') {
			inString = !inString
			continue
		}
		if (inString) continue
		if (ch === '{') depth++
		if (ch === '}') {
			depth--
			if (depth === 0) {
				return safeJsonParse(text.slice(start, i + 1))
			}
		}
	}
	return null
}

/**
 * Normalize a malformed or incomplete LLM response.
 * Handles:
 *  1. Tool call embedded in content text (LLM put JSON in text instead of tool_calls)
 *  2. Double-stringified JSON arguments
 *  3. Tool name mismatches (case, underscore vs hyphen)
 *  4. Missing tool_calls entirely — default to "wait" action
 */
export function normalizeResponse(
	response: LLMResponse,
	availableTools: string[],
): LLMResponse {
	let { toolCalls } = response

	// 1. If no tool calls, try extracting from content text
	if (toolCalls.length === 0 && response.content) {
		const extracted = tryExtractToolCallFromText(response.content, availableTools)
		if (extracted) {
			toolCalls = [extracted]
		}
	}

	// 2. Fix tool names and arguments
	toolCalls = toolCalls.map((tc) => {
		const fixedName = resolveToolName(tc.name, availableTools)
		const fixedArgs = fixArguments(tc.arguments)
		return { ...tc, name: fixedName ?? tc.name, arguments: fixedArgs }
	})

	// 3. If still no tool calls, default to wait(1)
	if (toolCalls.length === 0) {
		toolCalls = [
			{
				id: `fallback-${Date.now()}`,
				name: 'wait',
				arguments: { seconds: 1 },
			},
		]
	}

	return { ...response, toolCalls }
}

/**
 * Validate a tool call: ensure tool exists, coerce primitive input to object.
 * Returns null if the tool is completely unknown.
 */
export function validateAction(toolCall: ToolCall, availableTools: string[]): ToolCall | null {
	const resolvedName = resolveToolName(toolCall.name, availableTools)
	if (!resolvedName) return null

	const args = fixArguments(toolCall.arguments)
	return { ...toolCall, name: resolvedName, arguments: args }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function tryExtractToolCallFromText(
	content: string,
	availableTools: string[],
): ToolCall | null {
	const json = retrieveJsonFromString(content)
	if (!json || typeof json !== 'object') return null

	const obj = json as Record<string, unknown>

	// Check if it looks like a tool call envelope: { name, arguments } or { tool, input }
	const name =
		(typeof obj.name === 'string' && obj.name) ||
		(typeof obj.tool === 'string' && obj.tool) ||
		(typeof obj.action === 'string' && obj.action) ||
		null

	if (!name) return null

	const resolvedName = resolveToolName(name, availableTools)
	if (!resolvedName) return null

	const rawArgs = obj.arguments ?? obj.input ?? obj.parameters ?? obj
	const args = typeof rawArgs === 'object' && rawArgs !== null
		? (rawArgs as Record<string, unknown>)
		: { value: rawArgs }

	return {
		id: `extracted-${Date.now()}`,
		name: resolvedName,
		arguments: fixArguments(args),
	}
}

function resolveToolName(name: string, availableTools: string[]): string | null {
	// Exact match
	if (availableTools.includes(name)) return name

	// Normalize: lowercase, replace hyphens with underscores
	const normalized = name.toLowerCase().replace(/-/g, '_')
	const match = availableTools.find(
		(t) => t.toLowerCase().replace(/-/g, '_') === normalized,
	)
	return match ?? null
}

function fixArguments(args: Record<string, unknown>): Record<string, unknown> {
	// Handle double-stringified JSON
	if (typeof args === 'string') {
		const parsed = safeJsonParse(args as unknown as string)
		if (parsed && typeof parsed === 'object') {
			return parsed as Record<string, unknown>
		}
		return { value: args }
	}

	// Fix string values that are double-stringified JSON objects
	const fixed: Record<string, unknown> = {}
	for (const [key, value] of Object.entries(args)) {
		if (typeof value === 'string') {
			const parsed = safeJsonParse(value)
			if (parsed && typeof parsed === 'object') {
				fixed[key] = parsed
			} else {
				fixed[key] = value
			}
		} else {
			fixed[key] = value
		}
	}
	return fixed
}
