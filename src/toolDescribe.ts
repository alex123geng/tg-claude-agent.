function truncate(value: string, max = 300): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

export function describeToolUse(toolName: string, input: Record<string, unknown>): string {
  switch (toolName) {
    case 'Bash':
      return `\u{1F4BB} ${truncate(String(input.command ?? ''))}`;
    case 'Read':
      return `\u{1F4C4} Читаю ${input.file_path ?? ''}`;
    case 'Write':
      return `\u{1F4DD} Записываю ${input.file_path ?? ''}`;
    case 'Edit':
      return `\u{270F}\u{FE0F} Правлю ${input.file_path ?? ''}`;
    case 'Grep':
      return `\u{1F50D} Ищу "${truncate(String(input.pattern ?? ''), 100)}" в ${input.path ?? '.'}`;
    case 'Glob':
      return `\u{1F4C2} Список файлов: ${input.pattern ?? ''}`;
    case 'WebSearch':
      return `\u{1F310} Веб-поиск: ${truncate(String(input.query ?? ''), 150)}`;
    case 'WebFetch':
      return `\u{1F517} Открываю ${input.url ?? ''}`;
    default:
      return `\u{2699}\u{FE0F} ${toolName}`;
  }
}
