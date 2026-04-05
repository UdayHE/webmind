export interface FlatDomTree {
	root: DomNode
	nodeMap: Map<number, IndexedElement>
	simplifiedHTML: string
}

export interface IndexedElement {
	index: number
	element: Element
	tag: string
	isInteractive: boolean
}

export interface BaseDomNode {
	index: number
	tag: string
	text: string
	depth: number
}

export interface TextDomNode extends BaseDomNode {
	type: 'text'
}

interface BaseElementDomNode extends BaseDomNode {
	attributes: Record<string, string>
	children: DomNode[]
}

export interface ElementDomNode extends BaseElementDomNode {
	type: 'element'
}

export interface InteractiveElementDomNode extends BaseElementDomNode {
	type: 'interactive'
	role: string | null
	placeholder: string | null
	value: string | null
	ariaLabel: string | null
}

export type DomNode = TextDomNode | ElementDomNode | InteractiveElementDomNode

export interface BrowserState {
	url: string
	title: string
	viewportWidth: number
	viewportHeight: number
	scrollX: number
	scrollY: number
	scrollHeight: number
	scrollWidth: number
	canScrollUp: boolean
	canScrollDown: boolean
	canScrollLeft: boolean
	canScrollRight: boolean
}

export interface PageInfo {
	url: string
	title: string
	description: string
	favicon: string
	lang: string
	charset: string
}
