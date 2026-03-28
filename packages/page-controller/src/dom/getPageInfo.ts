import type { PageInfo } from './types.js'

export function getPageInfo(): PageInfo {
	const favicon =
		(document.querySelector('link[rel="icon"]') as HTMLLinkElement | null)?.href ??
		(document.querySelector('link[rel="shortcut icon"]') as HTMLLinkElement | null)?.href ??
		''

	return {
		url: window.location.href,
		title: document.title,
		description:
			document.querySelector('meta[name="description"]')?.getAttribute('content') ?? '',
		favicon,
		lang: document.documentElement.lang || navigator.language,
		charset: document.characterSet,
	}
}
