// Low-level ESC/POS command builder. Thermal receipt printers (the only
// kind this app ever prints to — see printAgent.ts) speak this byte
// protocol natively; sending it as a RAW print job bypasses the Windows
// print driver's own rendering entirely; garbled receipts. See
// PrinterConfig.receiptTemplate/paperWidth for where charsPerLine comes from.
//
// Deliberately ASCII-only. Thermal printers use a single-byte codepage
// (commonly CP437), not UTF-8 — a raw UTF-8 currency symbol like "₹" would
// print as mangled bytes, the exact class of bug this module exists to
// avoid. Callers should pass currency_code ("LKR") rather than
// currency_symbol ("₨") into any amount formatting.
const ESC = 0x1b;
const GS = 0x1d;

export class EscPosBuilder {
  private bytes: number[] = [];
  readonly width: number;

  constructor(charsPerLine: number) {
    this.width = charsPerLine;
    this.raw([ESC, 0x40]); // ESC @ — initialize
  }

  raw(values: number[]): this {
    this.bytes.push(...values);
    return this;
  }

  private encode(s: string): number[] {
    // Strip anything outside printable ASCII rather than let it corrupt
    // the byte stream — a stray non-ASCII character (e.g. a name typed
    // with an accent) shouldn't break every line after it.
    const out: number[] = [];
    for (let i = 0; i < s.length; i++) {
      const code = s.charCodeAt(i);
      out.push(code >= 0x20 && code <= 0x7e ? code : 0x3f); // '?' fallback
    }
    return out;
  }

  text(s: string): this {
    return this.raw(this.encode(s));
  }

  line(s = ''): this {
    this.text(s);
    return this.raw([0x0a]);
  }

  align(a: 'left' | 'center' | 'right'): this {
    const n = a === 'left' ? 0 : a === 'center' ? 1 : 2;
    return this.raw([ESC, 0x61, n]);
  }

  bold(on: boolean): this {
    return this.raw([ESC, 0x45, on ? 1 : 0]);
  }

  // Double height + double width via GS ! n (n=0x11 = both bits set).
  doubleSize(on: boolean): this {
    return this.raw([GS, 0x21, on ? 0x11 : 0x00]);
  }

  hr(char = '-'): this {
    return this.line(char.repeat(this.width));
  }

  // Right-justifies `right` against the line width, left-aligning `left`
  // in the remaining space; truncates `left` if there's no room left.
  twoCol(left: string, right: string): this {
    const space = Math.max(1, this.width - right.length);
    const trimmedLeft = left.length > space - 1 ? left.slice(0, Math.max(0, space - 1)) : left;
    const padded = trimmedLeft + ' '.repeat(Math.max(1, space - trimmedLeft.length)) + right;
    return this.line(padded);
  }

  // Word-wraps `text` to charsPerLine, emitting one printed line per row —
  // used for product names too long to fit a single line.
  wrapAndPrint(text: string): this {
    const words = text.split(/\s+/).filter(Boolean);
    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (candidate.length > this.width) {
        if (current) this.line(current);
        // A single word longer than the line width still has to go
        // somewhere — hard-break it rather than drop it.
        current = word.length > this.width ? word.slice(0, this.width) : word;
        if (word.length > this.width) {
          this.line(current);
          current = word.slice(this.width);
        }
      } else {
        current = candidate;
      }
    }
    if (current) this.line(current);
    return this;
  }

  feed(n = 1): this {
    return this.raw(Array(n).fill(0x0a));
  }

  // A few blank lines before the cut so the tear-off point clears the
  // printed content on printers with a fixed cutting head offset — a
  // standard ESC/POS convention, not specific to any one brand.
  cut(): this {
    this.feed(3);
    return this.raw([GS, 0x56, 0x00]); // GS V 0 — full cut
  }

  toBytes(): Uint8Array {
    return new Uint8Array(this.bytes);
  }
}
