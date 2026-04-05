/**
 * Signal Bus event types — normalized browser runtime signals captured via CDP.
 */

export interface BaseSignalEvent {
	id: string
	type: string
	timestamp: number
	source: 'cdp'
}

export interface NetworkSignalEvent extends BaseSignalEvent {
	type: 'network'
	requestId: string
	url: string
	method: string
	status: number
	requestHeaders: Record<string, string>
	responseHeaders: Record<string, string>
	requestBody?: string
	responseBody?: string
	/** Duration in ms. -1 while request is still in flight. */
	duration: number
	startTime: number
}

export interface WebSocketSignalEvent extends BaseSignalEvent {
	type: 'websocket'
	url: string
	direction: 'send' | 'receive'
	payload: string
}

export interface ConsoleSignalEvent extends BaseSignalEvent {
	type: 'console'
	level: 'log' | 'warn' | 'error' | 'info' | 'debug'
	message: string
	stack?: string
}

export interface ErrorSignalEvent extends BaseSignalEvent {
	type: 'error'
	message: string
	stack?: string
}

export type AnySignalEvent =
	| NetworkSignalEvent
	| WebSocketSignalEvent
	| ConsoleSignalEvent
	| ErrorSignalEvent

export interface BrowserSignals {
	network: NetworkSignalEvent[]
	websocket: WebSocketSignalEvent[]
	console: ConsoleSignalEvent[]
	errors: ErrorSignalEvent[]
}

export function emptySignals(): BrowserSignals {
	return { network: [], websocket: [], console: [], errors: [] }
}
