# WebMind

An AI-powered in-page browser agent that controls web interfaces via natural language — a TypeScript + Python implementation inspired by [alibaba/page-agent](https://github.com/alibaba/page-agent).

## Overview

WebMind lets you (or an AI assistant) control any webpage using plain English. It observes the page DOM, thinks about what to do next, and executes actions — clicking, typing, scrolling, running JavaScript — in a ReAct loop until the task is complete.

```
"Find the cheapest flight to Tokyo next week and add it to the cart"
```

## Features

- **ReAct agent loop** — Observe → Think → Act, up to 40 steps by default
- **Full DOM awareness** — numbers every interactive element, builds a flat DOM tree for the LLM
- **Floating panel UI** — draggable in-page control panel with live step log and history
- **Chrome extension** — multi-tab agent with side panel, IndexedDB history, token-based auth
- **MCP server** — control the browser from Claude Desktop, Cursor, or any MCP client
- **Universal LLM support** — OpenAI, Claude, Gemini, Qwen, Grok, Mistral, and any OpenAI-compatible endpoint
- **Framework patches** — React, Vue, Ant Design Select all work out of the box
- **i18n** — English and Chinese UI

---

## Architecture

```
webmind/
├── packages/
│   ├── llms/            # @webmind/llms       — LLM clients + tool-use
│   ├── page-controller/ # @webmind/page-controller — DOM inspection + actions
│   ├── core/            # @webmind/core        — headless ReAct agent loop
│   ├── ui/              # @webmind/ui          — floating panel + i18n
│   ├── webmind/         # webmind              — main entry (core + UI)
│   └── extension/       # @webmind/extension   — Chrome extension (WXT)
└── mcp-server/          # webmind-mcp          — Python MCP server
```

**Data flow (extension + MCP mode):**

```
MCP Client (Claude / Cursor)
    │  stdio
    ▼
Python MCP Server  ──WS──►  Background Service Worker
                                      │
                              Chrome Message Passing
                                      │
                              Content Script (page)
                                      │
                              main-world.ts → PageController → DOM
```

---

## Quick Start

### Prerequisites

- Node.js `>=20.19`
- Python `>=3.11`
- An LLM API key (OpenAI, Anthropic, etc.)

### Install & Build

```bash
git clone <repo-url> webmind
cd webmind

npm install
npm run build:libs
```

---

## Usage Modes

### Mode 1 — Bookmarklet / Script Injection

Inject WebMind into any open tab directly from the browser DevTools console. No extension required.

**Build:**
```bash
npm run build --workspace=packages/webmind
# Output → packages/webmind/dist/demo.js
```

**Serve locally:**
```bash
npx serve packages/webmind/dist --cors
# Serves on http://localhost:3000
```

**Inject into any page** (paste in browser console):
```js
var s = document.createElement('script')
s.src = 'http://localhost:3000/demo.js'
document.head.appendChild(s)
```

**Run a task:**
```js
await window.__webmind__.run('Click the sign in button')
```

A floating panel appears in the page — you can also type tasks directly there.

**Configure via URL params** (useful for bookmarklets):
```
https://example.com?wm_model=gpt-4o&wm_base_url=https://api.openai.com/v1&wm_api_key=sk-...
```

---

### Mode 2 — Chrome Extension

Full multi-tab agent with a side panel UI, history, and settings.

**Build:**
```bash
npm run build:libs
npm run build:ext
# Output → packages/extension/.output/chrome-mv3/
```

**Dev mode** (hot reload):
```bash
npm run dev:ext
```

**Load in Chrome:**
1. Go to `chrome://extensions`
2. Enable **Developer mode**
3. **Load unpacked** → select `packages/extension/.output/chrome-mv3/`

**Configure:**
1. Click the WebMind toolbar icon → side panel opens
2. Click **⚙** → set Base URL, Model, API Key → Save

**Run a task:**
- Type in the side panel text area → **Start**

---

### Mode 3 — MCP Server (Claude Desktop / Cursor)

Exposes three MCP tools so any MCP-compatible AI client can control your browser.

| Tool | Description |
|---|---|
| `execute_task` | Run a natural language task in the connected browser |
| `get_status` | Check if the extension is connected and whether a task is running |
| `stop_task` | Stop the currently running task |

**Start the server:**
```bash
cd mcp-server
pip install uv
uv sync
uv run webmind-mcp
```

This starts a WebSocket hub on `ws://localhost:38401` and opens a status page at `http://localhost:38400`. The Chrome extension auto-connects to the hub.

**Claude Desktop** (`~/Library/Application Support/Claude/claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "webmind": {
      "command": "uv",
      "args": ["run", "--directory", "/path/to/webmind/mcp-server", "webmind-mcp"],
      "env": {
        "WEBMIND_LLM_BASE_URL": "https://api.openai.com/v1",
        "WEBMIND_LLM_MODEL": "gpt-4o",
        "WEBMIND_LLM_API_KEY": "sk-..."
      }
    }
  }
}
```

**Cursor** (`.cursor/mcp.json`):
```json
{
  "mcpServers": {
    "webmind": {
      "command": "uv",
      "args": ["run", "--directory", "/path/to/webmind/mcp-server", "webmind-mcp"]
    }
  }
}
```

**Environment variables** (set in `mcp-server/.env` or shell):
```bash
WEBMIND_LLM_BASE_URL=https://api.openai.com/v1
WEBMIND_LLM_MODEL=gpt-4o
WEBMIND_LLM_API_KEY=sk-...
WEBMIND_HUB_PORT=38401       # WebSocket port
WEBMIND_HTTP_PORT=38400      # Status page port
WEBMIND_TIMEOUT=120          # Task timeout (seconds)
```

---

## Supported LLM Providers

Any OpenAI-compatible endpoint works. Tested providers:

| Provider | Base URL | Example Model |
|---|---|---|
| OpenAI | `https://api.openai.com/v1` | `gpt-4o` |
| Anthropic | `https://api.anthropic.com/v1` | `claude-sonnet-4-6` |
| Google Gemini | `https://generativelanguage.googleapis.com/v1beta/openai` | `gemini-2.0-flash` |
| Alibaba Qwen | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-plus` |
| xAI Grok | `https://api.x.ai/v1` | `grok-3` |
| Ollama (local) | `http://localhost:11434/v1` | `llama3.3` |

---

## JavaScript API

```ts
import { WebMind } from 'webmind'

const agent = new WebMind({
  baseURL: 'https://api.openai.com/v1',
  model: 'gpt-4o',
  apiKey: 'sk-...',
  maxSteps: 40,           // optional, default 40
  lang: 'en-US',         // 'en-US' | 'zh-CN'
  enablePanel: true,     // show floating UI
})

const result = await agent.run('Search for TypeScript tutorials and open the first result')
console.log(result.success, result.data)

agent.dispose()
```

**Events:**
```ts
agent.addEventListener('statuschange', (e) => console.log(e.detail.status))
agent.addEventListener('historychange', (e) => console.log(e.detail.history))
agent.addEventListener('activity', (e) => console.log(e.detail))
```

**Stop a running task:**
```ts
agent.stop()
```

---

## Development

```bash
# Build all libraries
npm run build:libs

# Watch mode (one package)
npm run dev --workspace=packages/core

# Lint
npm run lint

# Format
npm run format

# Python tests
cd mcp-server
uv run pytest tests/ -v

# Generate extension PNG icons (requires sharp)
npm install -D sharp --workspace=packages/extension
node packages/extension/scripts/gen-icons.mjs
```

---

## Agent Tools

The agent has access to these browser actions:

| Tool | Description |
|---|---|
| `click_element_by_index` | Click an interactive element by its numbered index |
| `input_text` | Type text into an input or contentEditable element |
| `select_dropdown_option` | Select an option from a dropdown (native + Ant Design) |
| `scroll` | Scroll the page or a specific element up/down |
| `scroll_horizontally` | Scroll left/right |
| `execute_javascript` | Run arbitrary JavaScript on the page |
| `wait` | Pause for 1–10 seconds |
| `ask_user` | Pause and ask the user a question |
| `done` | Mark the task as complete with a summary |

---

## License

MIT
