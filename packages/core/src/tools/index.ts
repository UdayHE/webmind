import { z } from 'zod'
import type { ToolDefinition } from '@webmind/llms'

/**
 * All tools available to the agent.
 * Each tool has a Zod schema for validation.
 */
export const AGENT_TOOLS: ToolDefinition[] = [
	{
		name: 'click_element_by_index',
		description: 'Click an interactive element identified by its index number shown in the simplified DOM.',
		schema: z.object({
			index: z.number().int().min(0).describe('The numeric index of the element to click'),
		}),
	},
	{
		name: 'input_text',
		description: 'Type text into an input field, textarea, or contentEditable element identified by its index.',
		schema: z.object({
			index: z.number().int().min(0).describe('The numeric index of the input element'),
			text: z.string().describe('The text to type into the element'),
		}),
	},
	{
		name: 'select_dropdown_option',
		description: 'Select an option from a dropdown/select element by its visible text.',
		schema: z.object({
			index: z.number().int().min(0).describe('The numeric index of the select element'),
			option_text: z.string().describe('The visible text of the option to select'),
		}),
	},
	{
		name: 'scroll',
		description: 'Scroll the page or a specific element vertically.',
		schema: z.object({
			direction: z.enum(['up', 'down']).describe('Direction to scroll'),
			amount: z.number().optional().default(300).describe('Pixels to scroll (default 300)'),
			element_index: z.number().int().min(0).optional().describe('Optional: index of element to scroll within'),
		}),
	},
	{
		name: 'scroll_horizontally',
		description: 'Scroll the page horizontally.',
		schema: z.object({
			direction: z.enum(['left', 'right']).describe('Direction to scroll'),
			amount: z.number().optional().default(300).describe('Pixels to scroll (default 300)'),
		}),
	},
	{
		name: 'execute_javascript',
		description: 'Execute JavaScript code in the page context. Use for complex interactions that other tools cannot handle. Supports async/await.',
		schema: z.object({
			code: z.string().describe('JavaScript code to execute. May use async/await.'),
		}),
	},
	{
		name: 'wait',
		description: 'Wait for a specified number of seconds before the next action. Use when waiting for page loads or animations.',
		schema: z.object({
			seconds: z.number().min(1).max(10).describe('Seconds to wait (1-10)'),
		}),
	},
	{
		name: 'ask_user',
		description: 'Ask the user a question and wait for their response. Use when you need information you cannot find on the page.',
		schema: z.object({
			question: z.string().describe('The question to ask the user'),
		}),
	},
	{
		name: 'done',
		description: 'Mark the task as complete. Call this when the task is fully accomplished or when it is impossible to complete.',
		schema: z.object({
			success: z.boolean().describe('True if the task was successfully completed, false if it could not be done'),
			message: z.string().describe('Summary of what was accomplished, or explanation of why the task failed'),
		}),
	},
]

export const TOOL_NAMES = AGENT_TOOLS.map((t) => t.name)
