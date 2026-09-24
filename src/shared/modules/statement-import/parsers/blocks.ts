/**
 * Yields each `<tag>…</tag>` block of a markup stream (OFX, CAMT.053) while holding only the
 * current block, plus whatever came before the first block (for statement-level fields such as
 * the currency). Tag names match case-insensitively and with an optional namespace prefix.
 */
export async function* readBlocks(
  input: AsyncIterable<string | Buffer>,
  tag: string,
  onPreamble: (text: string) => void,
  maxBlockChars = 256 * 1024
): AsyncGenerator<string> {
  const open = new RegExp(`<(?:[\\w-]+:)?${tag}[\\s>]`, 'i');
  const close = new RegExp(`</(?:[\\w-]+:)?${tag}\\s*>`, 'i');
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let preambleDone = false;
  for await (const raw of input) {
    buffer += typeof raw === 'string' ? raw : decoder.decode(raw, { stream: true });
    for (;;) {
      const start = buffer.search(open);
      if (start < 0) {
        // Keep a tail in case the opening tag is split across chunks.
        if (!preambleDone && buffer.length > maxBlockChars) {
          onPreamble(buffer.slice(0, -64));
          buffer = buffer.slice(-64);
        } else if (preambleDone && buffer.length > 64) {
          buffer = buffer.slice(-64);
        }
        break;
      }
      if (!preambleDone) {
        onPreamble(buffer.slice(0, start));
        preambleDone = true;
      }
      const rest = buffer.slice(start);
      const end = rest.search(close);
      if (end < 0) {
        buffer = rest;
        if (buffer.length > maxBlockChars) throw new Error(`A <${tag}> entry is longer than ${maxBlockChars} characters`);
        break;
      }
      const closeMatch = close.exec(rest.slice(end))!;
      yield rest.slice(0, end + closeMatch[0].length);
      buffer = rest.slice(end + closeMatch[0].length);
    }
  }
  if (!preambleDone) onPreamble(buffer + decoder.decode());
}

/** Text of the first `<tag>` in a block; handles OFX SGML leaf tags that are never closed. */
export function tagText(block: string, tag: string): string | null {
  const m = new RegExp(`<(?:[\\w-]+:)?${tag}(?:\\s[^>]*)?>([^<]*)`, 'i').exec(block);
  if (!m) return null;
  const value = decodeEntities(m[1]!).trim();
  return value || null;
}

/** An attribute of the first `<tag>` in a block. */
export function tagAttr(block: string, tag: string, attr: string): string | null {
  const m = new RegExp(`<(?:[\\w-]+:)?${tag}\\s[^>]*\\b${attr}\\s*=\\s*"([^"]*)"`, 'i').exec(block);
  return m ? m[1]! : null;
}

/** The inner markup of the first `<tag>…</tag>` in a block. */
export function tagBlock(block: string, tag: string): string | null {
  const m = new RegExp(`<(?:[\\w-]+:)?${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w-]+:)?${tag}\\s*>`, 'i').exec(block);
  return m ? m[1]! : null;
}

export function decodeEntities(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, n: string) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&');
}
