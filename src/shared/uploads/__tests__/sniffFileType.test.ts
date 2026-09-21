import { describe, it, expect } from 'vitest';
import { sniffReceiptFileType } from '../sniffFileType';

describe('sniffReceiptFileType', () => {
  it('accepts JPEG magic bytes and rejects SVG/HTML payloads', () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    expect(sniffReceiptFileType(jpeg)).toEqual({ mime: 'image/jpeg', ext: '.jpg' });

    const svg = Buffer.from('<svg onload="alert(1)"></svg>', 'utf8');
    expect(sniffReceiptFileType(svg)).toBeNull();

    const html = Buffer.from('<html><body>pwn</body></html>', 'utf8');
    expect(sniffReceiptFileType(html)).toBeNull();
  });

  it('accepts PNG and PDF magic bytes', () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
    expect(sniffReceiptFileType(png)).toEqual({ mime: 'image/png', ext: '.png' });

    const pdf = Buffer.from('%PDF-1.4 rest', 'latin1');
    expect(sniffReceiptFileType(pdf)).toEqual({ mime: 'application/pdf', ext: '.pdf' });
  });
});
