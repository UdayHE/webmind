"""
HubBridge — WebSocket + HTTP server that bridges the MCP server to the browser extension.

Architecture:
  - HTTP server serves the launcher HTML page
  - WebSocket server accepts a single connection from the extension hub
  - JSON message protocol: execute, stop, result, error, status

Pattern: Observer (asyncio Events), Singleton (one active WebSocket connection)
"""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
import webbrowser
from typing import Any

import websockets
from websockets.server import WebSocketServerProtocol
from websockets.legacy.server import WebSocketServerProtocol as LegacyWSServerProtocol

from .config import MCPConfig
from .models import (
    ErrorMessage,
    ExecuteMessage,
    MessageType,
    ResultMessage,
    StatusMessage,
    StopMessage,
    TaskResult,
)

logger = logging.getLogger(__name__)


LAUNCHER_HTML = """\
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>WebMind Hub</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh; display: flex; align-items: center; justify-content: center;
    }
    .card {
      background: #fff; border-radius: 16px;
      padding: 40px; max-width: 480px; width: 100%;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      text-align: center;
    }
    h1 { font-size: 28px; color: #1a1a1a; margin-bottom: 8px; }
    .subtitle { color: #6b7280; margin-bottom: 32px; font-size: 15px; }
    .status {
      display: inline-flex; align-items: center; gap: 8px;
      padding: 10px 20px; border-radius: 24px;
      background: #f3f4f6; font-weight: 600; font-size: 14px;
      margin-bottom: 24px;
    }
    .dot { width: 10px; height: 10px; border-radius: 50%; background: #ef4444; }
    .dot.connected { background: #22c55e; animation: pulse 2s infinite; }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
    .instructions { text-align: left; background: #f9fafb; border-radius: 10px; padding: 20px; }
    .instructions h3 { font-size: 13px; color: #6b7280; text-transform: uppercase;
      letter-spacing: 0.5px; margin-bottom: 12px; }
    .step { display: flex; gap: 10px; margin-bottom: 10px; align-items: flex-start; }
    .step-num {
      width: 22px; height: 22px; border-radius: 50%;
      background: #4f46e5; color: #fff; font-size: 11px; font-weight: 700;
      display: flex; align-items: center; justify-content: center; flex-shrink: 0;
    }
    .step-text { font-size: 13px; color: #374151; line-height: 1.4; }
    code { background: #e5e7eb; border-radius: 4px; padding: 1px 5px; font-size: 12px; }
  </style>
</head>
<body>
<div class="card">
  <h1>⚡ WebMind Hub</h1>
  <p class="subtitle">Browser Agent Control Panel</p>
  <div class="status">
    <div class="dot" id="dot"></div>
    <span id="status-text">Waiting for extension...</span>
  </div>
  <div class="instructions">
    <h3>Setup</h3>
    <div class="step">
      <div class="step-num">1</div>
      <div class="step-text">Install the WebMind browser extension</div>
    </div>
    <div class="step">
      <div class="step-num">2</div>
      <div class="step-text">Click the extension icon and connect to <code>ws://localhost:{WS_PORT}</code></div>
    </div>
    <div class="step">
      <div class="step-num">3</div>
      <div class="step-text">Use an MCP-compatible client (Claude Desktop, Cursor) to control the browser</div>
    </div>
  </div>
</div>
<script>
  const ws = new WebSocket('ws://localhost:{WS_PORT}/hub-status');
  const dot = document.getElementById('dot');
  const statusText = document.getElementById('status-text');
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.type === 'status') {
      if (msg.connected) {
        dot.classList.add('connected');
        statusText.textContent = msg.busy ? 'Running task…' : 'Extension connected ✓';
      } else {
        dot.classList.remove('connected');
        statusText.textContent = 'Waiting for extension…';
      }
    }
  };
</script>
</body>
</html>
"""


