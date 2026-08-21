import { query, type Options, type PermissionResult } from '@anthropic-ai/claude-agent-sdk';
import fs from 'node:fs';
import { config } from './config.js';
import { getSession, saveSession, clearSession } from './db.js';
import { editMessageText, sendStatusMessage } from './telegram.js';
import { requestBashConfirmation } from './permissions.js';
import { isDangerousBashCommand } from './safety.js';
import { logger } from './logger.js';

fs.mkdirSync(config.agentWorkdir, { recursive: true });

const ALLOWED_TOOLS = ['Read', 'Write', 'Edit', 'Grep', 'Glob', 'WebSearch', 'WebFetch'];
const PROGRESS_EDIT_INTERVAL_MS = 1200;
const MAX_PROGRESS_LINES = 12;

async function canUseTool(toolName: string, input: Record<string, unknown>, chatId: number): Promise<PermissionResult> {
  if (toolName === 'Bash') {
    const command = typeof input.command === 'string' ? input.command : '';
    if (isDangerousBashCommand(command)) {
      const allowed = await requestBashConfirmation(chatId, command);
      if (!allowed) {
        return { behavior: 'deny', message: 'Rejected by the owner via Telegram.' };
      }
    }
  }
  return { behavior: 'allow', updatedInput: input };
}

function describeToolUse(name: string, input: Record<string, unknown>): string {
  switch (name) {
    case 'Bash':
      return `Bash: ${String(input.command ?? '').slice(0, 120)}`;
    case 'Read':
    case 'Edit':
    case 'Write':
      return `${name}: ${String(input.file_path ?? input.path ?? '')}`;
    case 'Grep':
      return `Grep: ${String(input.pattern ?? '')}`;
    case 'Glob':
      return `Glob: ${String(input.pattern ?? '')}`;
    case 'WebSearch':
      return `WebSearch: ${String(input.query ?? '')}`;
    case 'WebFetch':
      return `WebFetch: ${String(input.url ?? '')}`;
    default:
      return name;
  }
}

class ProgressReporter {
  private lines: string[] = [];
  private lastEditAt = 0;

  constructor(
    private chatId: number,
    private messageId: number,
  ) {}

  note(line: string): void {
    this.lines.push(line);
    if (this.lines.length > MAX_PROGRESS_LINES) {
      this.lines = this.lines.slice(-MAX_PROGRESS_LINES);
    }
    const now = Date.now();
    if (now - this.lastEditAt < PROGRESS_EDIT_INTERVAL_MS) return;
    this.lastEditAt = now;
    editMessageText(this.chatId, this.messageId, this.render()).catch(() => {});
  }

  private render(): string {
    return `🔧 Working…\n\n${this.lines.join('\n')}`;
  }
}

function buildOptions(chatId: number, resume: string | undefined): Options {
  return {
    cwd: config.agentWorkdir,
    resume,
    permissionMode: 'default',
    settingSources: [],
    allowedTools: ALLOWED_TOOLS,
    canUseTool: (toolName, input) => canUseTool(toolName, input, chatId),
    env: {
      ...process.env,
      ...(config.anthropicApiKey ? { ANTHROPIC_API_KEY: config.anthropicApiKey } : {}),
      ...(config.claudeCodeOauthToken ? { CLAUDE_CODE_OAUTH_TOKEN: config.claudeCodeOauthToken } : {}),
    },
  };
}

interface AgentAttempt {
  sessionId?: string;
  result?: string;
  error?: string;
}

async function runOnce(prompt: string, resume: string | undefined, chatId: number, progress: ProgressReporter): Promise<AgentAttempt> {
  const attempt: AgentAttempt = {};
  for await (const message of query({ prompt, options: buildOptions(chatId, resume) })) {
    if (message.type === 'system' && message.subtype === 'init') {
      attempt.sessionId = message.session_id;
    } else if (message.type === 'assistant') {
      for (const block of message.message.content) {
        if (block.type === 'tool_use') {
          progress.note(describeToolUse(block.name, (block.input as Record<string, unknown>) ?? {}));
        }
      }
    } else if (message.type === 'result') {
      attempt.sessionId = message.session_id;
      if (message.subtype === 'success') {
        attempt.result = message.result;
      } else {
        attempt.error = message.errors?.join('; ') || message.subtype;
      }
    }
  }
  return attempt;
}

export async function runAgent(chatId: number, prompt: string): Promise<string> {
  const resumeSessionId = getSession(chatId);
  const statusMessageId = await sendStatusMessage(chatId, '🔧 Working…');
  const progress = new ProgressReporter(chatId, statusMessageId);

  let attempt = await runOnce(prompt, resumeSessionId, chatId, progress);

  if (attempt.error && resumeSessionId) {
    logger.warn(`Agent resume failed for chat ${chatId}, retrying with a fresh session:`, attempt.error);
    clearSession(chatId);
    progress.note('↻ Resuming failed, retrying with a fresh session…');
    attempt = await runOnce(prompt, undefined, chatId, progress);
  }

  if (attempt.sessionId) {
    saveSession(chatId, attempt.sessionId);
  }

  if (attempt.error) {
    throw new Error(attempt.error);
  }
  if (!attempt.result) {
    throw new Error('Agent returned no result');
  }
  return attempt.result;
}

export function resetAgentSession(chatId: number): void {
  clearSession(chatId);
}
