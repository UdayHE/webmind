import asyncio
import json
from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp import types
from agent_bridge import AgentBridge

app = Server("webmind")
bridge = AgentBridge()


@app.list_tools()
async def list_tools() -> list[types.Tool]:
    return [
        types.Tool(
            name="run_task",
            description="Run a natural language task on the current web page",
            inputSchema={
                "type": "object",
                "properties": {
                    "instruction": {
                        "type": "string",
                        "description": "Natural language instruction to execute on the page",
                    },
                    "url": {
                        "type": "string",
                        "description": "Optional URL to navigate to before running the task",
                    },
                },
                "required": ["instruction"],
            },
        ),
        types.Tool(
            name="get_page_state",
            description="Get the current DOM state of the active page",
            inputSchema={
                "type": "object",
                "properties": {},
            },
        ),
    ]


@app.call_tool()
async def call_tool(name: str, arguments: dict) -> list[types.TextContent]:
    if name == "run_task":
        result = await bridge.run_task(
            instruction=arguments["instruction"],
            url=arguments.get("url"),
        )
        return [types.TextContent(type="text", text=json.dumps(result))]

    if name == "get_page_state":
        state = await bridge.get_page_state()
        return [types.TextContent(type="text", text=json.dumps(state))]

    raise ValueError(f"Unknown tool: {name}")


async def main():
    async with stdio_server() as (read_stream, write_stream):
        await app.run(read_stream, write_stream, app.create_initialization_options())


if __name__ == "__main__":
    asyncio.run(main())
