import { getElementByIndex } from './dom/index.js'
import { patchAntDesignSelect, setContentEditableValue, setNativeValue } from './patches/index.js'
import { delay, scrollIntoViewIfNeeded, simulateClick, simulateHover } from './utils/index.js'

/**
 * Click an indexed element with a full interaction sequence:
 * scroll into view → hover → focus → click.
 */
export async function clickElement(index: number): Promise<void> {
	const el = getElementByIndex(index)
	if (!el) throw new Error(`Element [${index}] not found`)

	await scrollIntoViewIfNeeded(el)
	simulateHover(el)
	await delay(30)

	if (typeof (el as HTMLElement).focus === 'function') {
		;(el as HTMLElement).focus({ preventScroll: true })
	}

	simulateClick(el)

	// Wait briefly for any UI update
	await delay(100)
}

/**
 * Input text into a form element at the given index.
 * Handles: input, textarea, contentEditable, React, Vue, AntD.
 */
export async function inputText(index: number, text: string): Promise<void> {
	const el = getElementByIndex(index)
	if (!el) throw new Error(`Element [${index}] not found`)

	await scrollIntoViewIfNeeded(el)
	;(el as HTMLElement).focus()
	await delay(50)

	if (el.tagName.toLowerCase() === 'input' || el.tagName.toLowerCase() === 'textarea') {
		const inputEl = el as HTMLInputElement | HTMLTextAreaElement

		// Clear existing value first
		setNativeValue(inputEl, '')
		await delay(30)

		// Set new value (handles React synthetic events)
		setNativeValue(inputEl, text)

		// For some frameworks, also simulate keypress events
		for (const char of text) {
			el.dispatchEvent(new KeyboardEvent('keypress', { key: char, bubbles: true }))
		}

		el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
	} else if ((el as HTMLElement).contentEditable === 'true') {
		setContentEditableValue(el as HTMLElement, text)
	} else {
		// Last resort: try as input
		const inputEl = el as HTMLInputElement
		setNativeValue(inputEl, text)
	}

	await delay(100)
}

/**
 * Select a dropdown option by visible text.
 * Handles: native <select>, AntD Select, custom dropdowns.
 */
export async function selectDropdownOption(index: number, optionText: string): Promise<void> {
	const el = getElementByIndex(index)
	if (!el) throw new Error(`Element [${index}] not found`)

	await scrollIntoViewIfNeeded(el)

	// Native <select>
	if (el.tagName.toLowerCase() === 'select') {
		const selectEl = el as HTMLSelectElement
		const options = Array.from(selectEl.options)
		const match = options.find(
			(o) => o.text.trim() === optionText || o.value === optionText,
		)
		if (!match) throw new Error(`Option "${optionText}" not found in select [${index}]`)

		selectEl.value = match.value
		selectEl.dispatchEvent(new Event('change', { bubbles: true }))
		selectEl.dispatchEvent(new Event('input', { bubbles: true }))
		return
	}

	// Ant Design
	if (patchAntDesignSelect(el, optionText)) return

	// Generic custom dropdown: click to open, then find and click option
	;(el as HTMLElement).click()
	await delay(200)

	// Look for visible options in dropdown menus
	const selectors = [
		'[role="option"]',
		'[role="listbox"] [role="option"]',
		'.dropdown-item',
		'li[data-value]',
		'.select-option',
	]

	for (const selector of selectors) {
		const options = document.querySelectorAll(selector)
		for (const opt of options) {
			if ((opt as HTMLElement).innerText?.trim() === optionText) {
				;(opt as HTMLElement).click()
				await delay(100)
				return
			}
		}
	}

	throw new Error(`Could not select option "${optionText}" from element [${index}]`)
}

/**
 * Scroll the page or a specific element vertically.
 */
export async function scroll(
	direction: 'up' | 'down',
	amount = 300,
	elementIndex?: number,
): Promise<void> {
	const delta = direction === 'down' ? amount : -amount

	if (elementIndex !== undefined) {
		const el = getElementByIndex(elementIndex)
		if (el) {
			el.scrollBy({ top: delta, behavior: 'smooth' })
			await delay(300)
			return
		}
	}

	window.scrollBy({ top: delta, behavior: 'smooth' })
	await delay(300)
}

/**
 * Scroll the page horizontally.
 */
export async function scrollHorizontally(
	direction: 'left' | 'right',
	amount = 300,
): Promise<void> {
	const delta = direction === 'right' ? amount : -amount
	window.scrollBy({ left: delta, behavior: 'smooth' })
	await delay(300)
}

/**
 * Execute arbitrary JavaScript in page context.
 */
export async function executeJavaScript(code: string): Promise<unknown> {
	// Use async IIFE to support await in the provided code
	const wrapped = `(async () => { ${code} })()`
	// eslint-disable-next-line no-eval
	return eval(wrapped)
}

/**
 * Wait for specified seconds (clamped to 1-10).
 */
export async function wait(seconds: number): Promise<void> {
	const clamped = Math.max(1, Math.min(10, seconds))
	await delay(clamped * 1000)
}
