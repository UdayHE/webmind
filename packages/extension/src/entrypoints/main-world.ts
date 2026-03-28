/**
 * Main World Script — injected into the main (non-isolated) world context.
 *
 * This script has direct DOM access identical to the page's own JavaScript.
 * It receives PAGE_CONTROL actions from the content script (isolated world)
 * via CustomEvents, executes them using PageController, and sends results back.
 *
 * Why: The isolated world content script cannot access the page's JavaScript
 * context (React state, etc.), but this main-world script can.
 */

import { PageController } from '@webmind/page-controller'
import type { RemoteAction } from '../agent/RemotePageController.js'

const controller = new PageController()

document.addEventListener('webmind_page_control', async (e: Event) => {
	const action = (e as CustomEvent<RemoteAction>).detail
	let result: { success: boolean; data?: unknown; error?: string }

	try {
		switch (action.type) {
			case 'updateTree': {
				const html = await controller.updateTree()
				result = { success: true, data: html }
				break
			}
			case 'getBrowserState': {
				result = { success: true, data: controller.getBrowserState() }
				break
			}
			case 'clickElement': {
				await controller.clickElement(Number(action.index))
				result = { success: true }
				break
			}
			case 'inputText': {
				await controller.inputText(Number(action.index), String(action.text))
				result = { success: true }
				break
			}
			case 'selectDropdownOption': {
				await controller.selectDropdownOption(
					Number(action.index),
					String(action.optionText),
				)
				result = { success: true }
				break
			}
			case 'scroll': {
				await controller.scroll(
					action.direction as 'up' | 'down',
					typeof action.amount === 'number' ? action.amount : undefined,
					typeof action.elementIndex === 'number' ? action.elementIndex : undefined,
				)
				result = { success: true }
				break
			}
			case 'scrollHorizontally': {
				await controller.scrollHorizontally(
					action.direction as 'left' | 'right',
					typeof action.amount === 'number' ? action.amount : undefined,
				)
				result = { success: true }
				break
			}
			case 'executeJavaScript': {
				const data = await controller.executeJavaScript(String(action.code))
				result = { success: true, data }
				break
			}
			case 'wait': {
				await controller.wait(Number(action.seconds))
				result = { success: true }
				break
			}
			case 'showMask': {
				controller.showMask()
				result = { success: true }
				break
			}
			case 'hideMask': {
				controller.hideMask()
				result = { success: true }
				break
			}
			default:
				result = { success: false, error: `Unknown action: ${action.type}` }
		}
	} catch (err) {
		result = {
			success: false,
			error: err instanceof Error ? err.message : String(err),
		}
	}

	document.dispatchEvent(
		new CustomEvent('webmind_page_control_result', { detail: result }),
	)
})

console.log('[WebMind] Main world script loaded')
