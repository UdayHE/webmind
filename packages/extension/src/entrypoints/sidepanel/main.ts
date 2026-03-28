/**
 * Side Panel entry point — mounts the WebMind control panel in the extension side panel.
 */

import { SidePanel } from '../../components/SidePanel.js'

const root = document.getElementById('root')
if (root) {
	const panel = new SidePanel()
	panel.mount(root)
}
