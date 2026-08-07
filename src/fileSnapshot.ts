import fs from 'node:fs';
import path from 'node:path';

const SKIP_DIRS = new Set(['.git', 'node_modules', '.cache']);
const MAX_FILES_TO_SEND = 10;
const MAX_FILE_SIZE_BYTES = 45 * 1024 * 1024; // Telegram's bot-upload document limit.

export type Snapshot = Map<string, number>; // relative path -> mtimeMs

export function snapshotDir(dir: string): Snapshot {
  const snapshot: Snapshot = new Map();
  walk(dir, dir, snapshot);
  return snapshot;
}

function walk(root: string, current: string, snapshot: Snapshot): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(current, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry.name.startsWith('.') && entry.isDirectory()) continue;
    if (SKIP_DIRS.has(entry.name)) continue;

    const fullPath = path.join(current, entry.name);
    if (entry.isDirectory()) {
      walk(root, fullPath, snapshot);
    } else if (entry.isFile()) {
      const stat = fs.statSync(fullPath);
      snapshot.set(path.relative(root, fullPath), stat.mtimeMs);
    }
  }
}

// Returns new/changed files (absolute paths), most recently modified first.
export function diffSnapshots(root: string, before: Snapshot, after: Snapshot): string[] {
  const changed: string[] = [];
  for (const [relPath, mtimeMs] of after) {
    const beforeMtime = before.get(relPath);
    if (beforeMtime === undefined || beforeMtime !== mtimeMs) {
      changed.push(relPath);
    }
  }
  changed.sort((a, b) => (after.get(b) ?? 0) - (after.get(a) ?? 0));
  return changed.slice(0, MAX_FILES_TO_SEND).map((relPath) => path.join(root, relPath));
}

export function isSendableSize(filePath: string): boolean {
  try {
    return fs.statSync(filePath).size <= MAX_FILE_SIZE_BYTES;
  } catch {
    return false;
  }
}
