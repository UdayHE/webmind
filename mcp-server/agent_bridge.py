import httpx
from typing import Any


class AgentBridge:
    """
    Bridge between the MCP server and the in-page TypeScript agent.
    Communicates via a local HTTP endpoint that the browser agent exposes
    (or via WebSocket in a future implementation).
    """

    def __init__(self, agent_url: str = "http://localhost:3000"):
        self.agent_url = agent_url
        self.client = httpx.AsyncClient(timeout=30.0)

    async def run_task(self, instruction: str, url: str | None = None) -> dict[str, Any]:
        payload: dict[str, Any] = {"instruction": instruction}
        if url:
            payload["url"] = url

        try:
            response = await self.client.post(
                f"{self.agent_url}/run",
                json=payload,
            )
            response.raise_for_status()
            return response.json()
        except httpx.RequestError as e:
            return {"error": str(e), "status": "failed"}

    async def get_page_state(self) -> dict[str, Any]:
        try:
            response = await self.client.get(f"{self.agent_url}/state")
            response.raise_for_status()
            return response.json()
        except httpx.RequestError as e:
            return {"error": str(e), "status": "failed"}
