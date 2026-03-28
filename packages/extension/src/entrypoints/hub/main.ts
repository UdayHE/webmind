/**
 * Hub page — real-time dashboard for the WebMind extension.
 *
 * Displays:
 * - MCP hub WebSocket connection status
 * - Current agent status (idle / running / completed / error)
 * - Live activity log
 * - Stop button for running tasks
 *
 * Communicates with the background service worker via chrome.runtime.sendMessage.
 */

interface HubState {
	hubConnected: boolean
	agentStatus: string
	currentTask: string | null
	steps: Array<{ step: number; tool: string; args: Record<string, unknown> }>
}

const state: HubState = {
	hubConnected: false,
	agentStatus: 'idle',
	currentTask: null,
	steps: [],
}

// ─── Render ───────────────────────────────────────────────────────────────────

function render(): void {
	const root = document.getElementById('root')
	if (!root) return
	root.innerHTML = buildHTML()
	bindEvents()
}

function buildHTML(): string {
	return `
<div style="max-width:560px;width:100%;margin:0 auto;display:flex;flex-direction:column;gap:16px">

  <!-- Header -->
  <div style="background:rgba(255,255,255,0.15);backdrop-filter:blur(10px);border-radius:16px;padding:24px 28px;color:#fff;display:flex;align-items:center;justify-content:space-between">
    <div>
      <div style="font-size:22px;font-weight:800;letter-spacing:-0.5px">⚡ WebMind Hub</div>
      <div style="font-size:13px;opacity:0.75;margin-top:2px">Browser Agent Dashboard</div>
    </div>
    <button data-action="open-sidepanel"
      style="padding:8px 16px;background:rgba(255,255,255,0.25);border:1px solid rgba(255,255,255,0.4);border-radius:8px;color:#fff;font-size:12px;font-weight:600;cursor:pointer">
      Open Panel
    </button>
  </div>

  <!-- MCP Connection card -->
  <div style="background:#fff;border-radius:14px;padding:20px 24px;box-shadow:0 4px 24px rgba(0,0,0,0.12)">
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#6b7280;margin-bottom:10px">
      MCP Server Connection
    </div>
    <div style="display:flex;align-items:center;gap:10px">
      <div style="width:12px;height:12px;border-radius:50%;flex-shrink:0;${state.hubConnected
		? 'background:#22c55e;box-shadow:0 0 0 3px rgba(34,197,94,0.2)'
		: 'background:#ef4444;box-shadow:0 0 0 3px rgba(239,68,68,0.15)'}"></div>
      <div>
        <div style="font-weight:600;font-size:14px;color:#111827">${state.hubConnected ? 'Connected to MCP Hub' : 'Disconnected'}</div>
        <div style="font-size:11px;color:#9ca3af;margin-top:1px">ws://localhost:38401</div>
      </div>
    </div>
  </div>

  <!-- Agent status card -->
  <div style="background:#fff;border-radius:14px;padding:20px 24px;box-shadow:0 4px 24px rgba(0,0,0,0.12)">
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#6b7280;margin-bottom:10px">
      Agent Status
    </div>
    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px">
      <div style="display:flex;align-items:center;gap:10px">
        <span style="padding:4px 12px;border-radius:20px;font-size:12px;font-weight:700;${statusStyle(state.agentStatus)}">
          ${state.agentStatus.toUpperCase()}
        </span>
        ${state.currentTask
		? `<span style="font-size:13px;color:#374151;max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escHtml(state.currentTask)}">
          "${escHtml(state.currentTask)}"
        </span>`
		: ''}
      </div>
      ${state.agentStatus === 'running'
		? `<button data-action="stop-task"
          style="padding:7px 16px;background:#ef4444;color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer">
          Stop
        </button>`
		: ''}
    </div>
  </div>

  <!-- Activity log -->
  ${state.steps.length > 0 ? `
  <div style="background:#fff;border-radius:14px;padding:20px 24px;box-shadow:0 4px 24px rgba(0,0,0,0.12)">
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#6b7280;margin-bottom:10px">
      Activity Log
    </div>
    <div style="display:flex;flex-direction:column;gap:4px;max-height:280px;overflow-y:auto">
      ${state.steps.slice(-15).reverse().map((s, i) => `
      <div style="display:flex;align-items:flex-start;gap:8px;padding:7px 10px;background:#f9fafb;border-radius:7px;border:1px solid #f3f4f6">
        <span style="min-width:24px;height:20px;background:#4f46e5;color:#fff;border-radius:4px;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">
          ${s.step + 1}
        </span>
        <div>
          <span style="font-weight:600;font-size:12px;color:#4f46e5">${escHtml(s.tool)}</span>
          ${Object.keys(s.args).length
		? `<span style="font-size:11px;color:#6b7280"> — ${escHtml(JSON.stringify(s.args).slice(0, 80))}</span>`
		: ''}
        </div>
      </div>`).join('')}
    </div>
  </div>` : `
  <div style="background:rgba(255,255,255,0.1);border-radius:14px;padding:24px;text-align:center;color:rgba(255,255,255,0.7);font-size:13px">
    No activity yet. Run a task from the side panel or via an MCP client.
  </div>`}

  <!-- Setup instructions (only when disconnected) -->
  ${!state.hubConnected ? `
  <div style="background:#fff;border-radius:14px;padding:20px 24px;box-shadow:0 4px 24px rgba(0,0,0,0.12)">
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#6b7280;margin-bottom:14px">
      Setup
    </div>
    ${setupStep('1', 'Start the WebMind MCP server: <code>uvx webmind-mcp</code>')}
    ${setupStep('2', 'The MCP server auto-opens this page and listens on <code>ws://localhost:38401</code>')}
    ${setupStep('3', 'Use an MCP client (Claude Desktop, Cursor) to send tasks')}
  </div>` : ''}

</div>`
}

