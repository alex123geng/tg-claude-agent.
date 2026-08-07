import { query, type CanUseTool } from '@anthropic-ai/claude-agent-sdk';
import { config } from './config';
import { findDangerousReason } from './bashPolicy';
import { createConfirmation, encodeCallbackData } from './confirmations';
import { sendMessage } from './telegramApi';

// Bash is deliberately left out of allowedTools: the SDK only auto-approves
// tools listed there, so every Bash call is routed through canUseTool below.
const ALLOWED_TOOLS = ['Read', 'Write', 'Edit', 'Grep', 'Glob', 'WebSearch', 'WebFetch'];
const ALL_TOOLS = [...ALLOWED_TOOLS, 'Bash'];

function makeCanUseTool(chatId: number): CanUseTool {
  return async (toolName, input) => {
    if (toolName !== 'Bash') {
      return { behavior: 'allow' };
    }

    const command = typeof input.command === 'string' ? input.command : JSON.stringify(input);
    const reason = findDangerousReason(command);
    if (!reason) {
      return { behavior: 'allow' };
    }

    const { id, promise } = createConfirmation();
    await sendMessage(
      chatId,
      `⚠️ Опасная команда (${reason}):\n\n${command}\n\nРазрешить выполнение?`,
      {
        replyMarkup: {
          inline_keyboard: [
            [
              { text: '✅ Разрешить', callback_data: encodeCallbackData(id, 'allow') },
              { text: '❌ Отклонить', callback_data: encodeCallbackData(id, 'deny') },
            ],
          ],
        },
      },
    );

    const allowed = await promise;
    return allowed
      ? { behavior: 'allow' as const }
      : { behavior: 'deny' as const, message: 'Пользователь отклонил выполнение команды в Telegram.' };
  };
}

export interface AgentTurnResult {
  finalText: string;
  sessionId?: string;
  isError: boolean;
}

export async function runAgentTurn(params: {
  chatId: number;
  prompt: string;
  cwd: string;
  resumeSessionId?: string;
  onToolUse: (toolName: string, input: Record<string, unknown>) => void;
}): Promise<AgentTurnResult> {
  const stream = query({
    prompt: params.prompt,
    options: {
      cwd: params.cwd,
      resume: params.resumeSessionId,
      tools: ALL_TOOLS,
      allowedTools: ALLOWED_TOOLS,
      canUseTool: makeCanUseTool(params.chatId),
      // Never load the operator's local CLAUDE.md/skills/MCP servers — only
      // the project-level CLAUDE.md that lives inside the agent's own workdir.
      settingSources: ['project'],
      permissionMode: 'default',
      model: config.claudeModel,
    },
  });

  let sessionId = params.resumeSessionId;
  let finalText = '';
  let isError = false;

  for await (const message of stream) {
    if (message.type === 'system' && message.subtype === 'init') {
      sessionId = message.session_id;
    } else if (message.type === 'assistant') {
      sessionId = message.session_id;
      for (const block of message.message.content) {
        if (block.type === 'tool_use') {
          params.onToolUse(block.name, (block.input as Record<string, unknown>) ?? {});
        }
      }
    } else if (message.type === 'result') {
      sessionId = message.session_id;
      isError = message.is_error;
      finalText =
        message.subtype === 'success'
          ? message.result
          : `Ошибка агента (${message.subtype}).${message.errors?.length ? ' ' + message.errors.join('; ') : ''}`;
    }
  }

  return { finalText, sessionId, isError };
}
