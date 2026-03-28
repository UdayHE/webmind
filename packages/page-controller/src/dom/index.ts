import type {
	BrowserState,
	DomNode,
	ElementDomNode,
	FlatDomTree,
	IndexedElement,
	InteractiveElementDomNode,
} from './types.js'

// ─── Constants ────────────────────────────────────────────────────────────────

const INTERACTIVE_TAGS = new Set([
	'a', 'button', 'input', 'select', 'textarea', 'label', 'summary',
])

const INTERACTIVE_ROLES = new Set([
	'button', 'link', 'checkbox', 'radio', 'tab', 'menuitem', 'option',
	'combobox', 'listbox', 'spinbutton', 'slider', 'switch', 'textbox',
	'searchbox', 'menuitemcheckbox', 'menuitemradio',
])

const SKIP_TAGS = new Set([
	'script', 'style', 'noscript', 'head', 'meta', 'link', 'title',
	'svg', 'path', 'defs', 'g', 'circle', 'rect', 'line', 'polygon',
])

const IMPORTANT_ATTRS = [
	'aria-label', 'placeholder', 'type', 'role', 'name', 'value',
	'href', 'alt', 'title', 'aria-expanded', 'aria-checked', 'aria-selected',
	'aria-disabled', 'data-testid',
]

const WEBMIND_ATTR = 'data-webmind-index'

// ─── Element detection ────────────────────────────────────────────────────────

export function isInteractiveElement(el: Element): boolean {
	const tag = el.tagName.toLowerCase()
	if (INTERACTIVE_TAGS.has(tag)) return true

	const role = el.getAttribute('role')
	if (role && INTERACTIVE_ROLES.has(role.toLowerCase())) return true

	if ((el as HTMLElement).contentEditable === 'true') return true

	// onclick attribute or event listener heuristic
	if (el.hasAttribute('onclick')) return true

	const tabIndex = el.getAttribute('tabindex')
	if (tabIndex !== null && tabIndex !== '-1') return true

	return false
}

function isVisible(el: Element): boolean {
	if (!(el instanceof HTMLElement)) return true
	const style = window.getComputedStyle(el)
	if (style.display === 'none') return false
	if (style.visibility === 'hidden') return false
	if (style.opacity === '0') return false
	return true
}

// ─── DOM Tree Builder ─────────────────────────────────────────────────────────

export function buildFlatDomTree(): FlatDomTree {
	// Clean up previous indices
	document.querySelectorAll(`[${WEBMIND_ATTR}]`).forEach((el) => {
		el.removeAttribute(WEBMIND_ATTR)
	})

	let indexCounter = 0
	const nodeMap = new Map<number, IndexedElement>()
	const lines: string[] = []

	function processNode(el: Element, depth: number): DomNode | null {
		const tag = el.tagName.toLowerCase()

		if (SKIP_TAGS.has(tag)) return null
		if (!isVisible(el)) return null

		const isInteractive = isInteractiveElement(el)
		let index = -1

		if (isInteractive) {
			index = indexCounter++
			el.setAttribute(WEBMIND_ATTR, String(index))
			nodeMap.set(index, { index, element: el, tag, isInteractive: true })
			lines.push(buildHTMLLine(el, tag, index, depth))
		} else {
			// Include non-interactive elements that have direct meaningful text
			const directText = getDirectText(el)
			if (directText) {
				const indent = '  '.repeat(Math.min(depth, 8))
				lines.push(`${indent}<${tag}>${directText}</${tag}>`)
			}
		}

		// Process children
		const children: DomNode[] = []
		for (const child of el.children) {
			const childNode = processNode(child, depth + 1)
			if (childNode) children.push(childNode)
		}

		const node: ElementDomNode | InteractiveElementDomNode = isInteractive
			? buildInteractiveNode(el, tag, index, depth, children)
			: buildElementNode(el, tag, index, depth, children)

		return node
	}

	const rootEl = document.body ?? document.documentElement
	const root = processNode(rootEl, 0) ?? makeEmptyRoot()

	return { root, nodeMap, simplifiedHTML: lines.join('\n') }
}

// ─── Element lookup ───────────────────────────────────────────────────────────

export function getElementByIndex(index: number): Element | null {
	return document.querySelector(`[${WEBMIND_ATTR}="${index}"]`)
}

// ─── Node builders ────────────────────────────────────────────────────────────

