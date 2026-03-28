import type { AgentActivity, AgentStatus, HistoricalEvent, WebMindCore } from '@webmind/core'
import { getTranslations } from '../i18n/index.js'
import type { Locale } from '../i18n/index.js'
import type { HistoryEntry, PanelConfig, StepLog } from './types.js'

const PANEL_ID = '__webmind_panel__'
const STYLE_ID = '__webmind_panel_style__'

const PANEL_CSS = `
#${PANEL_ID} {
  position: fixed;
  z-index: 2147483647;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  font-size: 13px;
  line-height: 1.4;
  color: #1a1a1a;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 8px 40px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.06);
  width: 340px;
  max-height: 600px;
  display: flex;
  flex-direction: column;
  transition: all 0.2s ease;
  overflow: hidden;
}
#${PANEL_ID}.bottom-right { bottom: 20px; right: 20px; }
#${PANEL_ID}.bottom-left  { bottom: 20px; left:  20px; }
#${PANEL_ID}.top-right    { top:    20px; right: 20px; }
#${PANEL_ID}.top-left     { top:    20px; left:  20px; }

.wm-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 14px 10px;
  border-bottom: 1px solid #f0f0f0;
  background: linear-gradient(135deg, #4f46e5, #7c3aed);
  color: #fff;
  border-radius: 12px 12px 0 0;
  cursor: move;
  user-select: none;
}
.wm-logo { font-weight: 700; font-size: 14px; letter-spacing: -0.3px; }
.wm-status-badge {
  font-size: 11px; padding: 2px 8px;
  border-radius: 20px; background: rgba(255,255,255,0.2);
  font-weight: 500;
}
.wm-status-badge.running { background: rgba(250,204,21,0.3); color: #fef08a; }
.wm-status-badge.completed { background: rgba(74,222,128,0.3); color: #86efac; }
.wm-status-badge.error { background: rgba(248,113,113,0.3); color: #fca5a5; }

.wm-close-btn {
  background: none; border: none; color: rgba(255,255,255,0.7);
  cursor: pointer; font-size: 18px; line-height: 1; padding: 0 2px;
  transition: color 0.15s;
}
.wm-close-btn:hover { color: #fff; }

.wm-body { padding: 12px; flex: 1; overflow-y: auto; }

.wm-input-row {
  display: flex; gap: 6px;
}
.wm-task-input {
  flex: 1;
  border: 1.5px solid #e5e7eb;
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 12px;
  resize: none;
  font-family: inherit;
  outline: none;
  transition: border-color 0.15s;
  min-height: 60px;
}
.wm-task-input:focus { border-color: #4f46e5; }
.wm-task-input:disabled { background: #f9f9f9; color: #999; }

.wm-btn {
  padding: 8px 14px;
  border: none; border-radius: 8px;
  font-size: 12px; font-weight: 600;
  cursor: pointer; transition: all 0.15s;
  white-space: nowrap; align-self: flex-end;
}
.wm-btn-primary {
  background: #4f46e5; color: #fff;
}
.wm-btn-primary:hover { background: #4338ca; }
.wm-btn-danger { background: #ef4444; color: #fff; }
.wm-btn-danger:hover { background: #dc2626; }
.wm-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.wm-steps {
  margin-top: 10px;
  max-height: 180px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.wm-step-item {
  background: #f8f8ff;
  border: 1px solid #e8e8f8;
  border-radius: 6px;
  padding: 6px 8px;
  font-size: 11px;
}
.wm-step-tool { font-weight: 600; color: #4f46e5; }
.wm-thinking-label { color: #9ca3af; font-style: italic; font-size: 11px; margin-top: 6px; }

.wm-ask-box {
  margin-top: 10px;
  background: #fffbeb;
  border: 1.5px solid #fbbf24;
  border-radius: 8px;
  padding: 10px;
}
.wm-ask-label { font-weight: 600; color: #92400e; font-size: 12px; margin-bottom: 6px; }
.wm-ask-question { color: #78350f; margin-bottom: 8px; font-size: 12px; }
.wm-ask-input {
  width: 100%; box-sizing: border-box;
  border: 1.5px solid #fbbf24; border-radius: 6px;
  padding: 6px 8px; font-size: 12px; font-family: inherit;
  outline: none; margin-bottom: 6px;
}
.wm-ask-input:focus { border-color: #f59e0b; }

.wm-history-header {
  display: flex; align-items: center; justify-content: space-between;
  margin-top: 12px; margin-bottom: 6px;
}
.wm-history-title { font-weight: 600; font-size: 12px; color: #6b7280; }
.wm-export-btn {
  font-size: 10px; color: #4f46e5; cursor: pointer;
  background: none; border: none; text-decoration: underline;
  padding: 0;
}
.wm-history-list { display: flex; flex-direction: column; gap: 4px; max-height: 140px; overflow-y: auto; }
.wm-history-item {
  display: flex; align-items: center; justify-content: space-between;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  padding: 6px 8px;
  font-size: 11px;
  cursor: pointer;
}
.wm-history-item:hover { background: #f0f0ff; }
.wm-history-task { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #374151; }
.wm-history-status { font-size: 10px; padding: 1px 5px; border-radius: 4px; margin-left: 6px; }
.wm-history-status.success { background: #dcfce7; color: #166534; }
.wm-history-status.failed { background: #fee2e2; color: #991b1b; }
.wm-rerun-btn {
  font-size: 10px; color: #6b7280; cursor: pointer;
  background: none; border: none; margin-left: 6px; padding: 0;
}
.wm-rerun-btn:hover { color: #4f46e5; }
`

