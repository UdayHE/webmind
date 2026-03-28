"""Tests for HubBridge — unit tests that don't require a live WebSocket."""

import asyncio
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from webmind_mcp.config import MCPConfig
from webmind_mcp.hub_bridge import HubBridge
from webmind_mcp.models import TaskResult


@pytest.fixture
def config() -> MCPConfig:
    return MCPConfig(hub_port=38401, http_port=38400, connection_timeout=5.0)


@pytest.fixture
def bridge(config: MCPConfig) -> HubBridge:
    return HubBridge(config)


class TestHubBridgeStatus:
    def test_initially_disconnected(self, bridge: HubBridge):
        assert bridge.is_connected is False
        assert bridge.is_busy is False

    async def test_get_status_disconnected(self, bridge: HubBridge):
        status = await bridge.get_status()
        assert status.connected is False
        assert status.busy is False


class TestHubBridgeExecuteDisconnected:
    async def test_execute_when_disconnected(self, bridge: HubBridge):
        result = await bridge.execute_task("click the login button")
        assert result.success is False
        assert "No browser extension connected" in result.data

    async def test_stop_when_disconnected(self, bridge: HubBridge):
        stopped = await bridge.stop_task()
        assert stopped is False


class TestHubBridgeExecuteBusy:
    async def test_execute_when_busy(self, bridge: HubBridge):
        # Simulate a connected, busy bridge
        mock_ws = MagicMock()
        mock_ws.closed = False
        bridge._ws = mock_ws
        bridge._busy = True

        result = await bridge.execute_task("another task")
        assert result.success is False
        assert "busy" in result.data.lower()

        # Cleanup
        bridge._ws = None
        bridge._busy = False


class TestHubBridgeMessageHandling:
    async def test_handle_result_message(self, bridge: HubBridge):
        """Result message resolves the pending future."""
        loop = asyncio.get_event_loop()
        future: asyncio.Future[TaskResult] = loop.create_future()
        bridge._pending["test-task-1"] = future

        await bridge._handle_message('{"type":"result","task_id":"test-task-1","success":true,"data":"Done","steps":3,"history":[]}')

        assert future.done()
        result = future.result()
        assert result.success is True
        assert result.data == "Done"
        assert result.steps == 3

    async def test_handle_error_message(self, bridge: HubBridge):
        """Error message resolves future with failure."""
        loop = asyncio.get_event_loop()
        future: asyncio.Future[TaskResult] = loop.create_future()
        bridge._pending["test-task-2"] = future

        await bridge._handle_message('{"type":"error","task_id":"test-task-2","message":"Element not found"}')

        assert future.done()
        result = future.result()
        assert result.success is False
        assert "Element not found" in result.data

    async def test_handle_invalid_json(self, bridge: HubBridge):
        """Invalid JSON is silently ignored."""
        # Should not raise
        await bridge._handle_message("not valid json{{{")

    async def test_handle_unknown_task_id(self, bridge: HubBridge):
        """Messages with unknown task_id are silently ignored."""
        await bridge._handle_message('{"type":"result","task_id":"unknown","success":true,"data":"ok","steps":0,"history":[]}')
