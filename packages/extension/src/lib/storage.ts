/**
 * IndexedDB-backed storage for extension history and config.
 * Uses the `idb` wrapper for a Promise-based API.
 */

import { openDB } from 'idb'
import type { DBSchema, IDBPDatabase } from 'idb'
import type { HistoryEntry } from '@webmind/ui'

interface WebMindDB extends DBSchema {
	history: {
		key: string
		value: HistoryEntry
		indexes: { 'by-date': number }
	}
	config: {
		key: string
		value: unknown
	}
}

let db: IDBPDatabase<WebMindDB> | null = null

async function getDB(): Promise<IDBPDatabase<WebMindDB>> {
	if (db) return db
	db = await openDB<WebMindDB>('webmind-ext', 1, {
		upgrade(database) {
			const historyStore = database.createObjectStore('history', { keyPath: 'id' })
			historyStore.createIndex('by-date', 'startedAt')
			database.createObjectStore('config')
		},
	})
	return db
}

export async function saveHistoryEntry(entry: HistoryEntry): Promise<void> {
	const database = await getDB()
	await database.put('history', entry)
}

export async function getHistory(): Promise<HistoryEntry[]> {
	const database = await getDB()
	const all = await database.getAllFromIndex('history', 'by-date')
	return all.reverse()
}

export async function clearHistory(): Promise<void> {
	const database = await getDB()
	await database.clear('history')
}

export async function saveConfig(key: string, value: unknown): Promise<void> {
	const database = await getDB()
	await database.put('config', value, key)
}

export async function loadConfig<T>(key: string): Promise<T | undefined> {
	const database = await getDB()
	return database.get('config', key) as Promise<T | undefined>
}
