# WebMind — Build Progress

## Overview
A TypeScript + Python clone of [alibaba/page-agent](https://github.com/alibaba/page-agent).
An AI-powered in-page browser agent that controls web interfaces via natural language.

---

## Tech Stack
- **Browser agent** → TypeScript (matches original)
- **MCP server** → Python (better AI/LLM ecosystem)

---

## Current Status: ~95% complete

### Done

#### Monorepo Root
- [x] `package.json` with npm workspaces (6 packages)
- [x] `tsconfig.base.json` — ES2024, strict, bundler module resolution
- [x] `tsconfig.json` — IDE references all packages
- [x] `.gitignore` — comprehensive

#### `@webmind/llms` (`packages/llms/`)
- [x] `LLMConfig` interface (baseURL, model, apiKey, temperature, maxRetries, disableNamedToolChoice, customFetch, lang)
- [x] `LLM` class extending EventTarget with retry logic + events
- [x] `OpenAIClient` — full OpenAI-compatible REST client (no SDK dependency)
- [x] Tool-use / function-calling format
- [x] Error categorization: `AuthError`, `RateLimitError`, `ContextLengthError`, `ContentFilterError`, `ServerError`
- [x] Token usage metrics (inputTokens, outputTokens, cachedTokens, reasoningTokens)
- [x] Model-specific patches (Qwen, Claude, Grok, GPT, Gemini, MiniMax, DashScope)
- [x] Zod schema → OpenAI tool format conversion (Zod 3 + Zod 4)
- [x] `normalizeResponse` / `validateAction` / `safeJsonParse` / `retrieveJsonFromString`
- [x] Named tool choice with `disableNamedToolChoice` fallback

#### `@webmind/page-controller` (`packages/page-controller/`)
- [x] `FlatDomTree` with root node and indexed node map
- [x] `TextDomNode`, `ElementDomNode`, `InteractiveElementDomNode` types
- [x] `buildFlatDomTree()` — numbered interactive elements `[0]<tag attrs>text />`
- [x] `data-webmind-index` attribute injection for element lookup
- [x] Element highlight overlays with numeric indices + CSS injection
- [x] `cleanUpHighlights()`
- [x] `getBrowserState()` — URL, viewport, scroll info, scroll hints
- [x] `getPageInfo()` — title, description, favicon, lang, charset
- [x] `getSimplifiedHTML()`
- [x] URL change detection (popstate, hashchange, Navigation API, polling fallback)
- [x] Visual masking overlay (`showMask()` / `hideMask()`) with fade transition
- [x] `clickElement` — scroll into view → hover → focus → click events sequence
- [x] `inputText` — React patch (native setter), contentEditable support, keypress simulation
- [x] `selectDropdownOption` — native select, Ant Design, generic dropdowns
- [x] `scroll` (vertical, element-level or page-level)
- [x] `scrollHorizontally`
- [x] `executeJavaScript` — async IIFE wrapper
- [x] `wait` (1-10 seconds clamped)
- [x] React patches (`setNativeValue`)
- [x] Ant Design Select patch (`patchAntDesignSelect`)
- [x] Vue patch (`triggerVueUpdate`)
- [x] `PageController` class (facade over all functionality)

#### `@webmind/core` (`packages/core/`)
- [x] `WebMindCore` class extending EventTarget
- [x] ReAct (Observe → Think → Act) agent loop
- [x] `AgentStatus` state machine: `idle | running | completed | error`
- [x] EventTarget events: `statuschange`, `historychange`, `activity`, `dispose`
- [x] `stop()`, `dispose()`, `pushObservation()` methods
- [x] All 9 tools: click, input, select, scroll, scroll_horizontally, execute_javascript, wait, ask_user, done
- [x] Zod schemas for all tools with descriptions
- [x] Step/task lifecycle hooks: `onBeforeStep`, `onAfterStep`, `onBeforeTask`, `onAfterTask`
- [x] `maxSteps` (default: 40)
- [x] History tracking — `StepEvent | ObservationEvent | RetryEvent | ErrorEvent | TakeoverEvent`
- [x] `ExecutionResult` return type
- [x] `stepDelay` config (default: 400ms)
- [x] `customSystemPrompt`, `customTools`, `transformPageContent` config
- [x] `fetchLlmsTxt` experimental fetching
- [x] `AgentReflection` (evaluation_previous_goal, memory, next_goal)
- [x] System prompt with browser interaction rules + safety constraints

#### `@webmind/ui` (`packages/ui/`)
- [x] `Panel` class — floating draggable panel (pure DOM, no React dependency)
- [x] Status display: Ready / Running / Completed / Error with color coding
- [x] Step-by-step execution log (last 5 steps)
- [x] History list with task rerun + JSON export
- [x] ask_user dialog with answer input
- [x] i18n: English (`en-US`) + Chinese (`zh-CN`)
- [x] CSS injected via style tag (no external CSS files)
- [x] Drag-to-reposition support
- [x] Settings panel placeholder
- [x] `PanelConfig` (locale, position)

#### `webmind` main package (`packages/webmind/`)
- [x] `WebMind` class extending `WebMindCore` — integrates Panel + mask
- [x] Auto-enables mask overlay on `running` status
- [x] Auto-shows panel by default
- [x] `demo.ts` — IIFE with URL param config, bookmarklet-friendly
- [x] Global `window.__webmind__` access for console testing
- [x] Clean public API exports

#### `@webmind/mcp` Python Server (`mcp-server/`)
- [x] Complete package restructure into `webmind_mcp/` Python package
- [x] `HubBridge` — WebSocket server + HTTP launcher page server
- [x] WebSocket protocol: execute, stop, result, error messages
- [x] Single active connection management with task queueing guard
- [x] `execute_task` MCP tool
- [x] `get_status` MCP tool
- [x] `stop_task` MCP tool
- [x] Task approval/timeout handling
- [x] Environment variable support (WEBMIND_LLM_BASE_URL, MODEL, API_KEY, PORT)
- [x] Claude Desktop / Cursor / Copilot compatibility (stdio transport)
- [x] Auto-opens launcher HTML page in browser
- [x] Launcher page with real-time connection status indicator
- [x] Pydantic models for all message types
- [x] `python-dotenv` support

#### `@webmind/extension` Chrome Extension (`packages/extension/`)
- [x] `background.ts` — service worker, auth token generation, Hub WebSocket client, message routing
- [x] `content.ts` — content script, EXECUTE_TASK / STOP_TASK / PAGE_CONTROL message handling
- [x] `main-world.ts` — direct DOM access, PageController in main world context
- [x] `TabsController` — multi-tab lifecycle management, tab grouping, loading verification
- [x] `RemotePageController` — proxy PageController via Chrome message passing
- [x] `MultiPageAgent` — extends WebMindCore for extension context, heartbeat, mask
- [x] Side panel HTML + entry point
- [x] `SidePanel` component — full UI with task, steps, history, settings, ask_user
- [x] Token-based auth between extension and page
- [x] History export as JSON (IndexedDB via `idb`)
- [x] Task rerun from history
- [x] Config persistence (baseURL, model, apiKey, maxSteps, lang)
- [x] i18n support in side panel
- [x] WXT build system configuration
- [x] Hub page (`entrypoints/hub/`) — real-time dashboard: MCP connection status, agent status, activity log, stop button
- [x] `HUB_STATUS_CHANGED` broadcast from background, `GET_HUB_STATUS` request handler
- [x] SVG extension icon + `scripts/gen-icons.mjs` for PNG generation

---

## Remaining Work

### Minor gaps
- [ ] Jest tests for TypeScript packages (llms, core, page-controller)
- [x] pytest tests for Python MCP server (models, config, hub_bridge)
- [x] Extension manifest icons (SVG + gen script; run `node scripts/gen-icons.mjs` to produce PNGs)
- [x] Hub page at `packages/extension/src/entrypoints/hub/`
- [ ] `ConfigPanel` component for extension (currently inline in SidePanel)
- [x] ESLint flat config (`eslint.config.mjs`)
- [x] CI/CD GitHub Actions (`.github/workflows/ci.yml`)

---

## Package Structure

```
webmind/
├── package.json                     # npm workspaces root
├── tsconfig.base.json               # shared TS config
├── tsconfig.json                    # IDE references
├── .gitignore
├── PROGRESS.md
├── packages/
│   ├── llms/                        # @webmind/llms — LLM clients
│   ├── page-controller/             # @webmind/page-controller — DOM + actions
│   ├── core/                        # @webmind/core — headless agent logic
│   ├── ui/                          # @webmind/ui — in-page panel + i18n
│   ├── webmind/                     # webmind — main entry point
│   └── extension/                   # @webmind/extension — Chrome extension
└── mcp-server/                      # Python MCP server
    ├── webmind_mcp/
    │   ├── __init__.py
    │   ├── server.py                # MCP server entrypoint
    │   ├── hub_bridge.py            # WebSocket + HTTP bridge
    │   ├── models.py                # Pydantic message models
    │   └── config.py                # Environment config
    └── pyproject.toml
```

---

## Notes
- Original page-agent: ~788 commits, v1.6.1, MIT licensed
- Node.js requirement: `^20.19.0 || ^22.13.0 || >=24`
- Build tool: `tsup` (esbuild-based), ESM output
- Zod is a peer dependency for schema validation
- MCP server: Python with websockets + mcp[cli]
- Extension: WXT framework
