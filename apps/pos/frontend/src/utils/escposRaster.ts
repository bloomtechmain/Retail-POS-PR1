// Renders text the printer's built-in single-byte font can't represent
// (Sinhala, or any other non-ASCII script) as a monochrome raster image and
// emits it as a GS v 0 bit-image command — the escape hatch ESC/POS
// printers offer for glyphs outside their firmware's codepage. Plain ASCII
// keeps using the printer's own font (escpos.ts) — this only kicks in for
// lines that actually need it, so most of a receipt still prints at full
// text-mode speed.
//
// "Noto Sans Sinhala" is loaded app-wide in index.html for on-screen
// Sinhala text; reused here so the printed glyphs match what's on screen.
const SINHALA_FONT = '"Noto Sans Sinhala", sans-serif';

export function isAsciiPrintable(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (code < 0x20 || code > 0x7e) return false;
  }
  return true;
}

// Loaded once and reused — `document.fonts.load` resolves near-instantly
// once the font is cached, but every receipt line awaiting a fresh load
// call would still cost a microtask each time; this dedupes to one.
let fontReady: Promise<void> | null = null;
function ensureFontLoaded(pxSize: number): Promise<void> {
  if (!fontReady) {
    fontReady = document.fonts
      .load(`400 ${pxSize}px ${SINHALA_FONT}`)
      .then(() => undefined)
      .catch(() => undefined);
  }
  return fontReady;
}

export interface RasterLine {
  widthDots: number;
  heightDots: number;
  // Packed 1bpp rows, MSB first, row length = ceil(widthDots / 8) bytes.
  bytes: Uint8Array;
}

// Renders one line of text into a 1-bit raster sized to `widthDots` (the
// printable roll width), justified within it per `align` — baked into the
// bitmap itself rather than left to the printer's ESC a command, which not
// every firmware applies to bit images.
export async function renderTextRaster(
  text: string,
  opts: { widthDots: number; bold?: boolean; align?: 'left' | 'center' | 'right'; fontPx?: number }
): Promise<RasterLine> {
  const fontPx = opts.fontPx ?? 26;
  await ensureFontLoaded(fontPx);

  const widthDots = opts.widthDots;
  const heightDots = Math.ceil(fontPx * 1.5);
  const canvas = document.createElement('canvas');
  canvas.width = widthDots;
  canvas.height = heightDots;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return { widthDots, heightDots, bytes: new Uint8Array(Math.ceil(widthDots / 8) * heightDots) };

  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, widthDots, heightDots);
  ctx.fillStyle = '#000';
  ctx.textBaseline = 'middle';

  let px = fontPx;
  const weight = opts.bold ? '700' : '400';
  ctx.font = `${weight} ${px}px ${SINHALA_FONT}`;
  // Shrink-to-fit rather than clip — a long product name in Sinhala can
  // measure wider than the roll; there's no ASCII-style char budget to
  // wrap by since Sinhala glyphs aren't fixed-width.
  while (ctx.measureText(text).width > widthDots && px > 10) {
    px -= 1;
    ctx.font = `${weight} ${px}px ${SINHALA_FONT}`;
  }

  const align = opts.align ?? 'left';
  const finalWidth = ctx.measureText(text).width;
  const x = align === 'center' ? (widthDots - finalWidth) / 2 : align === 'right' ? widthDots - finalWidth : 0;
  ctx.fillText(text, Math.max(0, x), heightDots / 2);

  const { data } = ctx.getImageData(0, 0, widthDots, heightDots);
  const rowBytes = Math.ceil(widthDots / 8);
  const bytes = new Uint8Array(rowBytes * heightDots);
  const THRESHOLD = 200; // luminance below this counts as a printed (black) dot
  for (let y = 0; y < heightDots; y++) {
    for (let px2 = 0; px2 < widthDots; px2++) {
      const i = (y * widthDots + px2) * 4;
      const alpha = data[i + 3];
      const luminance = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      if (alpha > 0 && luminance < THRESHOLD) {
        bytes[y * rowBytes + (px2 >> 3)] |= 0x80 >> (px2 & 7);
      }
    }
  }

  return { widthDots, heightDots, bytes };
}

// GS v 0 — print raster bit image, mode 0 (normal density). xL/xH = bytes
// per row, yL/yH = row count; both little-endian 16-bit per the ESC/POS
// raster image spec.
export function gsRasterCommand(line: RasterLine): number[] {
  const rowBytes = Math.ceil(line.widthDots / 8);
  const xL = rowBytes & 0xff;
  const xH = (rowBytes >> 8) & 0xff;
  const yL = line.heightDots & 0xff;
  const yH = (line.heightDots >> 8) & 0xff;
  return [0x1d, 0x76, 0x30, 0x00, xL, xH, yL, yH, ...line.bytes];
}
