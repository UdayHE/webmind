"""Pydantic models for WebSocket message protocol."""

from __future__ import annotations

from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class MessageType(str, Enum):
    EXECUTE = "execute"
    STOP = "stop"
    RESULT = "result"
    ERROR = "error"
    STATUS = "status"
    CONFIG = "config"


class ExecuteMessage(BaseModel):
    type: MessageType = MessageType.EXECUTE
    task: str
    task_id: str
    config: dict[str, Any] = Field(default_factory=dict)


class StopMessage(BaseModel):
    type: MessageType = MessageType.STOP
    task_id: str


class ResultMessage(BaseModel):
    type: MessageType = MessageType.RESULT
    task_id: str
    success: bool
    data: str
    steps: int = 0
    history: list[dict[str, Any]] = Field(default_factory=list)


class ErrorMessage(BaseModel):
    type: MessageType = MessageType.ERROR
    task_id: str
    message: str


class StatusMessage(BaseModel):
    type: MessageType = MessageType.STATUS
    connected: bool
    busy: bool
    task_id: str | None = None


class TaskRequest(BaseModel):
    task: str
    url: str | None = None


class TaskResult(BaseModel):
    success: bool
    data: str
    steps: int = 0
    history: list[dict[str, Any]] = Field(default_factory=list)