/**
 * Panel — the floating in-page UI for WebMind.
 *
 * Creates a draggable panel injected into the host page's DOM.
 * No React/framework dependencies — pure DOM manipulation for maximum compatibility.
 *
 * Pattern: Observer (listens to agent events), Facade (single show/hide/update API)
 */
export class Panel {
	private el: HTMLElement | null = null
	private agent: WebMindCore | null = null
	private history: HistoryEntry[] = []
	private steps: StepLog[] = []
	private status: AgentStatus = 'idle'
	private pendingQuestion: string | null = null
	private dragOffset = { x: 0, y: 0 }
	private isDragging = false
	private readonly t: ReturnType<typeof getTranslations>
	private readonly position: string

	constructor(private readonly config: PanelConfig = {}) {
		this.t = getTranslations(config.locale as Locale)
		this.position = config.position ?? 'bottom-right'
	}

	/** Attach the panel to an agent instance. */
	attachAgent(agent: WebMindCore): void {
		this.agent = agent

		agent.addEventListener('statuschange', (e) => {
			this.status = (e as CustomEvent<{ status: AgentStatus }>).detail.status
			this.update()
		})

		agent.addEventListener('activity', (e) => {
			const activity = (e as CustomEvent<{ activity: AgentActivity }>).detail.activity
			this.handleActivity(activity)
		})

		agent.addEventListener('historychange', () => {
			this.update()
		})
	}

	/** Show the panel (creates DOM if needed). */
	show(): void {
		if (!this.el) {
			this.mount()
		}
		if (this.el) this.el.style.display = 'flex'
	}

	/** Hide the panel. */
	hide(): void {
		if (this.el) this.el.style.display = 'none'
	}

	/** Remove panel from DOM. */
	destroy(): void {
		this.el?.remove()
		this.el = null
	}

	// ─── Private ───────────────────────────────────────────────────────────────

	private mount(): void {
		injectPanelStyles()

		const panel = document.createElement('div')
		panel.id = PANEL_ID
		panel.className = this.position
		panel.innerHTML = this.render()

		document.body.appendChild(panel)
		this.el = panel

		this.bindEvents()
	}

	private render(): string {
		const t = this.t
		const isRunning = this.status === 'running'

		return `
<div class="wm-header">
  <span class="wm-logo">⚡ WebMind</span>
  <span class="wm-status-badge ${this.status}">${this.statusLabel()}</span>
  <button class="wm-close-btn" data-action="close">×</button>
</div>
<div class="wm-body">
  <div class="wm-input-row">
    <textarea class="wm-task-input" data-el="task-input"
      placeholder="${t.taskPlaceholder}"
      ${isRunning ? 'disabled' : ''}></textarea>
    ${isRunning
			? `<button class="wm-btn wm-btn-danger" data-action="stop">${t.stopButton}</button>`
			: `<button class="wm-btn wm-btn-primary" data-action="start">${t.startButton}</button>`
		}
  </div>
  ${isRunning ? `<div class="wm-thinking-label" data-el="thinking">${t.thinking}</div>` : ''}
  ${this.renderSteps()}
  ${this.pendingQuestion ? this.renderAskBox() : ''}
  ${this.renderHistory()}
</div>`
	}

	private renderSteps(): string {
		if (this.steps.length === 0) return ''
		const latest = this.steps.slice(-5)
		return `<div class="wm-steps">${latest.map((s) => `
<div class="wm-step-item">
  <span class="wm-step-tool">[${s.step + 1}] ${s.tool}</span>
  ${Object.keys(s.args).length ? ` — ${JSON.stringify(s.args).slice(0, 60)}` : ''}
</div>`).join('')}</div>`
	}

	private renderAskBox(): string {
		const t = this.t
		return `<div class="wm-ask-box">
  <div class="wm-ask-label">${t.askingUser}</div>
  <div class="wm-ask-question">${this.pendingQuestion}</div>
  <input class="wm-ask-input" data-el="ask-input" placeholder="${t.answerPlaceholder}" />
  <button class="wm-btn wm-btn-primary" data-action="submit-answer">${t.submitAnswer}</button>
</div>`
	}

