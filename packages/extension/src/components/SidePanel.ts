/**
 * SidePanel — the Chrome extension side panel UI.
 *
 * Features:
 * - Task input + start/stop controls
 * - Live step-by-step execution log
 * - History list with rerun + export
 * - Settings (LLM config)
 * - ask_user dialog
 */

import { getTranslations } from '@webmind/ui'
import type { Locale } from '@webmind/ui'
import type { AgentStatus, HistoricalEvent } from '@webmind/core'
import { saveHistoryEntry, getHistory, saveConfig, loadConfig } from '../lib/storage.js'

interface StepEntry {
	step: number
	tool: string
	args: Record<string, unknown>
}

interface HistoryEntry {
	id: string
	task: string
	success: boolean
	completedAt: number
	history: HistoricalEvent[]
}

interface Config {
	baseURL: string
	model: string
	apiKey: string
	maxSteps: number
	lang: Locale
}

const DEFAULT_CONFIG: Config = {
	baseURL: '',
	model: 'gpt-4o',
	apiKey: '',
	maxSteps: 40,
	lang: 'en-US',
}

export class SidePanel {
	private container: HTMLElement | null = null
	private status: AgentStatus = 'idle'
	private steps: StepEntry[] = []
	private history: HistoryEntry[] = []
	private pendingQuestion: string | null = null
	private config: Config = { ...DEFAULT_CONFIG }
	private showSettings = false
	private t = getTranslations('en-US')
	private taskInput = ''

	async mount(container: HTMLElement): Promise<void> {
		this.container = container
		this.config = (await loadConfig<Config>('llm-config')) ?? DEFAULT_CONFIG
		this.t = getTranslations(this.config.lang)
		this.history = await getHistory() as HistoryEntry[]
		this.render()
		this.listenToBackground()
	}

	private render(): void {
		if (!this.container) return
		this.container.innerHTML = this.buildHTML()
		this.bindEvents()
	}

	private buildHTML(): string {
		const t = this.t
		const isRunning = this.status === 'running'

		return `
<div style="display:flex;flex-direction:column;height:100vh;background:#f9fafb">
  <!-- Header -->
  <div style="background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#fff;padding:14px 16px;display:flex;align-items:center;justify-content:space-between">
    <span style="font-weight:700;font-size:15px">⚡ WebMind</span>
    <div style="display:flex;gap:8px;align-items:center">
      <span style="font-size:11px;background:rgba(255,255,255,0.2);padding:2px 8px;border-radius:20px">${this.statusLabel()}</span>
      <button data-action="toggle-settings" style="background:none;border:none;color:rgba(255,255,255,0.8);cursor:pointer;font-size:16px">⚙</button>
    </div>
  </div>

  ${this.showSettings ? this.buildSettings() : this.buildMain()}
</div>`
	}

