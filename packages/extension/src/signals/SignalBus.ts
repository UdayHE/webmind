/**
 * SignalBus — per-tab in-memory ring buffer for browser runtime signals.
 *
 * Stores last MAX_PER_TYPE events per signal type (FIFO eviction).
 * Lives in the background service worker, one instance per active tab.
 */

import type {
	AnySignalEvent,
	BrowserSignals,
	NetworkSignalEvent,
	WebSocketSignalEvent,
	ConsoleSignalEvent,
	ErrorSignalEvent,
} from './types.js'

const MAX_PER_TYPE = 200

export class SignalBus {
	private network: NetworkSignalEvent[] = []
	private websocket: WebSocketSignalEvent[] = []
	private console: ConsoleSignalEvent[] = []
	private errors: ErrorSignalEvent[] = []

	push(event: AnySignalEvent): void {
		switch (event.type) {
			case 'network':
				this.pushTo(this.network, event as NetworkSignalEvent)
				break
			case 'websocket':
				this.pushTo(this.websocket, event as WebSocketSignalEvent)
				break
			case 'console':
				this.pushTo(this.console, event as ConsoleSignalEvent)
				break
			case 'error':
				this.pushTo(this.errors, event as ErrorSignalEvent)
				break
		}
	}

	/**
	 * Update a partial network event by requestId (e.g., add response headers + body
	 * after the initial request event was already pushed).
	 */
	updateNetwork(requestId: string, update: Partial<NetworkSignalEvent>): void {
		const event = this.network.find((e) => e.requestId === requestId)
		if (event) Object.assign(event, update)
	}

	snapshot(): BrowserSignals {
		return {
			network: [...this.network],
			websocket: [...this.websocket],
			console: [...this.console],
			errors: [...this.errors],
		}
	}

	clear(): void {
		this.network = []
		this.websocket = []
		this.console = []
		this.errors = []
	}

	private pushTo<T>(arr: T[], item: T): void {
		arr.push(item)
		if (arr.length > MAX_PER_TYPE) arr.shift()
	}
}
