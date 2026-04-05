import { LLM, validateAction } from '@webmind/llms'
import type { LLMMessage, ToolCall } from '@webmind/llms'
import { PageController } from '@webmind/page-controller'
import { AGENT_TOOLS } from './tools/index.js'
import type {
	AgentActivity,
	AgentConfig,
	AgentReflection,
	AgentStatus,
	ErrorEvent,
	ExecutionResult,
	HistoricalEvent,
	MacroToolInput,
	ObservationEvent,
	StepEvent,
	TakeoverEvent,
} from './types.js'
import { delay, fetchLlmsTxt } from './utils/index.js'

// System prompt loaded at build time — bundler will inline it
const SYSTEM_PROMPT = `You are WebMind, an AI agent that controls web browsers via natural language.

You receive a simplified DOM with numbered interactive elements and must accomplish the user's task.

Before every action, reflect:
- evaluation_previous_goal: Did the last action succeed? What happened?
- memory: Key facts gathered that you must remember
- next_goal: Exactly what you will do next and why

Tools: click_element_by_index, input_text, select_dropdown_option, scroll, scroll_horizontally, execute_javascript, wait, ask_user, done

Rules:
- Reference elements only by index [N]
- Avoid repeating failed actions more than 3 times
- Call done when task is complete OR impossible
- Set success:true ONLY when fully accomplished
- No captchas, no login without credentials, no purchases
- Use ask_user when you need info not visible on page`

/**
 * WebMindCore — headless agent loop.
 *
 * Extends EventTarget and emits:
 *   - "statuschange" CustomEvent<{ status: AgentStatus }>
 *   - "historychange" CustomEvent<{ history: HistoricalEvent[] }>
 *   - "activity" CustomEvent<{ activity: AgentActivity }>
 *   - "dispose" Event
 *
 * Pattern: Observer (EventTarget), State Machine (AgentStatus),
 *          Template Method (run + step hooks)
 */
export class WebMindCore extends EventTarget {
	protected readonly llm: LLM
	protected readonly controller: PageController

	private _status: AgentStatus = 'idle'
	private _history: HistoricalEvent[] = []
	private _running = false
	private _stopRequested = false

	// Ask-user promise resolver
	private _askUserResolver: ((answer: string) => void) | null = null

	constructor(protected readonly config: AgentConfig) {
		super()
		this.llm = new LLM(config)
		this.controller = new PageController()

		// Forward LLM retry events
		this.llm.addEventListener('retry', (e) => {
			const detail = (e as CustomEvent).detail as { attempt: number; error: Error }
			this.emitActivity({
				type: 'retrying',
				attempt: detail.attempt,
				reason: detail.error.message,
			})
		})
	}

	// ─── Public API ────────────────────────────────────────────────────────────

	get status(): AgentStatus {
		return this._status
	}

	get history(): HistoricalEvent[] {
		return [...this._history]
	}