function setupStep(num: string, html: string): string {
	return `
<div style="display:flex;gap:10px;margin-bottom:10px;align-items:flex-start">
  <div style="width:22px;height:22px;border-radius:50%;background:#4f46e5;color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">${num}</div>
  <div style="font-size:13px;color:#374151;line-height:1.5">${html}</div>
</div>`
}

function statusStyle(status: string): string {
	switch (status) {
		case 'running': return 'background:#fef3c7;color:#92400e'
		case 'completed': return 'background:#dcfce7;color:#166534'
		case 'error': return 'background:#fee2e2;color:#991b1b'
		default: return 'background:#f3f4f6;color:#374151'
	}
}

function escHtml(str: string): string {
	return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// ─── Events ───────────────────────────────────────────────────────────────────

function bindEvents(): void {
	document.getElementById('root')?.addEventListener('click', (e) => {
		const action = (e.target as HTMLElement).dataset.action
		if (action === 'stop-task') {
			chrome.runtime.sendMessage({ type: 'STOP_TASK' })
		}
		if (action === 'open-sidepanel') {
			chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
				if (tab?.id) chrome.sidePanel.open({ tabId: tab.id })
			})
		}
	})
}

// ─── Background message listener ─────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg) => {
	if (msg.type === 'HUB_STATUS_CHANGED') {
		state.hubConnected = msg.hubConnected
		state.agentStatus = msg.agentStatus
		state.currentTask = msg.currentTask
		if (msg.agentStatus === 'idle') state.steps = []
		render()
	}

	if (msg.type === 'TASK_STATUS') {
		state.agentStatus = msg.status
		if (msg.status === 'idle' || msg.status === 'completed' || msg.status === 'error') {
			state.currentTask = null
		}
		render()
	}

	if (msg.type === 'TASK_ACTIVITY') {
		const activity = msg.activity
		if (activity?.type === 'executing') {
			state.steps.push({
				step: state.steps.length,
				tool: activity.tool,
				args: activity.args ?? {},
			})
			render()
		}
	}

	if (msg.type === 'TASK_RESULT') {
		state.agentStatus = msg.result?.success ? 'completed' : 'error'
		state.currentTask = null
		render()
	}
})

// ─── Init ─────────────────────────────────────────────────────────────────────

chrome.runtime.sendMessage({ type: 'GET_HUB_STATUS' }, (response) => {
	if (response) {
		state.hubConnected = response.hubConnected
		state.agentStatus = response.agentStatus
		state.currentTask = response.currentTask
	}
	render()
})
