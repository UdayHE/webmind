/**
 * Visual masking overlay — shows a semi-transparent overlay with a spinner
 * when the agent is thinking or performing actions.
 */

const MASK_ID = '__webmind_mask__'
const STYLE_ID = '__webmind_mask_style__'

const MASK_CSS = `
#${MASK_ID} {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.35);
  z-index: 2147483646;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.2s ease;
  pointer-events: all;
  cursor: wait;
}
#${MASK_ID}.visible {
  opacity: 1;
}
#${MASK_ID} .webmind-spinner {
  width: 48px;
  height: 48px;
  border: 4px solid rgba(255,255,255,0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: webmind-spin 0.8s linear infinite;
}
@keyframes webmind-spin {
  to { transform: rotate(360deg); }
}
`

export function showMask(): void {
	injectStyles()
	let mask = document.getElementById(MASK_ID)

	if (!mask) {
		mask = document.createElement('div')
		mask.id = MASK_ID

		const spinner = document.createElement('div')
		spinner.className = 'webmind-spinner'
		mask.appendChild(spinner)

		document.body.appendChild(mask)
	}

	// Force reflow then add visible class for transition
	mask.offsetHeight // trigger reflow
	mask.classList.add('visible')
}

export function hideMask(): void {
	const mask = document.getElementById(MASK_ID)
	if (!mask) return

	mask.classList.remove('visible')

	mask.addEventListener(
		'transitionend',
		() => {
			mask.remove()
		},
		{ once: true },
	)

	// Fallback in case transitionend doesn't fire
	setTimeout(() => {
		mask.remove()
	}, 300)
}

function injectStyles(): void {
	if (document.getElementById(STYLE_ID)) return
	const style = document.createElement('style')
	style.id = STYLE_ID
	style.textContent = MASK_CSS
	document.head.appendChild(style)
}