class HubBridge:
    """
    Manages the WebSocket connection to the browser extension hub.
    Also serves the launcher page over HTTP.
    """

    def __init__(self, config: MCPConfig) -> None:
        self.config = config
        self._ws: WebSocketServerProtocol | None = None
        self._busy = False
        self._pending: dict[str, asyncio.Future[TaskResult]] = {}
        self._ws_lock = asyncio.Lock()

    # ─── Public API ─────────────────────────────────────────────────────────────

    @property
    def is_connected(self) -> bool:
        return self._ws is not None and not self._ws.closed

    @property
    def is_busy(self) -> bool:
        return self._busy

    async def execute_task(self, task: str, url: str | None = None) -> TaskResult:
        """Send a task to the extension and wait for the result."""
        if not self.is_connected:
            return TaskResult(success=False, data="No browser extension connected")
        if self._busy:
            return TaskResult(success=False, data="Agent is busy with another task")

        task_id = str(uuid.uuid4())
        config: dict[str, Any] = {}
        if url:
            config["url"] = url
        if self.config.llm_base_url:
            config["baseURL"] = self.config.llm_base_url
        if self.config.llm_model:
            config["model"] = self.config.llm_model
        if self.config.llm_api_key:
            config["apiKey"] = self.config.llm_api_key

        future: asyncio.Future[TaskResult] = asyncio.get_event_loop().create_future()
        self._pending[task_id] = future
        self._busy = True

        try:
            msg = ExecuteMessage(task=task, task_id=task_id, config=config)
            await self._send(msg.model_dump())

            return await asyncio.wait_for(
                future, timeout=self.config.connection_timeout
            )
        except asyncio.TimeoutError:
            self._pending.pop(task_id, None)
            return TaskResult(success=False, data="Task timed out")
        except Exception as e:
            self._pending.pop(task_id, None)
            return TaskResult(success=False, data=str(e))
        finally:
            self._busy = False

    async def stop_task(self) -> bool:
        """Request the extension to stop the current task."""
        if not self.is_connected or not self._busy:
            return False
        msg = StopMessage(task_id="current")
        await self._send(msg.model_dump())
        return True

    async def get_status(self) -> StatusMessage:
        return StatusMessage(
            connected=self.is_connected,
            busy=self._busy,
        )

    # ─── Server lifecycle ────────────────────────────────────────────────────────

    async def start(self) -> None:
        """Start WebSocket server and HTTP launcher server."""
        ws_task = asyncio.create_task(self._run_ws_server())
        http_task = asyncio.create_task(self._run_http_server())
        logger.info(
            "WebMind Hub: WS ws://localhost:%d | HTTP http://localhost:%d",
            self.config.hub_port,
            self.config.http_port,
        )
        # Open launcher in browser
        webbrowser.open(f"http://localhost:{self.config.http_port}")
        await asyncio.gather(ws_task, http_task)

    # ─── WebSocket server ────────────────────────────────────────────────────────

    async def _run_ws_server(self) -> None:
        async with websockets.serve(
            self._handle_ws,
            "localhost",
            self.config.hub_port,
        ):
            await asyncio.Future()  # run forever

    async def _handle_ws(self, ws: WebSocketServerProtocol, path: str) -> None:
        async with self._ws_lock:
            if path == "/hub-status":
                # Status-only connection from launcher page
                await self._handle_status_ws(ws)
                return
            # Main extension connection
            if self._ws and not self._ws.closed:
                await ws.close(1008, "Another hub is already connected")
                return
            self._ws = ws
            logger.info("Extension hub connected")

        try:
            async for raw in ws:
                await self._handle_message(raw)
        except websockets.exceptions.ConnectionClosed:
            pass
        finally:
            async with self._ws_lock:
                if self._ws is ws:
                    self._ws = None
            logger.info("Extension hub disconnected")
            # Fail any pending tasks
            for fut in self._pending.values():
                if not fut.done():
                    fut.set_result(TaskResult(success=False, data="Extension disconnected"))
            self._pending.clear()
            self._busy = False

    async def _handle_status_ws(self, ws: WebSocketServerProtocol) -> None:
        """Send periodic status updates to the launcher page."""
        try:
            while True:
                status = await self.get_status()
                await ws.send(json.dumps(status.model_dump()))
                await asyncio.sleep(1)
        except websockets.exceptions.ConnectionClosed:
            pass

    async def _handle_message(self, raw: str | bytes) -> None:
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            logger.warning("Received invalid JSON from extension")
            return

        msg_type = data.get("type")

        if msg_type == MessageType.RESULT:
            msg = ResultMessage(**data)
            fut = self._pending.pop(msg.task_id, None)
            if fut and not fut.done():
                fut.set_result(
                    TaskResult(
                        success=msg.success,
                        data=msg.data,
                        steps=msg.steps,
                        history=msg.history,
                    )
                )

        elif msg_type == MessageType.ERROR:
            msg = ErrorMessage(**data)
            fut = self._pending.pop(msg.task_id, None)
            if fut and not fut.done():
                fut.set_result(TaskResult(success=False, data=msg.message))

    async def _send(self, payload: dict[str, Any]) -> None:
        if self._ws and not self._ws.closed:
            await self._ws.send(json.dumps(payload))

    # ─── HTTP launcher ────────────────────────────────────────────────────────────

    async def _run_http_server(self) -> None:
        """Minimal HTTP server to serve the launcher HTML."""
        import http.server
        import threading

        html = LAUNCHER_HTML.replace("{WS_PORT}", str(self.config.hub_port))
        port = self.config.http_port

        class Handler(http.server.BaseHTTPRequestHandler):
            def do_GET(self) -> None:
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.end_headers()
                self.wfile.write(html.encode())

            def log_message(self, format: str, *args: Any) -> None:
                pass  # Suppress access logs

        server = http.server.HTTPServer(("localhost", port), Handler)
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, server.serve_forever)
