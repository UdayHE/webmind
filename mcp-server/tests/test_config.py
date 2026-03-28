"""Tests for MCPConfig environment variable loading."""

import os
import pytest
from webmind_mcp.config import MCPConfig, get_config


class TestMCPConfig:
    def test_defaults(self, monkeypatch):
        for key in [
            "WEBMIND_HUB_PORT", "WEBMIND_HTTP_PORT",
            "WEBMIND_LLM_BASE_URL", "WEBMIND_LLM_MODEL",
            "WEBMIND_LLM_API_KEY", "WEBMIND_TIMEOUT",
        ]:
            monkeypatch.delenv(key, raising=False)

        config = MCPConfig()
        assert config.hub_port == 38401
        assert config.http_port == 38400
        assert config.llm_base_url == ""
        assert config.llm_model == ""
        assert config.llm_api_key == ""
        assert config.connection_timeout == 120.0

    def test_env_overrides(self, monkeypatch):
        monkeypatch.setenv("WEBMIND_HUB_PORT", "9000")
        monkeypatch.setenv("WEBMIND_HTTP_PORT", "9001")
        monkeypatch.setenv("WEBMIND_LLM_BASE_URL", "https://custom.api/v1")
        monkeypatch.setenv("WEBMIND_LLM_MODEL", "claude-sonnet-4-6")
        monkeypatch.setenv("WEBMIND_LLM_API_KEY", "sk-test-key")
        monkeypatch.setenv("WEBMIND_TIMEOUT", "60.0")

        config = MCPConfig()
        assert config.hub_port == 9000
        assert config.http_port == 9001
        assert config.llm_base_url == "https://custom.api/v1"
        assert config.llm_model == "claude-sonnet-4-6"
        assert config.llm_api_key == "sk-test-key"
        assert config.connection_timeout == 60.0

    def test_get_config_returns_instance(self):
        config = get_config()
        assert isinstance(config, MCPConfig)
