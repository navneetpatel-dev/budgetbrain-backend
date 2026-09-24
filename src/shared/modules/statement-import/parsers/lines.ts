import type { Readable } from 'stream';

/**
 * Lines of a text stream, read chunk by chunk (plan T6.5: a statement is never held in memory
 * whole). Handles `\n`, `\r\n` (also when a chunk ends between the two) and `\r`, and a UTF-8
 * BOM. A single line is capped so a file without line breaks can't grow the buffer unbounded.
 */
export async function* readLines(input: AsyncIterable<string | Buffer> | Readable, maxLineChars = 64 * 1024): AsyncGenerator<string> {
  let buffer = '';
  let first = true;
  let skipLf = false;
  const decoder = new TextDecoder('utf-8');
  for await (const raw of input as AsyncIterable<string | Buffer>) {
    let chunk = typeof raw === 'string' ? raw : decoder.decode(raw, { stream: true });
    if (first) chunk = chunk.replace(/^\uFEFF/, '');
    first = false;
    if (skipLf && chunk.startsWith('\n')) chunk = chunk.slice(1);
    skipLf = false;
    buffer += chunk;
    let start = 0;
    for (let i = 0; i < buffer.length; i += 1) {
      const ch = buffer[i];
      if (ch !== '\n' && ch !== '\r') continue;
      yield buffer.slice(start, i);
      if (ch === '\r') {
        if (i + 1 === buffer.length) skipLf = true;
        else if (buffer[i + 1] === '\n') i += 1;
      }
      start = i + 1;
    }
    buffer = buffer.slice(start);
    if (buffer.length > maxLineChars) throw new Error(`A line is longer than ${maxLineChars} characters`);
  }
  buffer += decoder.decode();
  if (buffer.length > 0) yield buffer;
}