	private buildMain(): string {
		const t = this.t
		const isRunning = this.status === 'running'

		return `
<div style="flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:10px">
  <!-- Task input -->
  <div style="display:flex;flex-direction:column;gap:6px">
    <textarea data-el="task-input" rows="3"
      style="width:100%;border:1.5px solid #e5e7eb;border-radius:8px;padding:8px;font-size:12px;font-family:inherit;resize:vertical;outline:none"
      placeholder="${t.taskPlaceholder}"
      ${isRunning ? 'disabled' : ''}>${this.taskInput}</textarea>
    <div style="display:flex;gap:6px;justify-content:flex-end">
      ${isRunning
			? `<button data-action="stop" style="padding:7px 16px;background:#ef4444;color:#fff;border:none;border-radius:7px;font-size:12px;font-weight:600;cursor:pointer">${t.stopButton}</button>`
			: `<button data-action="start" style="padding:7px 16px;background:#4f46e5;color:#fff;border:none;border-radius:7px;font-size:12px;font-weight:600;cursor:pointer">${t.startButton}</button>`
		}
    </div>
  </div>

  <!-- Ask user -->
  ${this.pendingQuestion ? `
  <div style="background:#fffbeb;border:1.5px solid #fbbf24;border-radius:8px;padding:10px">
    <div style="font-weight:600;color:#92400e;font-size:12px;margin-bottom:4px">${t.askingUser}</div>
    <div style="color:#78350f;font-size:12px;margin-bottom:8px">${this.pendingQuestion}</div>
    <input data-el="ask-input" style="width:100%;border:1.5px solid #fbbf24;border-radius:6px;padding:6px;font-size:12px;outline:none" placeholder="${t.answerPlaceholder}" />
    <button data-action="submit-answer" style="margin-top:6px;padding:6px 12px;background:#f59e0b;color:#fff;border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer">${t.submitAnswer}</button>
  </div>` : ''}

  <!-- Steps log -->
  ${this.steps.length > 0 ? `
  <div>
    <div style="font-size:11px;font-weight:600;color:#6b7280;margin-bottom:4px">${t.step}s</div>
    <div style="display:flex;flex-direction:column;gap:3px;max-height:200px;overflow-y:auto">
      ${this.steps.slice(-8).map((s) => `
      <div style="background:#f0f0ff;border:1px solid #e0e0f0;border-radius:5px;padding:5px 7px;font-size:11px">
        <span style="color:#4f46e5;font-weight:600">[${s.step + 1}] ${s.tool}</span>
        ${Object.keys(s.args).length ? `<span style="color:#6b7280"> — ${JSON.stringify(s.args).slice(0, 50)}</span>` : ''}
      </div>`).join('')}
    </div>
  </div>` : ''}

  <!-- History -->
  <div>
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
      <span style="font-size:11px;font-weight:600;color:#6b7280">${t.historyTitle}</span>
      ${this.history.length > 0 ? `<button data-action="export" style="font-size:10px;color:#4f46e5;background:none;border:none;cursor:pointer;text-decoration:underline">${t.exportHistory}</button>` : ''}
    </div>
    ${this.history.length === 0
		? `<div style="text-align:center;color:#9ca3af;font-size:11px;padding:12px">${t.noHistory}</div>`
		: `<div style="display:flex;flex-direction:column;gap:3px;max-height:200px;overflow-y:auto">
      ${this.history.slice().reverse().slice(0, 10).map((e) => `
      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:6px 8px;display:flex;align-items:center;gap:6px">
        <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;color:#374151" title="${e.task}">${e.task}</span>
        <span style="font-size:10px;padding:1px 5px;border-radius:4px;${e.success ? 'background:#dcfce7;color:#166534' : 'background:#fee2e2;color:#991b1b'}">${e.success ? '✓' : '✗'}</span>
        <button data-action="rerun" data-task="${encodeURIComponent(e.task)}" style="font-size:10px;color:#6b7280;background:none;border:none;cursor:pointer">${t.rerunTask}</button>
      </div>`).join('')}
    </div>`
	}
  </div>
</div>`
	}

	private buildSettings(): string {
		const t = this.t
		const c = this.config
		return `
<div style="flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:12px">
  <h2 style="font-size:14px;font-weight:700;color:#374151">${t.settings}</h2>
  ${this.fieldInput('baseURL', t.baseUrl, c.baseURL, 'https://api.openai.com/v1')}
  ${this.fieldInput('model', t.model, c.model, 'gpt-4o')}
  ${this.fieldInput('apiKey', t.apiKey, c.apiKey, 'sk-...', 'password')}
  ${this.fieldInput('maxSteps', t.maxSteps, String(c.maxSteps), '40', 'number')}
  <div>
    <label style="display:block;font-size:11px;font-weight:600;color:#6b7280;margin-bottom:4px">Language</label>
    <select data-el="lang" style="width:100%;border:1.5px solid #e5e7eb;border-radius:6px;padding:6px;font-size:12px">
      <option value="en-US" ${c.lang === 'en-US' ? 'selected' : ''}>English</option>
      <option value="zh-CN" ${c.lang === 'zh-CN' ? 'selected' : ''}>中文</option>
    </select>
  </div>
  <button data-action="save-config" style="padding:8px;background:#4f46e5;color:#fff;border:none;border-radius:7px;font-size:12px;font-weight:600;cursor:pointer">${t.save}</button>
  <button data-action="toggle-settings" style="padding:8px;background:#f3f4f6;color:#374151;border:1px solid #e5e7eb;border-radius:7px;font-size:12px;cursor:pointer">← Back</button>
</div>`
	}

