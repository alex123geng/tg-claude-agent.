import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });

const db = new Database(config.dbPath);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS chat_sessions (
    chat_id INTEGER PRIMARY KEY,
    session_id TEXT,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS processed_updates (
    update_id INTEGER PRIMARY KEY,
    processed_at TEXT NOT NULL
  );
`);

// Best-effort cleanup of old dedup entries so the table doesn't grow forever.
db.prepare(`DELETE FROM processed_updates WHERE processed_at < ?`).run(
  new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
);

const getSessionStmt = db.prepare<[number], { session_id: string | null }>(
  'SELECT session_id FROM chat_sessions WHERE chat_id = ?',
);
const upsertSessionStmt = db.prepare(
  `INSERT INTO chat_sessions (chat_id, session_id, updated_at) VALUES (?, ?, ?)
   ON CONFLICT(chat_id) DO UPDATE SET session_id = excluded.session_id, updated_at = excluded.updated_at`,
);
const clearSessionStmt = db.prepare('DELETE FROM chat_sessions WHERE chat_id = ?');
const markUpdateStmt = db.prepare(
  'INSERT OR IGNORE INTO processed_updates (update_id, processed_at) VALUES (?, ?)',
);

export function getSession(chatId: number): string | undefined {
  const row = getSessionStmt.get(chatId);
  return row?.session_id ?? undefined;
}

export function saveSession(chatId: number, sessionId: string): void {
  upsertSessionStmt.run(chatId, sessionId, new Date().toISOString());
}

export function clearSession(chatId: number): void {
  clearSessionStmt.run(chatId);
}

/** Returns true if this update was already processed (i.e. a Telegram retry). */
export function markUpdateProcessed(updateId: number): boolean {
  const result = markUpdateStmt.run(updateId, new Date().toISOString());
  return result.changes === 0;
}