	/**
	 * Run the agent on a task. Returns when done or max steps reached.
	 */
	async run(task: string): Promise<ExecutionResult> {
		if (this._running) {
			return { success: false, data: 'Agent is already running', history: [], steps: 0 }
		}

		this._running = true
		this._stopRequested = false
		this._history = []
		this.setStatus('running')

		const maxSteps = this.config.maxSteps ?? 40
		const stepDelay = this.config.stepDelay ?? 400
		const tools = [...AGENT_TOOLS, ...(this.config.customTools ?? [])]
			const allToolNames = tools.map((t) => t.name)

		await this.config.onBeforeTask?.(task)

		try {
			// Build initial system message
			const systemContent = this.buildSystemPrompt()
			const messages: LLMMessage[] = [
				{ role: 'system', content: systemContent },
				{ role: 'user', content: task },
			]

			// Optionally fetch llms.txt
			if (this.config.fetchLlmsTxt) {
				const llmsTxt = await fetchLlmsTxt(window.location.href)
				if (llmsTxt) {
					messages.push({
						role: 'user',
						content: `[Site context from llms.txt]\n${llmsTxt}`,
					})
				}
			}

			let step = 0

			while (step < maxSteps && !this._stopRequested) {
				await this.config.onBeforeStep?.(step)

				// Observe
				const simplifiedHTML = await this.controller.updateTree()
				const browserState = this.controller.getBrowserState()

				const observationHTML = this.config.transformPageContent
					? this.config.transformPageContent(simplifiedHTML)
					: simplifiedHTML

				// Add observation to messages
				messages.push({
					role: 'user',
					content: `[Step ${step + 1}] Current page state:\nURL: ${browserState.url}\nTitle: ${document.title}\n\nInteractive elements:\n${observationHTML}\n\nScroll: ${browserState.canScrollUp ? 'can scroll up' : ''}${browserState.canScrollDown ? ' can scroll down' : ''}`.trim(),
				})

				this.pushHistory<ObservationEvent>({
					type: 'observation',
					step,
					simplifiedHTML: observationHTML,
					browserState,
					timestamp: Date.now(),
				})

				// Think + Act
				this.emitActivity({ type: 'thinking', text: `Step ${step + 1}/${maxSteps}` })

				const response = await this.llm.call({
					messages,
					tools,
					toolChoice: 'auto',
					temperature: this.config.temperature,
				})

				if (this._stopRequested) break

				// Add assistant response to conversation
				const assistantMsg: LLMMessage = {
					role: 'assistant',
					content: response.content,
				}
				if (response.toolCalls.length > 0) {
					assistantMsg.tool_calls = response.toolCalls
				}
				messages.push(assistantMsg)

				// Process tool calls
				let taskDone = false
				let result: ExecutionResult = { success: false, data: 'No action taken', history: this._history, steps: step + 1 }

				for (const toolCall of response.toolCalls) {
					const validated = validateAction(toolCall, allToolNames)
					if (!validated) {
						console.warn(`[WebMind] Unknown tool: ${toolCall.name}`)
						continue
					}

					// Extract reflection if it was passed as part of arguments
					const reflection = extractReflection(validated.arguments)
					const actionArgs = cleanActionArgs(validated.arguments)

					const macroInput: MacroToolInput = {
						reflection,
						action: { name: validated.name, args: actionArgs },
					}

					this.emitActivity({
						type: 'executing',
						tool: validated.name,
						args: actionArgs,
					})

					this.pushHistory<StepEvent>({
						type: 'step',
						step,
						reflection,
						tool: validated.name,
						args: actionArgs,
						timestamp: Date.now(),
					})

					// Execute tool
					const toolResult = await this.executeTool(validated, messages)

					if (validated.name === 'done') {
						taskDone = true
						const success = Boolean(actionArgs.success)
						const message = String(actionArgs.message ?? '')
						result = { success, data: message, history: this._history, steps: step + 1 }
					}

					if (validated.name === 'ask_user') {
						// toolResult contains the user's answer
						messages.push({
							role: 'tool',
							content: toolResult,
							tool_call_id: toolCall.id,
						})
					} else {
						messages.push({
							role: 'tool',
							content: toolResult,
							tool_call_id: toolCall.id,
						})
					}

					await this.config.onAfterStep?.(step, macroInput)

					if (taskDone) break
				}

				if (taskDone) {
					this.setStatus('completed')
					await this.config.onAfterTask?.(result)
					return result
				}

				step++

				if (step < maxSteps && !this._stopRequested) {
					await delay(stepDelay)
				}
			}

			// Max steps reached
			const result: ExecutionResult = {
				success: false,
				data: `Max steps (${maxSteps}) reached without completing the task`,
				history: this._history,
				steps: maxSteps,
			}
			this.setStatus('completed')
			await this.config.onAfterTask?.(result)
			return result

		} catch (err) {
			const message = err instanceof Error ? err.message : String(err)
			this.pushHistory<ErrorEvent>({
				type: 'error',
				step: this._history.filter((h) => h.type === 'step').length,
				message,
				timestamp: Date.now(),
			})
			this.emitActivity({ type: 'error', message })
			this.setStatus('error')

			const result: ExecutionResult = {
				success: false,
				data: message,
				history: this._history,
				steps: 0,
			}
			await this.config.onAfterTask?.(result)
			return result

		} finally {
			this._running = false
		}
	}

	/**
	 * Request the agent to stop after the current step.
	 */
	stop(): void {
		this._stopRequested = true
	}

