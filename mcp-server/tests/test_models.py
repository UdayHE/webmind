"""Tests for Pydantic message models."""

import pytest
from webmind_mcp.models import (
    ErrorMessage,
    ExecuteMessage,
    MessageType,
    ResultMessage,
    StatusMessage,
    StopMessage,
    TaskResult,
)


class TestExecuteMessage:
    def test_defaults(self):
        msg = ExecuteMessage(task="click the login button", task_id="abc-123")
        assert msg.type == MessageType.EXECUTE
        assert msg.task == "click the login button"
        assert msg.task_id == "abc-123"
        assert msg.config == {}

    def test_with_config(self):
        msg = ExecuteMessage(
            task="search for cats",
            task_id="xyz",
            config={"model": "gpt-4o", "baseURL": "https://api.openai.com/v1"},
        )
        assert msg.config["model"] == "gpt-4o"

    def test_serialization(self):
        msg = ExecuteMessage(task="test", task_id="1")
        data = msg.model_dump()
        assert data["type"] == "execute"
        assert data["task"] == "test"


class TestResultMessage:
    def test_success_result(self):
        msg = ResultMessage(
            task_id="abc",
            success=True,
            data="Task completed successfully",
            steps=5,
        )
        assert msg.type == MessageType.RESULT
        assert msg.success is True
        assert msg.steps == 5
        assert msg.history == []

    def test_failure_result(self):
        msg = ResultMessage(task_id="abc", success=False, data="Element not found")
        assert msg.success is False


class TestErrorMessage:
    def test_error_message(self):
        msg = ErrorMessage(task_id="abc", message="No active tab")
        assert msg.type == MessageType.ERROR
        assert msg.message == "No active tab"


class TestStatusMessage:
    def test_connected_idle(self):
        msg = StatusMessage(connected=True, busy=False)
        assert msg.connected is True
        assert msg.busy is False
        assert msg.task_id is None

    def test_connected_busy(self):
        msg = StatusMessage(connected=True, busy=True, task_id="task-1")
        assert msg.busy is True
        assert msg.task_id == "task-1"

    def test_disconnected(self):
        msg = StatusMessage(connected=False, busy=False)
        assert msg.connected is False


class TestStopMessage:
    def test_stop_message(self):
        msg = StopMessage(task_id="current")
        assert msg.type == MessageType.STOP
        assert msg.task_id == "current"


class TestTaskResult:
    def test_success(self):
        result = TaskResult(success=True, data="Done", steps=3)
        assert result.success is True
        assert result.steps == 3

    def test_failure(self):
        result = TaskResult(success=False, data="Timed out")
        assert result.success is False
        assert result.steps == 0
