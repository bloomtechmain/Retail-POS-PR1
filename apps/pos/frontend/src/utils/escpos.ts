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
import { renderTextRaster, gsRasterCommand, isAsciiPrintable } from './escposRaster';

const ESC = 0x1b;
const GS = 0x1d;

export class EscPosBuilder {
  private bytes: number[] = [];
  readonly width: number;
  // Printable roll width in dots, for the raster (Sinhala/non-ASCII) text
  // path below — 203dpi thermal printers print 8 dots/mm; a 58mm roll
  // prints ~48mm wide (384 dots), an 80mm roll ~72mm wide (576 dots), the
  // two paper widths this app supports (see PrinterConfig.paperWidth).
  readonly widthDots: number;
  private boldOn = false;
  private alignMode: 'left' | 'center' | 'right' = 'left';

  constructor(charsPerLine: number) {
    this.width = charsPerLine;
    this.widthDots = charsPerLine <= 32 ? 384 : 576;
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
    this.alignMode = a;
    const n = a === 'left' ? 0 : a === 'center' ? 1 : 2;
    return this.raw([ESC, 0x61, n]);
  }

  bold(on: boolean): this {
    this.boldOn = on;
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

  // Prints `s` via the printer's built-in font (fast path, unchanged
  // behavior) if it's plain ASCII, or as a rendered bitmap if it contains
  // characters that font can't represent — e.g. Sinhala. See
  // escposRaster.ts for why. Only the raster path is actually async.
  async lineAuto(s = ''): Promise<this> {
    if (isAsciiPrintable(s)) return this.line(s);
    const raster = await renderTextRaster(s, { widthDots: this.widthDots, bold: this.boldOn, align: this.alignMode });
    return this.raw(gsRasterCommand(raster));
  }

  // Same idea as twoCol, but for a left label that may be non-ASCII (e.g.
  // a Sinhala product name) — pads exactly as twoCol does, then renders
  // the whole padded line as one bitmap so both columns still land on one
  // printed row. `right` is assumed ASCII (amounts always are — see
  // amount() in receiptTemplates.ts).
  async twoColAuto(left: string, right: string): Promise<this> {
    if (isAsciiPrintable(left)) return this.twoCol(left, right);
    const space = Math.max(1, this.width - right.length);
    const trimmedLeft = left.length > space - 1 ? left.slice(0, Math.max(0, space - 1)) : left;
    const padded = trimmedLeft + ' '.repeat(Math.max(1, space - trimmedLeft.length)) + right;
    return this.lineAuto(padded);
  }

  // Sinhala equivalent of wrapAndPrint — glyphs aren't fixed-width like the
  // printer's ASCII font, so there's no reliable char-count to wrap by.
  // Long text instead shrinks to fit one line (see renderTextRaster).
  async wrapAndPrintAuto(text: string): Promise<this> {
    if (isAsciiPrintable(text)) return this.wrapAndPrint(text);
    return this.lineAuto(text);
  }

  feed(n = 1): this {
    return this.raw(Array(n).fill(0x0a));
  }

  // Blank lines before the cut so the tear-off point clears the printed
  // content — every thermal printer has some physical offset between the
  // print head and the cutter blade, and 3 lines wasn't enough clearance on
  // at least one real printer: the cut landed right at/through the last
  // printed line instead of the blank margin after it, so the bottom of
  // the bill (closing totals/thank-you line) was unreadable or the strip
  // never fully separated from the next receipt. Bumped to 6 for more
  // headroom — cheap paper, not print quality, so the cost is negligible.
  cut(): this {
    this.feed(6);
    // GS V 1 — partial cut, not full cut (GS V 0). Full-cut support is
    // inconsistent across generic/clone ESC/POS thermal printers (common
    // on cheap counter hardware) — some silently no-op it, leaving every
    // receipt still physically attached to the next one until manually
    // torn apart, which tears wherever is convenient rather than at the
    // intended line, exactly matching "can't see the bottom of the bill."
    // Partial cut (leaves a small paper bridge, separates with a light
    // pull) is the far more broadly supported variant.
    return this.raw([GS, 0x56, 0x01]);
  }

  toBytes(): Uint8Array {
    return new Uint8Array(this.bytes);
  }
}
