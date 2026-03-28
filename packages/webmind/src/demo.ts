/**
 * Demo entry point — IIFE that auto-initializes WebMind from URL params or env vars.
 * Designed as a bookmarklet-friendly script.
 *
 * Usage:
 *   <script src="https://cdn.jsdelivr.net/npm/webmind@latest/dist/demo.js"></script>
 *
 * Or as a bookmarklet:
 *   javascript:(function(){var s=document.createElement('script');s.src='...';document.head.appendChild(s);})()
 *
 * Config via URL params:
 *   ?wm_model=gpt-4o&wm_base_url=https://api.openai.com/v1&wm_api_key=sk-...
 */

import { WebMind } from './WebMind.js'
import type { WebMindConfig } from './WebMind.js'

;(function init() {
	// Prevent double-initialization
	if ((window as unknown as Record<string, unknown>).__webmind_loaded__) {
		const existing = (window as unknown as Record<string, unknown>).__webmind__ as WebMind | undefined
		existing?.showPanel()
		return
	}
	;(window as unknown as Record<string, unknown>).__webmind_loaded__ = true

	// Read config from URL params → fallback to defaults
	const params = new URLSearchParams(window.location.search)

	const config: WebMindConfig = {
		baseURL: params.get('wm_base_url') ?? 'https://dashscope.aliyuncs.com/compatible-mode/v1',
		model: params.get('wm_model') ?? 'qwen-plus',
		apiKey: params.get('wm_api_key') ?? '',
		lang: (params.get('wm_lang') as 'en-US' | 'zh-CN') ?? 'en-US',
		maxSteps: Number(params.get('wm_max_steps') ?? '40'),
		enablePanel: true,
		enableMask: true,
	}

	const agent = new WebMind(config)

	// Expose on window for console access
	;(window as unknown as Record<string, unknown>).__webmind__ = agent

	// Cleanup on navigation (SPA)
	agent.onUrlChange?.(() => {
		agent.stop()
	})

	console.log('[WebMind] Initialized. Access via window.__webmind__')
})()
