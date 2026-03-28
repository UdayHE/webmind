import type { ToolDefinition, OpenAITool } from './types.js'

/**
 * Convert a ToolDefinition (with Zod schema) to OpenAI tool format.
 * Supports both Zod 3 (zodToJsonSchema) and Zod 4 (z.toJsonSchema).
 */
export function toolDefinitionToOpenAI(def: ToolDefinition): OpenAITool {
	let parameters: Record<string, unknown>

	// Zod 4: z.toJsonSchema is available as a standalone export
	// Zod 3: use zod-to-json-schema package if available, else manual
	const schema = def.schema
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const zodAny = schema as any

	if (typeof zodAny.toJSON === 'function') {
		// Zod 4 native
		parameters = zodAny.toJSON()
	} else {
		// Manual basic Zod 3 schema extraction
		parameters = extractZodSchema(zodAny)
	}

	// Remove $schema key if present
	delete parameters['$schema']

	return {
		type: 'function',
		function: {
			name: def.name,
			description: def.description,
			parameters,
		},
	}
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractZodSchema(schema: any): Record<string, unknown> {
	if (!schema || !schema._def) return { type: 'object', properties: {} }

	const def = schema._def
	const typeName: string = def.typeName ?? ''

	if (typeName === 'ZodObject') {
		const shape = def.shape ? def.shape() : {}
		const properties: Record<string, unknown> = {}
		const required: string[] = []

		for (const [key, value] of Object.entries(shape)) {
			properties[key] = extractZodSchema(value)
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const valDef = (value as any)?._def
			if (valDef?.typeName !== 'ZodOptional') {
				required.push(key)
			}
		}

		return { type: 'object', properties, required }
	}

	if (typeName === 'ZodString') return { type: 'string' }
	if (typeName === 'ZodNumber') return { type: 'number' }
	if (typeName === 'ZodBoolean') return { type: 'boolean' }
	if (typeName === 'ZodOptional') return extractZodSchema(def.innerType)
	if (typeName === 'ZodNullable') return { ...extractZodSchema(def.innerType), nullable: true }
	if (typeName === 'ZodArray') return { type: 'array', items: extractZodSchema(def.type) }
	if (typeName === 'ZodEnum') return { type: 'string', enum: def.values }
	if (typeName === 'ZodUnion') {
		return { oneOf: def.options.map(extractZodSchema) }
	}
	if (typeName === 'ZodLiteral') return { const: def.value }
	if (typeName === 'ZodDefault') return extractZodSchema(def.innerType)

	return {}
}

/**
 * Apply model-specific patches to the request body before sending to API.
 * Different providers have quirks that need to be handled.
 */
export function applyModelPatches(
	model: string,
	requestBody: Record<string, unknown>,
): Record<string, unknown> {
	const body = { ...requestBody }
	const lower = model.toLowerCase()

	// Qwen / QwQ: temperature must be at least 0.1, no thinking param
	if (lower.includes('qwen') || lower.includes('qwq')) {
		if (typeof body.temperature === 'number' && body.temperature < 0.1) {
			body.temperature = 0.1
		}
		delete body.thinking
	}

	// Claude (via proxy): no thinking param, convert tool_choice syntax
	if (lower.includes('claude')) {
		delete body.thinking
		if (body.tool_choice && typeof body.tool_choice === 'object') {
			const tc = body.tool_choice as Record<string, unknown>
			if (tc.type === 'function' && tc.function) {
				// Already correct format
			} else if (tc.name) {
				body.tool_choice = { type: 'function', function: { name: tc.name } }
			}
		}
	}

	// Grok: remove tool_choice and reasoning_effort
	if (lower.includes('grok')) {
		delete body.tool_choice
		delete body.reasoning_effort
	}

	// GPT: only reasoning models support reasoning_effort
	if (lower.startsWith('gpt')) {
		const isReasoning =
			lower.includes('o1') || lower.includes('o3') || lower.includes('o4') || lower.includes('o-')
		if (!isReasoning) {
			delete body.reasoning_effort
		}
	}

	// Gemini: minimize reasoning to save tokens
	if (lower.includes('gemini')) {
		if (body.reasoning_effort) body.reasoning_effort = 'none'
	}

	// MiniMax: clamp temperature 0.01-1, remove parallel_tool_calls
	if (lower.includes('minimax')) {
		if (typeof body.temperature === 'number') {
			body.temperature = Math.max(0.01, Math.min(1, body.temperature))
		}
		delete body.parallel_tool_calls
	}

	// DashScope: same as Qwen
	if (lower.includes('dashscope') || lower.includes('bailian')) {
		if (typeof body.temperature === 'number' && body.temperature < 0.1) {
			body.temperature = 0.1
		}
		delete body.thinking
	}

	return body
}

/**
 * Build a tool_choice value for the API request.
 */
export function buildToolChoice(
	toolChoice: 'auto' | 'none' | { name: string } | undefined,
	disableNamedToolChoice: boolean,
): unknown {
	if (!toolChoice || toolChoice === 'auto') return 'auto'
	if (toolChoice === 'none') return 'none'
	if (disableNamedToolChoice) return 'auto'
	return { type: 'function', function: { name: toolChoice.name } }
}
