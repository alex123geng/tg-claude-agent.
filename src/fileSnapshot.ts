import fs from 'node:fs/promises';
import path from 'node:path';

const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '__pycache__', '.venv', 'venv']);

export type FileSnapshot = Map<string, number>;

async function walk(dir: string, root: string, out: FileSnapshot): Promise<void> {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(fullPath, root, out);
    } else if (entry.isFile()) {
      const stat = await fs.stat(fullPath).catch(() => undefined);
      if (stat) out.set(path.relative(root, fullPath), stat.mtimeMs);
    }
  }
}

export async function snapshotWorkdir(root: string): Promise<FileSnapshot> {
  const out: FileSnapshot = new Map();
  await walk(root, root, out);
  return out;
}

/** Relative paths that are new or whose mtime changed between the two snapshots. */
export function diffSnapshots(before: FileSnapshot, after: FileSnapshot): string[] {
  const changed: string[] = [];
  for (const [relPath, mtime] of after) {
    if (before.get(relPath) !== mtime) {
      changed.push(relPath);
    }
  }
  return changed;
}
