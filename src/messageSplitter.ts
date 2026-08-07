// Telegram sendMessage rejects text over 4096 chars outright, so long agent
// replies must be chunked before sending, splitting on line boundaries where possible.
const MAX_CHUNK_LENGTH = 4000;

export function splitMessage(text: string, maxLength = MAX_CHUNK_LENGTH): string[] {
  if (text.length <= maxLength) {
    return [text];
  }

  const chunks: string[] = [];
  let current = '';

  for (const line of text.split('\n')) {
    let remainingLine = line;

    // A single line longer than the limit has to be hard-split.
    while (remainingLine.length > maxLength) {
      if (current) {
        chunks.push(current);
        current = '';
      }
      chunks.push(remainingLine.slice(0, maxLength));
      remainingLine = remainingLine.slice(maxLength);
    }

    const candidate = current ? `${current}\n${remainingLine}` : remainingLine;
    if (candidate.length > maxLength) {
      chunks.push(current);
      current = remainingLine;
    } else {
      current = candidate;
    }
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
}
