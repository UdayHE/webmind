/**
 * Framework patches for React, Vue, Ant Design, and other UI frameworks.
 *
 * Problem: Modern frameworks track their own internal state and don't
 * respond to direct DOM value assignments. These patches trigger the
 * correct synthetic events so frameworks pick up the changes.
 */

/**
 * Set value on an input/textarea in a way React will detect.
 * React overrides the value property setter, so we use the native setter.
 */
export function setNativeValue(
	el: HTMLInputElement | HTMLTextAreaElement,
	value: string,
): void {
	const proto =
		el instanceof HTMLTextAreaElement
			? window.HTMLTextAreaElement.prototype
			: window.HTMLInputElement.prototype

	const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
	if (nativeSetter) {
		nativeSetter.call(el, value)
	} else {
		el.value = value
	}

	// Trigger React's synthetic event system
	el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }))
	el.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }))
}

/**
 * Set value in a contentEditable element.
 * Works with rich text editors like Draft.js, Quill, TipTap, Slate, ProseMirror.
 */
export function setContentEditableValue(el: HTMLElement, text: string): void {
	el.focus()

	// Select all existing content
	const selection = window.getSelection()
	if (selection) {
		const range = document.createRange()
		range.selectNodeContents(el)
		selection.removeAllRanges()
		selection.addRange(range)
	}

	// Use execCommand for broad compatibility
	if (document.execCommand) {
		document.execCommand('insertText', false, text)
	} else {
		el.textContent = text
		el.dispatchEvent(new Event('input', { bubbles: true }))
	}
}

/**
 * Try to handle Ant Design Select components.
 * AntD Select renders a custom div, not a native <select>.
 * Returns true if handled, false if the element is not an AntD select.
 */
export function patchAntDesignSelect(el: Element, optionText: string): boolean {
	// Check if this looks like an AntD select trigger
	const isAntSelect =
		el.classList.contains('ant-select-selector') ||
		el.closest('.ant-select') !== null ||
		el.getAttribute('class')?.includes('ant-select') === true

	if (!isAntSelect) return false

	// Click the selector to open dropdown
	const trigger =
		el.closest('.ant-select') ??
		el.querySelector('.ant-select-selector') ??
		el
	;(trigger as HTMLElement).click()

	// Wait for dropdown and click matching option
	setTimeout(() => {
		const options = document.querySelectorAll(
			'.ant-select-item-option-content, .ant-select-dropdown [title]',
		)
		for (const opt of options) {
			if (opt.textContent?.trim() === optionText) {
				;(opt as HTMLElement).click()
				break
			}
		}
	}, 100)

	return true
}

/**
 * Patch for Vue v-model inputs that may need blur event to commit value.
 */
export function triggerVueUpdate(el: HTMLInputElement | HTMLTextAreaElement): void {
	el.dispatchEvent(new Event('blur', { bubbles: true }))
}
