/**
 * Token-based auth between extension background and content scripts.
 * The background generates a UUID token per tab session; content scripts
 * must present the correct token to accept commands.
 */

const TOKEN_KEY = '__webmind_auth_token__'

/** Generate and store an auth token for a tab. */
export function generateAuthToken(): string {
	const token = crypto.randomUUID()
	return token
}

/** Store the auth token in extension storage (background side). */
export async function storeTabToken(tabId: number, token: string): Promise<void> {
	await chrome.storage.session.set({ [`tab_token_${tabId}`]: token })
}

/** Retrieve the auth token for a tab. */
export async function getTabToken(tabId: number): Promise<string | null> {
	const result = await chrome.storage.session.get(`tab_token_${tabId}`)
	return (result[`tab_token_${tabId}`] as string) ?? null
}

/** Content script: validate incoming auth token against stored value. */
export function validateToken(incomingToken: string): boolean {
	const stored = localStorage.getItem(TOKEN_KEY)
	return stored === incomingToken
}

/** Content script: store the auth token received from background. */
export function storeToken(token: string): void {
	localStorage.setItem(TOKEN_KEY, token)
}

/** Content script: clear stored token (on dispose). */
export function clearToken(): void {
	localStorage.removeItem(TOKEN_KEY)
}
