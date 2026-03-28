import { defineConfig } from 'wxt'

export default defineConfig({
	srcDir: 'src',
	extensionApi: 'chrome',
	manifest: {
		name: 'WebMind Browser Agent',
		description: 'AI-powered browser automation via natural language',
		version: '1.0.0',
		permissions: [
			'tabs',
			'activeTab',
			'storage',
			'sidePanel',
			'scripting',
		],
		host_permissions: ['<all_urls>'],
		icons: {
			16: 'icons/icon-16.png',
			32: 'icons/icon-32.png',
			48: 'icons/icon-48.png',
			128: 'icons/icon-128.png',
		},
		action: {
			default_title: 'WebMind',
			default_icon: {
				16: 'icons/icon-16.png',
				32: 'icons/icon-32.png',
				48: 'icons/icon-48.png',
				128: 'icons/icon-128.png',
			},
		},
		side_panel: {
			default_path: 'entrypoints/sidepanel/index.html',
		},
		background: {
			service_worker: 'entrypoints/background.ts',
			type: 'module',
		},
	},
})
