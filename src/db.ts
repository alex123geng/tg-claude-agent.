import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config';

fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });

const db = new Database(config.dbPath);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    chat_id INTEGER PRIMARY KEY,
    session_id TEXT,
    updated_at TEXT NOT NULL
  );
`);

const getStmt = db.prepare<{ chatId: number }, { session_id: string }>(
  'SELECT session_id FROM sessions WHERE chat_id = @chatId',
);
const upsertStmt = db.prepare(
  `INSERT INTO sessions (chat_id, session_id, updated_at)
   VALUES (@chatId, @sessionId, @updatedAt)
   ON CONFLICT(chat_id) DO UPDATE SET session_id = excluded.session_id, updated_at = excluded.updated_at`,
);

export function getSessionId(chatId: number): string | undefined {
  const row = getStmt.get({ chatId }) as { session_id: string } | undefined;
  return row?.session_id ?? undefined;
}

export function setSessionId(chatId: number, sessionId: string): void {
  upsertStmt.run({ chatId, sessionId, updatedAt: new Date().toISOString() });
}