	/**
	 * Provide an answer to an ask_user question.
	 */
	pushObservation(answer: string): void {
		if (this._askUserResolver) {
			this._askUserResolver(answer)
			this._askUserResolver = null
		}
	}

	/**
	 * Dispose the agent and clean up resources.
	 */
	dispose(): void {
		this._stopRequested = true
		this.controller.dispose()
		this.dispatchEvent(new Event('dispose'))
	}

	// ─── Tool Execution ────────────────────────────────────────────────────────

	protected async executeTool(
		toolCall: ToolCall,
		_messages: LLMMessage[],
	): Promise<string> {
		const { name, arguments: args } = toolCall

		try {
			switch (name) {
				case 'click_element_by_index':
					await this.controller.clickElement(Number(args.index))
					return 'Clicked element successfully'

				case 'input_text':
					await this.controller.inputText(Number(args.index), String(args.text))
					return 'Text entered successfully'

				case 'select_dropdown_option':
					await this.controller.selectDropdownOption(
						Number(args.index),
						String(args.option_text),
					)
					return 'Option selected successfully'

				case 'scroll':
					await this.controller.scroll(
						args.direction as 'up' | 'down',
						typeof args.amount === 'number' ? args.amount : 300,
						typeof args.element_index === 'number' ? args.element_index : undefined,
					)
					return 'Scrolled successfully'

				case 'scroll_horizontally':
					await this.controller.scrollHorizontally(
						args.direction as 'left' | 'right',
						typeof args.amount === 'number' ? args.amount : 300,
					)
					return 'Scrolled horizontally'

				case 'execute_javascript': {
					const result = await this.controller.executeJavaScript(String(args.code))
					return result !== undefined ? String(result) : 'JavaScript executed'
				}

				case 'wait':
					await this.controller.wait(Number(args.seconds))
					return `Waited ${args.seconds} second(s)`

				case 'ask_user': {
					const question = String(args.question)
					this.emitActivity({ type: 'asking', question })
					const answer = await this.waitForUserAnswer(question)
					return answer
				}

				case 'done':
					return String(args.message ?? 'Task complete')

				default:
					return `Unknown tool: ${name}`
			}
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err)
			return `Error executing ${name}: ${msg}`
		}
	}

	// ─── User interaction ──────────────────────────────────────────────────────

	private waitForUserAnswer(question: string): Promise<string> {
		return new Promise((resolve) => {
			this._askUserResolver = resolve
			// Dispatch event so UI can show the question
			this.dispatchEvent(
				new CustomEvent('activity', {
					detail: { activity: { type: 'asking', question } },
				}),
			)
		})
	}

	// ─── State management ──────────────────────────────────────────────────────

	private setStatus(status: AgentStatus): void {
		this._status = status
		this.dispatchEvent(
			new CustomEvent('statuschange', { detail: { status } }),
		)
	}

	private pushHistory<T extends HistoricalEvent>(event: T): void {
		this._history.push(event)
		this.dispatchEvent(
			new CustomEvent('historychange', { detail: { history: this._history } }),
		)
	}

	private emitActivity(activity: AgentActivity): void {
		this.dispatchEvent(
			new CustomEvent('activity', { detail: { activity } }),
		)
	}

	// ─── Prompt building ───────────────────────────────────────────────────────

	private buildSystemPrompt(): string {
		let prompt = SYSTEM_PROMPT
		if (this.config.customSystemPrompt) {
			prompt += `\n\n## Additional Instructions\n${this.config.customSystemPrompt}`
		}
		const lang = this.config.lang
		if (lang) {
			prompt += `\n\nRespond in: ${lang === 'zh-CN' ? 'Chinese (Simplified)' : 'English'}`
		}
		return prompt
	}
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractReflection(args: Record<string, unknown>): AgentReflection {
	const r = args.reflection as Record<string, unknown> | undefined
	return {
		evaluation_previous_goal: String(r?.evaluation_previous_goal ?? ''),
		memory: String(r?.memory ?? ''),
		next_goal: String(r?.next_goal ?? ''),
	}
}

function cleanActionArgs(args: Record<string, unknown>): Record<string, unknown> {
	const { reflection: _r, ...rest } = args
	return rest
}
