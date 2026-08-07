import fs from 'node:fs';
import path from 'node:path';
import { config } from './config';

const DEFAULT_CLAUDE_MD = `# Память агента

Это рабочая директория Telegram-агента для конкретного чата. Файлы, которые
ты создаёшь или меняешь здесь, автоматически пересылаются владельцу в Telegram.

Можешь использовать этот файл, чтобы запоминать долгоживущий контекст о
задачах и предпочтениях владельца между сессиями — просто дополняй его.
`;

// One working directory per chat, so sessions/files from different chats
// never collide. settingSources: ['project'] makes the SDK read this
// directory's CLAUDE.md as the agent's persistent project memory.
export function ensureChatWorkdir(chatId: number): string {
  const dir = path.join(config.agentWorkdir, String(chatId));
  fs.mkdirSync(dir, { recursive: true });

  const claudeMdPath = path.join(dir, 'CLAUDE.md');
  if (!fs.existsSync(claudeMdPath)) {
    fs.writeFileSync(claudeMdPath, DEFAULT_CLAUDE_MD, 'utf8');
  }

  return dir;
}
