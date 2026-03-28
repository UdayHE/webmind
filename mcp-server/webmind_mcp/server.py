"""
WebMind MCP Server — exposes browser agent control via Model Context Protocol.

Compatible with: Claude Desktop, Cursor, GitHub Copilot, and any MCP client.

Tools:
  - execute_task:  Run a natural language task in the browser
  - get_status:    Check if extension is connected and if agent is busy
  - stop_task:     Stop the currently running task

Transport: stdio (standard MCP transport)
"""

from __future__ import annotations

import asyncio
import json
import logging
import sys
from typing import Any

from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp import types

from .config import get_config
from .hub_bridge import HubBridge

logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] %(levelname)s %(name)s: %(message)s",
    datefmt="%H:%M:%S",
    stream=sys.stderr,
)
logger = logging.getLogger("webmind_mcp")


def create_server() -> tuple[Server, HubBridge]:
    config = get_config()
    bridge = HubBridge(config)
    app = Server("webmind")

    @app.list_tools()
    async def list_tools() -> list[types.Tool]:
        return [
            types.Tool(
                name="execute_task",
                description=(
                    "Execute a natural language task in the connected browser. "
                    "The browser must have the WebMind extension installed and connected. "
                    "Returns success status and a summary of what was accomplished."
                ),
                inputSchema={
                    "type": "object",
                    "properties": {
                        "task": {
                            "type": "string",
                            "description": "Natural language description of the task to perform",
                        },
                        "url": {
                            "type": "string",
                            "description": "Optional URL to navigate to before executing the task",
                        },
                    },
                    "required": ["task"],
                },
            ),
            types.Tool(
                name="get_status",
                description=(
                    "Get the current status of the WebMind browser agent. "
                    "Returns whether the extension is connected and if a task is running."
                ),
                inputSchema={
                    "type": "object",
                    "properties": {},
                },
            ),
            types.Tool(
                name="stop_task",
                description="Stop the currently running browser agent task.",
                inputSchema={
                    "type": "object",
                    "properties": {},
                },
            ),
        ]

    @app.call_tool()
    async def call_tool(
        name: str, arguments: dict[str, Any]
    ) -> list[types.TextContent]:
        if name == "execute_task":
            task = arguments.get("task", "")
            url = arguments.get("url")

            if not task:
                return [types.TextContent(type="text", text='{"error": "task is required"}')]

            logger.info("Executing task: %s", task[:100])
            result = await bridge.execute_task(task, url)

            return [
                types.TextContent(
                    type="text",
                    text=json.dumps(
                        {
                            "success": result.success,
                            "data": result.data,
                            "steps": result.steps,
                        },
                        ensure_ascii=False,
                    ),
                )
            ]

        if name == "get_status":
            status = await bridge.get_status()
            return [
                types.TextContent(
                    type="text",
                    text=json.dumps(
                        {
                            "connected": status.connected,
                            "busy": status.busy,
                        }
                    ),
                )
            ]

        if name == "stop_task":
            stopped = await bridge.stop_task()
            return [
                types.TextContent(
                    type="text",
                    text=json.dumps({"stopped": stopped}),
                )
            ]

        raise ValueError(f"Unknown tool: {name}")

    return app, bridge


async def run() -> None:
    app, bridge = create_server()

    # Start hub bridge in background
    asyncio.create_task(bridge.start())

    logger.info("WebMind MCP server starting (stdio transport)")
    async with stdio_server() as (read_stream, write_stream):
        await app.run(read_stream, write_stream, app.create_initialization_options())


def main() -> None:
    asyncio.run(run())


if __name__ == "__main__":
    main()
