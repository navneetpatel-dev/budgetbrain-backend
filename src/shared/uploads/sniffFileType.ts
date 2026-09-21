/** Magic-number sniffing for receipt uploads. Never trust client MIME or filename. */

export interface SniffedFileType {
  mime: 'image/jpeg' | 'image/png' | 'application/pdf';
  ext: '.jpg' | '.png' | '.pdf';
}

export function sniffReceiptFileType(buffer: Buffer): SniffedFileType | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mime: 'image/jpeg', ext: '.jpg' };
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { mime: 'image/png', ext: '.png' };
  }
  if (buffer.length >= 5 && buffer.subarray(0, 5).toString('latin1') === '%PDF-') {
    return { mime: 'application/pdf', ext: '.pdf' };
  }
  return null;
}

export function setUploadStaticHeaders(res: { setHeader(name: string, value: string): void }): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition', 'attachment');
}
