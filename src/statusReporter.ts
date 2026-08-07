import { editMessageText } from './telegramApi';

const MIN_EDIT_INTERVAL_MS = 1200;
const MAX_LINES = 20;
const MAX_TEXT_LENGTH = 4000;

// Forwards tool_use activity into a single Telegram message that gets
// edited in place, throttled so a chatty turn doesn't trip Telegram's
// per-chat edit rate limit.
export class StatusReporter {
  private lines: string[] = [];
  private lastEditAt = 0;
  private pendingTimer: NodeJS.Timeout | null = null;
  private dirty = false;

  constructor(
    private readonly chatId: number,
    private readonly messageId: number,
    private readonly header: string,
  ) {}

  addLine(line: string): void {
    this.lines.push(line);
    if (this.lines.length > MAX_LINES) {
      this.lines = this.lines.slice(-MAX_LINES);
    }
    this.scheduleFlush();
  }

  private scheduleFlush(): void {
    this.dirty = true;
    const elapsed = Date.now() - this.lastEditAt;
    if (elapsed >= MIN_EDIT_INTERVAL_MS) {
      this.flush();
    } else if (!this.pendingTimer) {
      this.pendingTimer = setTimeout(() => this.flush(), MIN_EDIT_INTERVAL_MS - elapsed);
    }
  }

  private flush(): void {
    this.pendingTimer = null;
    if (!this.dirty) return;
    this.dirty = false;
    this.lastEditAt = Date.now();
    void editMessageText(this.chatId, this.messageId, this.render(this.header));
  }

  async finish(finalHeader: string): Promise<void> {
    if (this.pendingTimer) {
      clearTimeout(this.pendingTimer);
      this.pendingTimer = null;
    }
    await editMessageText(this.chatId, this.messageId, this.render(finalHeader));
  }

  private render(header: string): string {
    const body = this.lines.join('\n');
    const text = body ? `${header}\n\n${body}` : header;
    return text.length > MAX_TEXT_LENGTH ? text.slice(text.length - MAX_TEXT_LENGTH) : text;
  }
}
