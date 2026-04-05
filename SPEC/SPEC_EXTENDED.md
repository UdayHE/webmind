# WebMind Hybrid Observability Architecture — Specification

---

## 1. 🎯 Objective

Design and implement a **Hybrid Observability Architecture** for WebMind that combines:

* **DOM-level intelligence (existing WebMind capabilities)**
* **Low-level browser signals (Network, WebSocket, Console, Errors)**

into a **single unified system** that enables:

> An AI agent to reason over both **what the user sees (UI)** and **what the system does (network/runtime)**.

---

## 2. 🧠 Core Idea

Current limitation:

```text
WebMind = UI-only intelligence
```

Target system:

```text
WebMind = UI Intelligence + System Observability
```

---

## 3. 🏗️ High-Level Architecture (HLD)

```text
                ┌──────────────────────┐
                │     WebMind Agent    │
                │  (ReAct + Memory)    │
                └─────────┬────────────┘
                          │
              ┌───────────▼────────────┐
              │   Unified Signal Bus   │
              │ (Event Stream + Store) │
              └───────┬───────┬────────┘
                      │       │
        ┌─────────────▼───┐   └──────────────┐
        │ DOM Controller  │                  │
        │ (PageController)│                  │
        └─────────────┬───┘                  │
                      │                      │
                      ▼                      ▼
              Browser DOM           CDP / Proxy Layer
                                   (Network / WS / Console)
```

---

### 3.1 Extension Context Reality

> ⚠️ **Implementation note**: WebMind is a Chrome extension. CDP access is NOT via
> `chrome --remote-debugging-port=9222`. It uses the **`chrome.debugger` API** from
> the background service worker.

Key constraints:
- `chrome.debugger.attach({ tabId }, '1.3')` — attaches per tab
- Shows **"WebMind is debugging this browser"** warning bar (unavoidable)
- Attach on task **start**, detach on task **end** to minimize user friction
- `chrome.debugger` permission must be declared in manifest

---

## 4. 🧩 Core Components

---

### 4.1 WebMind Agent (Enhanced)

#### Responsibilities

* Execute ReAct loop
* Consume:

  * DOM observations
  * Signal Bus events (via `get_network_logs`, `get_ws_messages`, `get_console_logs` tools)
* Make decisions using **multi-modal context**

#### New Capability

```ts
interface AgentContext {
  dom: DOMSnapshot
  signals: BrowserSignals
}
```

---

### 4.2 DOM Controller (Existing)

No major change.

Provides:

* DOM tree
* interactive elements
* page state

---

### 4.3 CDP / Proxy Layer (New)

Provides:

| Signal    | Source             |
| --------- | ------------------ |
| Network   | `chrome.debugger`  |
| WebSocket | `chrome.debugger`  |
| Console   | `chrome.debugger`  |
| Errors    | `chrome.debugger`  |

---

### 4.4 Unified Signal Bus (CRITICAL COMPONENT)

Acts as:

> The **central nervous system** of the architecture

---

## 5. 🧠 Unified Signal Bus Design

---

### Responsibilities

* Ingest events from:

  * `chrome.debugger` CDP events (primary)
  * In-page hooks (optional, future)
* Normalize events
* Store events (ring-buffered, last 200 per type per tab)
* Provide query interface to agent via `GET_SIGNALS` message

---

### Architecture

```text
Producers → Signal Bus → Consumers
```

---

### Producers

* `chrome.debugger.onEvent` in `background.ts`

---

### Consumers

* WebMind Agent (via `GET_SIGNALS` chrome message → `get_network_logs` / `get_ws_messages` / `get_console_logs` tools)
* UI Panel (future)
* Debug tools (future)

---

### Event Pipeline

```text
CDP Raw Event → Normalize → Enrich → Ring Buffer → GET_SIGNALS query
```

---

## 6. 📊 Data Model

---

### 6.1 Base Event

```ts
interface BaseSignalEvent {
  id: string
  type: string
  timestamp: number
  source: 'cdp'
}
```

---

### 6.2 Network Event

```ts
interface NetworkSignalEvent extends BaseSignalEvent {
  type: 'network'
  requestId: string
  url: string
  method: string
  requestHeaders: Record<string, string>
  responseHeaders: Record<string, string>
  requestBody?: string
  responseBody?: string
  status: number
  duration: number   // ms, -1 if still pending
  startTime: number
}
```

