import {
	buildFlatDomTree,
	getBrowserState,
	watchUrlChanges,
} from './dom/index.js'
import { getPageInfo } from './dom/getPageInfo.js'
import type { BrowserState, FlatDomTree, PageInfo } from './dom/types.js'
import { hideMask, showMask } from './mask/index.js'
import {
	clickElement,
	executeJavaScript,
	inputText,
	scroll,
	scrollHorizontally,
	selectDropdownOption,
	wait,
} from './actions.js'

const HIGHLIGHT_ATTR = 'data-webmind-highlight'
const HIGHLIGHT_STYLE_ID = '__webmind_highlight_style__'

const HIGHLIGHT_CSS = `
.webmind-highlight {
  position: absolute;
  pointer-events: none;
  border: 2px solid #4f46e5;
  border-radius: 3px;
  z-index: 2147483640;
}
.webmind-highlight-label {
  position: absolute;
  top: -18px;
  left: -1px;
  background: #4f46e5;
  color: #fff;
  font-size: 10px;
  font-family: monospace;
  padding: 1px 4px;
  border-radius: 2px;
  line-height: 1.4;
  white-space: nowrap;
  z-index: 2147483641;
}
`

/**
 * PageController — orchestrates DOM interaction for the WebMind agent.
 *
 * Pattern: Facade (wraps DOM, actions, mask, highlights behind a clean API)
 */
export class PageController {
	private currentTree: FlatDomTree | null = null
	private highlightOverlays: HTMLElement[] = []
	private urlChangeCleanup: (() => void) | null = null

	/**
	 * Rebuild DOM tree and return simplified HTML for LLM context.
	 * Also re-renders highlight overlays.
	 */
	async updateTree(): Promise<string> {
		this.currentTree = buildFlatDomTree()
		return this.currentTree.simplifiedHTML
	}

	/**
	 * Get browser state (URL, viewport, scroll info).
	 */
	getBrowserState(): BrowserState {
		return getBrowserState()
	}

	/**
	 * Get page info (title, description, favicon, lang).
	 */
	getPageInfo(): PageInfo {
		return getPageInfo()
	}

	/**
	 * Get the current simplified HTML without rebuilding.
	 */
	getSimplifiedHTML(): string {
		return this.currentTree?.simplifiedHTML ?? ''
	}

	// ─── Actions ───────────────────────────────────────────────────────────────

	async clickElement(index: number): Promise<void> {
		await clickElement(index)
	}

	async inputText(index: number, text: string): Promise<void> {
		await inputText(index, text)
	}

	async selectDropdownOption(index: number, optionText: string): Promise<void> {
		await selectDropdownOption(index, optionText)
	}

	async scroll(
		direction: 'up' | 'down',
		amount?: number,
		elementIndex?: number,
	): Promise<void> {
		await scroll(direction, amount, elementIndex)
	}

	async scrollHorizontally(direction: 'left' | 'right', amount?: number): Promise<void> {
		await scrollHorizontally(direction, amount)
	}

	async executeJavaScript(code: string): Promise<unknown> {
		return executeJavaScript(code)
	}

	async wait(seconds: number): Promise<void> {
		await wait(seconds)
	}

	// ─── Mask ──────────────────────────────────────────────────────────────────

	showMask(): void {
		showMask()
	}

	hideMask(): void {
		hideMask()
	}

	// ─── Highlights ────────────────────────────────────────────────────────────

	/**
	 * Render colored overlays over all indexed interactive elements.
	 */
	showHighlights(): void {
		this.cleanUpHighlights()
		if (!this.currentTree) return

		injectHighlightStyles()

		for (const [index, entry] of this.currentTree.nodeMap) {
			const el = entry.element
			const rect = el.getBoundingClientRect()
			if (rect.width === 0 && rect.height === 0) continue

			const overlay = document.createElement('div')
			overlay.className = 'webmind-highlight'
			overlay.setAttribute(HIGHLIGHT_ATTR, String(index))

			const label = document.createElement('span')
			label.className = 'webmind-highlight-label'
			label.textContent = String(index)
			overlay.appendChild(label)

			// Position relative to viewport (fixed)
			overlay.style.position = 'fixed'
			overlay.style.top = `${rect.top}px`
			overlay.style.left = `${rect.left}px`
			overlay.style.width = `${rect.width}px`
			overlay.style.height = `${rect.height}px`

			document.body.appendChild(overlay)
			this.highlightOverlays.push(overlay)
		}
	}

	/**
	 * Remove all highlight overlays.
	 */
	cleanUpHighlights(): void {
		this.highlightOverlays.forEach((el) => el.remove())
		this.highlightOverlays = []

		// Also clean up any orphaned overlays
		document.querySelectorAll(`[${HIGHLIGHT_ATTR}]`).forEach((el) => el.remove())
	}

	// ─── URL watching ──────────────────────────────────────────────────────────

	/**
	 * Register a handler that fires whenever the page URL changes.
	 * Returns an unsubscribe function.
	 */
	onUrlChange(handler: () => void): () => void {
		const cleanup = watchUrlChanges(handler)
		this.urlChangeCleanup = cleanup
		return cleanup
	}

	// ─── Cleanup ───────────────────────────────────────────────────────────────

	dispose(): void {
		this.cleanUpHighlights()
		hideMask()
		if (this.urlChangeCleanup) {
			this.urlChangeCleanup()
			this.urlChangeCleanup = null
		}
	}
}

function injectHighlightStyles(): void {
	if (document.getElementById(HIGHLIGHT_STYLE_ID)) return
	const style = document.createElement('style')
	style.id = HIGHLIGHT_STYLE_ID
	style.textContent = HIGHLIGHT_CSS
	document.head.appendChild(style)
}
