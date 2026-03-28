import { WebMindCore } from '@webmind/core'
import type { AgentConfig, ExecutionResult } from '@webmind/core'
import { Panel } from '@webmind/ui'
import type { PanelConfig } from '@webmind/ui'

export interface WebMindConfig extends AgentConfig {
	/** Show the floating in-page panel (default: true) */
	enablePanel?: boolean
	/** Panel configuration */
	panel?: PanelConfig
}

/**
 * WebMind — the main public-facing class.
 *
 * Integrates:
 *  - WebMindCore (agent loop, LLM, page controller)
 *  - Panel (in-page floating UI)
 *  - Mask overlay
 *
 * Usage:
 * ```js
 * const agent = new WebMind({ baseURL, model, apiKey })
 * agent.showPanel()
 * await agent.run('Click the sign in button')
 * ```
 */
export class WebMind extends WebMindCore {
	readonly panel: Panel

	constructor(config: WebMindConfig) {
		super(config)

		this.panel = new Panel(config.panel)
		this.panel.attachAgent(this)

		// Auto-enable mask by default
		const enableMask = config.enableMask ?? true
		if (enableMask) {
			this.addEventListener('statuschange', (e) => {
				const status = (e as CustomEvent<{ status: string }>).detail.status
				if (status === 'running') {
					this.getController().showMask()
				} else {
					this.getController().hideMask()
				}
			})
		}

		// Auto-show panel
		if (config.enablePanel !== false) {
			this.panel.show()
		}
	}

	/** Show the floating panel. */
	showPanel(): void {
		this.panel.show()
	}

	/** Hide the floating panel. */
	hidePanel(): void {
		this.panel.hide()
	}

	/** Run a task (delegates to WebMindCore). */
	override async run(task: string): Promise<ExecutionResult> {
		return super.run(task)
	}

	/** Dispose agent and panel. */
	override dispose(): void {
		super.dispose()
		this.panel.destroy()
	}
}