---

### 6.3 WebSocket Event

```ts
interface WebSocketSignalEvent extends BaseSignalEvent {
  type: 'websocket'
  url: string
  direction: 'send' | 'receive'
  payload: string
}
```

---

### 6.4 Console Event

```ts
interface ConsoleSignalEvent extends BaseSignalEvent {
  type: 'console'
  level: 'log' | 'warn' | 'error' | 'info' | 'debug'
  message: string
  stack?: string
}
```

---

### 6.5 Error Event

```ts
interface ErrorSignalEvent extends BaseSignalEvent {
  type: 'error'
  message: string
  stack?: string
}
```

---

### 6.6 Aggregated Signals

```ts
interface BrowserSignals {
  network: NetworkSignalEvent[]
  websocket: WebSocketSignalEvent[]
  console: ConsoleSignalEvent[]
  errors: ErrorSignalEvent[]
}
```

---

## 7. ⚙️ CDP Layer Design

---

### 7.1 Low-Level Design (Extension Context)

**Data flow through the Chrome extension:**

```text
chrome.debugger.onEvent (background.ts)
         │
         ▼  normalize event
Map<tabId, SignalBus>  ←── per-tab ring buffer
         │
         ▼  chrome.runtime.onMessage 'GET_SIGNALS'
MultiPageAgent.fetchSignals()  (content script)
         │
         ▼
get_network_logs / get_ws_messages / get_console_logs tool result
         │
         ▼
LLM reasoning context
```

**Attach / Detach lifecycle:**
```text
EXECUTE_TASK → attachDebugger(tabId) → Network.enable + Runtime.enable
TASK_STATUS(completed|error|idle) → detachDebugger(tabId)
SignalBus kept alive after detach so agent can still query post-task
```

**Pending request tracking:**
`Network.requestWillBeSent` → `Network.responseReceived` → `Network.loadingFinished`
events are spread across time. A `pendingRequests` map (`${tabId}:${requestId}`) tracks
partial events until `loadingFinished` fires and `Network.getResponseBody` completes.

---

### 7.2 Ring Buffer

- **Max 200 events per signal type per tab**, FIFO eviction (oldest dropped first)
- Stored in background service worker memory (lost on service worker restart — acceptable)
- `SignalBus.clear()` called on new task start to reset stale data

---

### CDP Domains Enabled

* `Network.enable`
* `Runtime.enable`

---

### CDP Event Mapping

| CDP Event                  | Internal Event                    |
| -------------------------- | --------------------------------- |
| `Network.requestWillBeSent`  | NetworkSignalEvent (partial)     |
| `Network.responseReceived`   | NetworkSignalEvent (add status)  |
| `Network.loadingFinished`    | NetworkSignalEvent (add body)    |
| `Network.webSocketFrameReceived` | WebSocketSignalEvent (receive) |
| `Network.webSocketFrameSent`     | WebSocketSignalEvent (send)    |
| `Runtime.consoleAPICalled`  | ConsoleSignalEvent               |
| `Runtime.exceptionThrown`   | ErrorSignalEvent                 |

---

## 8. 🌐 Proxy Layer Design (DEFERRED)

> **Status: Explicitly deferred.** Not part of current implementation.
>
> **Rationale:** The integrated browser + MITM proxy approach was evaluated and found
> to have excessive architectural cost relative to benefit:
> - Two modes to maintain (extension + proxy browser)
> - Separate-browser UX regression (users must open sites in a special window)
> - CA certificate management complexity (`chrome.debugger` requires none of this)
> - Heavy Playwright + mockttp dependency overhead
>
> CDP via `chrome.debugger` covers the same use cases within the existing extension
> architecture. Proxy layer may be revisited if a standalone (non-extension) mode is built.

---

## 9. 🔁 Agent Integration

---

### 9.1 Tool Integration Pattern

New tools are defined as `customTools` in `MultiPageAgent` constructor and passed to
`WebMindCore` via the config. The LLM sees them alongside core tools. `executeTool`
handles them before falling through to `super.executeTool`.