	private renderHistory(): string {
		const t = this.t
		if (this.history.length === 0) {
			return `<div class="wm-history-header"><span class="wm-history-title">${t.historyTitle}</span></div>
<div style="color:#9ca3af;font-size:11px;text-align:center;padding:8px 0">${t.noHistory}</div>`
		}
		return `
<div class="wm-history-header">
  <span class="wm-history-title">${t.historyTitle}</span>
  <button class="wm-export-btn" data-action="export">${t.exportHistory}</button>
</div>
<div class="wm-history-list">
${this.history.slice().reverse().map((entry) => `
<div class="wm-history-item" data-id="${entry.id}">
  <span class="wm-history-task" title="${entry.task}">${entry.task}</span>
  <span class="wm-history-status ${entry.success ? 'success' : 'failed'}">${entry.success ? '✓' : '✗'}</span>
  <button class="wm-rerun-btn" data-action="rerun" data-task="${encodeURIComponent(entry.task)}">${t.rerunTask}</button>
</div>`).join('')}
</div>`
	}

	private statusLabel(): string {
		const t = this.t
		switch (this.status) {
			case 'idle': return t.ready
			case 'running': return t.running
			case 'completed': return t.completed
			case 'error': return t.error
		}
	}

	private update(): void {
		if (!this.el) return
		const body = this.el.querySelector('.wm-body')
		if (body) body.innerHTML = this.render().split('</div>\n<div class="wm-body">')[1]?.slice(0, -6) ?? ''

		// Re-render full panel
		this.el.innerHTML = this.render()
		this.bindEvents()
	}

	private handleActivity(activity: AgentActivity): void {
		if (activity.type === 'executing') {
			this.steps.push({
				step: this.steps.length,
				tool: activity.tool,
				args: activity.args,
				thinking: '',
				timestamp: Date.now(),
			})
		}
		if (activity.type === 'asking') {
			this.pendingQuestion = activity.question
		}
		this.update()
	}

	private bindEvents(): void {
		if (!this.el) return

		// Drag
		const header = this.el.querySelector('.wm-header') as HTMLElement
		if (header) {
			header.addEventListener('mousedown', this.onDragStart)
		}

		// Button actions
		this.el.addEventListener('click', (e) => {
			const target = e.target as HTMLElement
			const action = target.dataset.action
			if (!action) return

			switch (action) {
				case 'close': this.hide(); break
				case 'start': this.handleStart(); break
				case 'stop': this.agent?.stop(); break
				case 'submit-answer': this.handleSubmitAnswer(); break
				case 'export': this.exportHistory(); break
				case 'rerun': {
					const task = decodeURIComponent(target.dataset.task ?? '')
					if (task) this.handleRerun(task)
					break
				}
			}
		})
	}

	private handleStart(): void {
		const input = this.el?.querySelector('[data-el="task-input"]') as HTMLTextAreaElement
		const task = input?.value.trim()
		if (!task || !this.agent) return

		this.steps = []
		this.pendingQuestion = null

		this.agent.run(task).then((result) => {
			const entry: HistoryEntry = {
				id: crypto.randomUUID(),
				task,
				status: result.success ? 'completed' : 'error',
				startedAt: Date.now(),
				completedAt: Date.now(),
				success: result.success,
				data: result.data,
				history: result.history,
			}
			this.history.push(entry)
			this.update()
		})
	}

	private handleSubmitAnswer(): void {
		const input = this.el?.querySelector('[data-el="ask-input"]') as HTMLInputElement
		const answer = input?.value.trim()
		if (!answer || !this.agent) return

		this.pendingQuestion = null
		this.agent.pushObservation(answer)
		this.update()
	}

	private handleRerun(task: string): void {
		const input = this.el?.querySelector('[data-el="task-input"]') as HTMLTextAreaElement
		if (input) {
			input.value = task
			input.focus()
		}
	}

	private exportHistory(): void {
		const json = JSON.stringify(this.history, null, 2)
		const blob = new Blob([json], { type: 'application/json' })
		const url = URL.createObjectURL(blob)
		const a = document.createElement('a')
		a.href = url
		a.download = `webmind-history-${Date.now()}.json`
		a.click()
		URL.revokeObjectURL(url)
	}

	// ─── Drag support ──────────────────────────────────────────────────────────

	private onDragStart = (e: MouseEvent): void => {
		if (!this.el) return
		this.isDragging = true
		const rect = this.el.getBoundingClientRect()
		this.dragOffset = { x: e.clientX - rect.left, y: e.clientY - rect.top }
		document.addEventListener('mousemove', this.onDragMove)
		document.addEventListener('mouseup', this.onDragEnd)
	}

	private onDragMove = (e: MouseEvent): void => {
		if (!this.isDragging || !this.el) return
		const x = e.clientX - this.dragOffset.x
		const y = e.clientY - this.dragOffset.y
		this.el.style.left = `${x}px`
		this.el.style.top = `${y}px`
		this.el.style.right = 'auto'
		this.el.style.bottom = 'auto'
	}

	private onDragEnd = (): void => {
		this.isDragging = false
		document.removeEventListener('mousemove', this.onDragMove)
		document.removeEventListener('mouseup', this.onDragEnd)
	}
}

function injectPanelStyles(): void {
	if (document.getElementById(STYLE_ID)) return
	const style = document.createElement('style')
	style.id = STYLE_ID
	style.textContent = PANEL_CSS
	document.head.appendChild(style)
}
