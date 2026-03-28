"""Configuration management for the WebMind MCP server."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from dotenv import load_dotenv

load_dotenv()


@dataclass
class MCPConfig:
    """Runtime configuration loaded from environment variables."""

    # WebSocket hub port (extension connects here)
    hub_port: int = field(
        default_factory=lambda: int(os.getenv("WEBMIND_HUB_PORT", "38401"))
    )
    # HTTP port for launcher page
    http_port: int = field(
        default_factory=lambda: int(os.getenv("WEBMIND_HTTP_PORT", "38400"))
    )
    # LLM settings (passed to extension via hub)
    llm_base_url: str = field(
        default_factory=lambda: os.getenv("WEBMIND_LLM_BASE_URL", "")
    )
    llm_model: str = field(
        default_factory=lambda: os.getenv("WEBMIND_LLM_MODEL", "")
    )
    llm_api_key: str = field(
        default_factory=lambda: os.getenv("WEBMIND_LLM_API_KEY", "")
    )
    # Connection timeout in seconds
    connection_timeout: float = field(
        default_factory=lambda: float(os.getenv("WEBMIND_TIMEOUT", "120.0"))
    )


def get_config() -> MCPConfig:
    return MCPConfig()
