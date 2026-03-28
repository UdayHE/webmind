/**
 * Utility: scroll an element into view smoothly, wait for it to be visible.
 */
export async function scrollIntoViewIfNeeded(el: Element): Promise<void> {
	const rect = el.getBoundingClientRect()
	const inView =
		rect.top >= 0 &&
		rect.left >= 0 &&
		rect.bottom <= window.innerHeight &&
		rect.right <= window.innerWidth

	if (!inView) {
		el.scrollIntoView({ behavior: 'smooth', block: 'center' })
		await delay(300)
	}
}

/**
 * Simulate mouse hover on element (mouseover + mouseenter + mousemove).
 */
export function simulateHover(el: Element): void {
	const rect = el.getBoundingClientRect()
	const cx = rect.left + rect.width / 2
	const cy = rect.top + rect.height / 2

	const opts: MouseEventInit = {
		bubbles: true,
		cancelable: true,
		clientX: cx,
		clientY: cy,
	}

	el.dispatchEvent(new MouseEvent('mouseover', opts))
	el.dispatchEvent(new MouseEvent('mouseenter', { ...opts, bubbles: false }))
	el.dispatchEvent(new MouseEvent('mousemove', opts))
}

/**
 * Simulate a complete click sequence: mousedown → mouseup → click.
 */
export function simulateClick(el: Element): void {
	const rect = el.getBoundingClientRect()
	const cx = rect.left + rect.width / 2
	const cy = rect.top + rect.height / 2

	const opts: MouseEventInit = {
		bubbles: true,
		cancelable: true,
		clientX: cx,
		clientY: cy,
		button: 0,
	}

	el.dispatchEvent(new MouseEvent('mousedown', opts))
	el.dispatchEvent(new MouseEvent('mouseup', opts))
	el.dispatchEvent(new MouseEvent('click', opts))
}

export function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms))
}
