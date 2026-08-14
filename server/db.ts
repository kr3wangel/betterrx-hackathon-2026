import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'

mkdirSync('data', { recursive: true })

export const db = new Database('data/app.db')
db.pragma('journal_mode = WAL')
