export { PageController } from './PageController.js'
export type { BrowserState, DomNode, FlatDomTree, IndexedElement, PageInfo } from './dom/types.js'
export { buildFlatDomTree, getBrowserState, getElementByIndex, isInteractiveElement, watchUrlChanges } from './dom/index.js'
export { getPageInfo } from './dom/getPageInfo.js'
export { showMask, hideMask } from './mask/index.js'
export {
	clickElement,
	executeJavaScript,
	inputText,
	scroll,
	scrollHorizontally,
	selectDropdownOption,
	wait,
} from './actions.js'
export { setNativeValue, setContentEditableValue, patchAntDesignSelect } from './patches/index.js'