function buildHTMLLine(el: Element, tag: string, index: number, depth: number): string {
	const attrs: string[] = []
	for (const attr of IMPORTANT_ATTRS) {
		const val = el.getAttribute(attr)
		if (val) attrs.push(`${attr}="${val.slice(0, 50).replace(/"/g, "'")}"`)
	}

	const innerText = ((el as HTMLElement).innerText ?? '').trim()
	const text = innerText.slice(0, 20) + (innerText.length > 20 ? '…' : '')
	const indent = '  '.repeat(Math.min(depth, 8))
	const attrStr = attrs.length ? ' ' + attrs.join(' ') : ''

	return `${indent}[${index}]<${tag}${attrStr}>${text} />`
}

function buildInteractiveNode(
	el: Element,
	tag: string,
	index: number,
	depth: number,
	children: DomNode[],
): InteractiveElementDomNode {
	return {
		type: 'interactive',
		index,
		tag,
		text: ((el as HTMLElement).innerText ?? '').trim().slice(0, 50),
		depth,
		attributes: getAttributes(el),
		children,
		role: el.getAttribute('role'),
		placeholder: el.getAttribute('placeholder'),
		value: (el as HTMLInputElement).value ?? null,
		ariaLabel: el.getAttribute('aria-label'),
	}
}

function buildElementNode(
	el: Element,
	tag: string,
	index: number,
	depth: number,
	children: DomNode[],
): ElementDomNode {
	return {
		type: 'element',
		index,
		tag,
		text: getDirectText(el),
		depth,
		attributes: getAttributes(el),
		children,
	}
}

function getAttributes(el: Element): Record<string, string> {
	const result: Record<string, string> = {}
	for (const attr of IMPORTANT_ATTRS) {
		const val = el.getAttribute(attr)
		if (val !== null) result[attr] = val
	}
	return result
}

function getDirectText(el: Element): string {
	let text = ''
	for (const node of el.childNodes) {
		if (node.nodeType === Node.TEXT_NODE) {
			text += node.textContent ?? ''
		}
	}
	return text.trim().slice(0, 50)
}

function makeEmptyRoot(): ElementDomNode {
	return {
		type: 'element',
		index: -1,
		tag: 'body',
		text: '',
		depth: 0,
		attributes: {},
		children: [],
	}
}

// ─── Browser state ────────────────────────────────────────────────────────────

export function getBrowserState(): BrowserState {
	const { scrollX, scrollY, innerWidth, innerHeight } = window
	const { scrollHeight, scrollWidth } = document.body

	const canScrollUp = scrollY > 0
	const canScrollDown = scrollY + innerHeight < scrollHeight - 1
	const canScrollLeft = scrollX > 0
	const canScrollRight = scrollX + innerWidth < scrollWidth - 1

	return {
		url: window.location.href,
		title: document.title,
		viewportWidth: innerWidth,
		viewportHeight: innerHeight,
		scrollX,
		scrollY,
		scrollHeight,
		scrollWidth,
		canScrollUp,
		canScrollDown,
		canScrollLeft,
		canScrollRight,
	}
}

// ─── URL change detection ─────────────────────────────────────────────────────

export function watchUrlChanges(handler: () => void): () => void {
	let lastUrl = window.location.href
	const listeners: Array<() => void> = []

	function checkUrl() {
		const current = window.location.href
		if (current !== lastUrl) {
			lastUrl = current
			handler()
		}
	}

	// popstate (back/forward)
	const popHandler = () => { checkUrl() }
	window.addEventListener('popstate', popHandler)
	listeners.push(() => window.removeEventListener('popstate', popHandler))

	// hashchange
	const hashHandler = () => { checkUrl() }
	window.addEventListener('hashchange', hashHandler)
	listeners.push(() => window.removeEventListener('hashchange', hashHandler))

	// Navigation API (modern browsers)
	if ('navigation' in window) {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const nav = (window as any).navigation
		const navHandler = () => { checkUrl() }
		nav.addEventListener('navigate', navHandler)
		listeners.push(() => nav.removeEventListener('navigate', navHandler))
	}

	// Polling fallback (for SPA pushState without popstate)
	const intervalId = setInterval(checkUrl, 500)
	listeners.push(() => clearInterval(intervalId))

	return () => {
		listeners.forEach((off) => off())
	}
}