```ts
// MultiPageAgent constructor
super({ ...config, customTools: [...(config.customTools ?? []), ...SIGNAL_TOOLS] })

// MultiPageAgent.executeTool
case 'get_network_logs':
case 'get_ws_messages':
case 'get_console_logs': {
  const signals = await this.fetchSignals()  // GET_SIGNALS → background
  return formatSignals(name, signals, args)
}
```

**Important:** `WebMindCore.run()` uses `validateAction(toolCall, TOOL_NAMES)` which
only validates against the 9 core tool names. Fix: replace `TOOL_NAMES` with
`tools.map(t => t.name)` so custom tools pass validation.

---

### New Tools

```ts
get_network_logs(url_filter?, method?, status?, limit?)
get_ws_messages(url_filter?, direction?, limit?)
get_console_logs(level?, limit?)
```

---

### Example Reasoning

```text
User: "Why is login failing?"

Agent:
1. Check DOM → error message "Invalid credentials"
2. get_network_logs({ url_filter: '/api/login', status: 401 }) → 401 response body
3. Conclude → server returning 401 with "user not found"
```

---

## 10. 🖥️ UI Integration (Phase 4 — Future)

---

### New Panels

* Network tab
* WebSocket tab
* Console tab

---

### Features

* Filter
* Search
* Expand request/response
* Replay request (future)

---

## 11. 🧪 Testing Strategy

---

### Unit

* SignalBus ring buffer eviction
* Event normalization (CDP params → internal types)
* formatSignals filtering

---

### Integration

* CDP event capture on real page load
* GET_SIGNALS message roundtrip

---

### E2E

* Open GitHub → start task "what API calls does this page make?"
* Verify agent uses get_network_logs and returns real data

---

## 12. ⚙️ Scalability

---

### Challenges

* High event volume (busy SPAs can generate hundreds of requests)
* Service worker memory limits

---

### Solutions

* Ring buffer (last 200 events per type) — already implemented
* Response body truncation (max 2KB stored)
* Skip asset requests (images, fonts, CSS) via URL filter on capture

---

## 13. 🔐 Security

---

* Mask sensitive headers (Authorization, Cookie, Set-Cookie) before returning to agent
* CDP only attached during active agent task (not always-on)
* No persistent storage of captured traffic (in-memory only)
* User sees debugger warning bar — informed consent

---

## 14. 🚀 Implementation Phases

---

### Phase 1 — Signal Bus ✅ (implemented)

* `packages/extension/src/signals/types.ts` — event type definitions
* `packages/extension/src/signals/SignalBus.ts` — ring buffer store
* `packages/extension/src/signals/index.ts` — barrel export

---

### Phase 2 — CDP Integration ✅ (implemented)

* `packages/extension/src/entrypoints/background.ts` — `chrome.debugger` attach/capture, `GET_SIGNALS` handler
* `packages/extension/src/types/messages.ts` — `GetSignalsMessage`, `SignalsResultMessage`
* `packages/extension/wxt.config.ts` — `debugger` permission

---

### Phase 3 — Agent Integration ✅ (implemented)

* `packages/core/src/WebMindCore.ts` — fix `validateAction` to use dynamic tool names
* `packages/extension/src/agent/MultiPageAgent.ts` — SIGNAL_TOOLS, `get_network_logs`, `get_ws_messages`, `get_console_logs` tools

---

### Phase 4 — UI Panels (future)

Side panel tabs for network/console/websocket traffic viewer.

---

### Phase 5 — Proxy Layer (explicitly deferred)

See Section 8.

---

## 15. ⚖️ Trade-offs

---

| Approach | Pros             | Cons                                |
| -------- | ---------------- | ----------------------------------- |
| DOM-only | Simple           | Limited — misses all network data   |
| CDP (chrome.debugger) | Full visibility, no extra process | Debugger warning bar |
| Proxy    | Complete capture | Complex, separate browser, deferred |

---

## 16. 💡 Final Insight

This architecture transforms WebMind into:

```text
An AI-powered Browser Operating System
```

Where:

* DOM = User Interface Layer
* CDP/Proxy = System Layer
* Signal Bus = Data Plane
* Agent = Control Plane

---

## 17. 🔥 Future Possibilities

* Autonomous debugging agents
* API reverse engineering
* Security testing (Burp-like, via proxy — Phase 5)
* Performance analysis (Core Web Vitals via CDP)
* Multi-agent collaboration

---

**This is a foundational architecture for next-gen AI browser agents.**

---
