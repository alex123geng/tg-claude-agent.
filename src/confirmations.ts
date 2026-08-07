import crypto from 'node:crypto';

interface PendingConfirmation {
  resolve: (allow: boolean) => void;
  timeout: NodeJS.Timeout;
}

const CONFIRMATION_TIMEOUT_MS = 5 * 60 * 1000;

const pending = new Map<string, PendingConfirmation>();

export function createConfirmation(): { id: string; promise: Promise<boolean> } {
  const id = crypto.randomUUID();
  const promise = new Promise<boolean>((resolve) => {
    const timeout = setTimeout(() => {
      pending.delete(id);
      resolve(false);
    }, CONFIRMATION_TIMEOUT_MS);
    pending.set(id, { resolve, timeout });
  });
  return { id, promise };
}

export function resolveConfirmation(id: string, allow: boolean): boolean {
  const entry = pending.get(id);
  if (!entry) return false;
  clearTimeout(entry.timeout);
  pending.delete(id);
  entry.resolve(allow);
  return true;
}

export function encodeCallbackData(id: string, decision: 'allow' | 'deny'): string {
  return `bashconfirm:${id}:${decision}`;
}

export function decodeCallbackData(data: string): { id: string; decision: 'allow' | 'deny' } | null {
  const match = /^bashconfirm:([0-9a-f-]{36}):(allow|deny)$/.exec(data);
  if (!match) return null;
  return { id: match[1], decision: match[2] as 'allow' | 'deny' };
}
