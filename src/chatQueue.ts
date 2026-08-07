// Serializes turns per chat_id so a chat's second message never races the
// agent SDK session still resuming from its first.
const queues = new Map<number, Promise<void>>();

export function enqueue(chatId: number, task: () => Promise<void>): void {
  const previous = queues.get(chatId) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(() =>
    task().catch((err) => {
      console.error(`Chat ${chatId} task failed:`, err);
    }),
  );
  queues.set(chatId, next);
}
