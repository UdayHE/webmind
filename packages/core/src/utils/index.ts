/**
 * Simple delay utility.
 */
export function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Truncate a string to maxLength, adding ellipsis if needed.
 */
export function truncate(str: string, maxLength: number): string {
	if (str.length <= maxLength) return str
	return str.slice(0, maxLength - 1) + '…'
}

/**
 * Try to fetch the llms.txt file from the current page's origin.
 * This is an experimental standard for sites to provide LLM context hints.
 * Returns null if not available.
 */
export async function fetchLlmsTxt(url: string): Promise<string | null> {
	try {
		const origin = new URL(url).origin
		const resp = await fetch(`${origin}/llms.txt`, { signal: AbortSignal.timeout(3000) })
		if (!resp.ok) return null
		return await resp.text()
	} catch {
		return null
	}
}

/**
 * Format a HistoricalEvent array into a human-readable summary.
 */
export function formatHistory(
	history: Array<{ type: string; timestamp: number }>,
): string {
	return history
		.map((e) => `[${new Date(e.timestamp).toISOString()}] ${e.type}`)
		.join('\n')
}