	private fieldInput(
		key: string,
		label: string,
		value: string,
		placeholder: string,
		type = 'text',
	): string {
		return `<div>
  <label style="display:block;font-size:11px;font-weight:600;color:#6b7280;margin-bottom:4px">${label}</label>
  <input data-el="${key}" type="${type}" value="${value}" placeholder="${placeholder}"
    style="width:100%;border:1.5px solid #e5e7eb;border-radius:6px;padding:6px;font-size:12px;outline:none" />
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

	private bindEvents(): void {
		if (!this.container) return

		this.container.addEventListener('click', (e) => {
			const target = e.target as HTMLElement
			const action = target.dataset.action
			if (!action) return

			switch (action) {
				case 'start': this.handleStart(); break
				case 'stop': this.handleStop(); break
				case 'submit-answer': this.handleSubmitAnswer(); break
				case 'export': this.exportHistory(); break
				case 'toggle-settings': this.showSettings = !this.showSettings; this.render(); break
				case 'save-config': this.handleSaveConfig(); break
				case 'rerun': {
					const task = decodeURIComponent(target.dataset.task ?? '')
					if (task) {
						this.taskInput = task
						this.showSettings = false
						this.render()
					}
					break
				}
			}
		})

		// Capture task input changes
		const taskInputEl = this.container.querySelector('[data-el="task-input"]') as HTMLTextAreaElement
		taskInputEl?.addEventListener('input', () => {
			this.taskInput = taskInputEl.value
		})
	}

	private handleStart(): void {
		const input = this.container?.querySelector('[data-el="task-input"]') as HTMLTextAreaElement
		const task = input?.value.trim()
		if (!task) return

		this.steps = []
		this.pendingQuestion = null

		chrome.runtime.sendMessage({
			type: 'START_TASK',
			task,
			config: this.config,
		})
		this.render()
	}

	private handleStop(): void {
		chrome.runtime.sendMessage({ type: 'STOP_TASK' })
	}

	private handleSubmitAnswer(): void {
		const input = this.container?.querySelector('[data-el="ask-input"]') as HTMLInputElement
		const answer = input?.value.trim()
		if (!answer) return

		this.pendingQuestion = null
		chrome.runtime.sendMessage({ type: 'USER_ANSWER', answer })
		this.render()
	}

	private async handleSaveConfig(): Promise<void> {
		const get = (key: string) =>
			(this.container?.querySelector(`[data-el="${key}"]`) as HTMLInputElement | null)?.value ?? ''

		this.config = {
			baseURL: get('baseURL'),
			model: get('model'),
			apiKey: get('apiKey'),
			maxSteps: parseInt(get('maxSteps')) || 40,
			lang: (get('lang') || 'en-US') as Locale,
		}

		await saveConfig('llm-config', this.config)
		this.t = getTranslations(this.config.lang)
		this.showSettings = false
		this.render()
	}

	private listenToBackground(): void {
		chrome.runtime.onMessage.addListener((msg) => {
			if (msg.type === 'TASK_STATUS') {
				this.status = msg.status
				this.render()
			}
			if (msg.type === 'TASK_ACTIVITY') {
				const activity = msg.activity
				if (activity?.type === 'executing') {
					this.steps.push({
						step: this.steps.length,
						tool: activity.tool,
						args: activity.args ?? {},
					})
					this.render()
				}
			}
			if (msg.type === 'TASK_RESULT') {
				const result = msg.result
				const input = this.container?.querySelector('[data-el="task-input"]') as HTMLTextAreaElement
				const task = input?.value ?? ''

				const entry: HistoryEntry = {
					id: crypto.randomUUID(),
					task,
					success: result.success,
					completedAt: Date.now(),
					history: result.history ?? [],
				}
				this.history.push(entry)
				void saveHistoryEntry(entry as Parameters<typeof saveHistoryEntry>[0])
				this.render()
			}
			if (msg.type === 'ASK_USER') {
				this.pendingQuestion = msg.question
				this.render()
			}
		})
	}

	private exportHistory(): void {
		const json = JSON.stringify(this.history, null, 2)
		const blob = new Blob([json], { type: 'application/json' })
		const url = URL.createObjectURL(blob)
		const a = document.createElement('a')
		a.href = url
		a.download = `webmind-history-${Date.now()}.json`
		document.body.appendChild(a)
		a.click()
		document.body.removeChild(a)
		URL.revokeObjectURL(url)
	}
}
