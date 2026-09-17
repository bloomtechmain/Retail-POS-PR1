// Prints bills silently instead of opening the browser/OS print dialog.
// Two backends, same API surface:
//   - Offline (Electron) POS: printing happens in-process via IPC
//     (window.electronPrintAPI, exposed by apps/pos/electron/preload-main.js)
//     — always available, nothing to install.
//   - Online (browser) POS: talks to the separately-installed BloomPOS Print
//     Agent (a small Electron tray app) over its local HTTP server. The
//     agent only ever listens on the loopback interface, so this is the one
//     place in the online POS that legitimately calls a fixed localhost port.
export interface ReceiptCopyDestination {
  label: string;
  printerName: string;
}

export type PaperWidth = '58mm' | '80mm';
export type ReceiptTemplateName = 'standard' | 'compact' | 'detailed' | 'minimal' | 'formal';
export type ReceiptLanguage = 'en' | 'si';
const RECEIPT_TEMPLATE_NAMES: ReceiptTemplateName[] = ['standard', 'compact', 'detailed', 'minimal', 'formal'];

interface PrinterConfig {
  defaultPrinter: string | null;
  // Kitchen-station id -> printer name, for KOT routing (content-SPLITTING
  // — different items to different stations). Empty on installs that
  // predate Restaurant Mode — always present, never undefined.
  printers: Record<string, string>;
  // Named extra destinations that get the exact SAME bill as the default
  // printer (fan-out — e.g. a kitchen or store copy of the whole receipt).
  // Empty on installs that predate this — always present, never undefined.
  receiptCopies: ReceiptCopyDestination[];
  // Thermal roll width, drives how many characters fit per printed line
  // (see charsPerLine in getReceiptPrintOptions). Installs that predate
  // this backfill to '80mm', the more common counter-printer size.
  paperWidth: PaperWidth;
  // Which ESC/POS layout (receiptTemplates.ts) to print with. Installs
  // that predate this backfill to 'standard'.
  receiptTemplate: ReceiptTemplateName;
  // Which language the printed labels (Subtotal/Total/etc.) use. Item and
  // business text prints in whatever script it's actually written in
  // either way — this only picks the label set. Installs that predate
  // this backfill to 'en'.
  receiptLanguage: ReceiptLanguage;
}

interface ElectronPrintAPI {
  getPrinters: () => Promise<string[]>;
  getConfig: () => Promise<PrinterConfig>;
  saveConfig: (config: PrinterConfig) => Promise<PrinterConfig>;
  print: (bytes: Uint8Array, target?: string) => Promise<{ success: boolean; error?: string }>;
}

declare global {
  interface Window {
    electronPrintAPI?: ElectronPrintAPI;
  }
}

export function isElectronPrint(): boolean {
  return typeof window !== 'undefined' && !!window.electronPrintAPI;
}

const PRINT_AGENT_URL = 'http://127.0.0.1:41205';

// Short timeout so an absent/not-installed agent fails fast (a few hundred
// ms) instead of the UI hanging on a connection that will never resolve.
const REQUEST_TIMEOUT_MS = 1500;

async function agentFetch(path: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(`${PRINT_AGENT_URL}${path}`, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export async function checkPrintAgentStatus(): Promise<boolean> {
  if (isElectronPrint()) return true;
  try {
    const res = await agentFetch('/health');
    return res.ok;
  } catch {
    return false;
  }
}

export async function getAgentPrinters(): Promise<string[]> {
  if (isElectronPrint()) return window.electronPrintAPI!.getPrinters();
  const res = await agentFetch('/printers');
  if (!res.ok) throw new Error('Could not reach Print Agent');
  const data = await res.json();
  return data.printers || [];
}

export async function getAgentDefaultPrinter(): Promise<string | null> {
  if (isElectronPrint()) {
    const config = await window.electronPrintAPI!.getConfig();
    return config.defaultPrinter;
  }
  const res = await agentFetch('/config');
  if (!res.ok) throw new Error('Could not reach Print Agent');
  const data = await res.json();
  return data.defaultPrinter || null;
}

export async function setAgentDefaultPrinter(defaultPrinter: string): Promise<void> {
  const current = await getAgentPrinterConfig();
  await saveAgentPrinterConfig({ ...current, defaultPrinter });
}

export async function getAgentPrinterConfig(): Promise<PrinterConfig> {
  if (isElectronPrint()) return window.electronPrintAPI!.getConfig();
  const res = await agentFetch('/config');
  if (!res.ok) throw new Error('Could not reach Print Agent');
  const data = await res.json();
  return {
    defaultPrinter: data.defaultPrinter || null,
    printers: data.printers || {},
    receiptCopies: data.receiptCopies || [],
    paperWidth: data.paperWidth === '58mm' ? '58mm' : '80mm',
    receiptTemplate: RECEIPT_TEMPLATE_NAMES.includes(data.receiptTemplate) ? data.receiptTemplate : 'standard',
    receiptLanguage: data.receiptLanguage === 'si' ? 'si' : 'en',
  };
}

// An older, already-installed Print Agent build (from before paperWidth/
// receiptTemplate/receiptLanguage existed) will still accept this POST and
// return 200 — it just silently ignores the fields its own schema predates,
// so the saved value quietly reverts to a default on the very next config
// read. That looked like "the UI doesn't actually change what prints" (a
// real bug report, twice) when the real cause was a stale agent build, not
// application logic. Catch it here instead of downstream: read back what
// the agent actually echoed and fail loudly if it dropped something we
// just asked it to persist, rather than let the caller believe it worked.
async function saveAgentPrinterConfig(config: PrinterConfig): Promise<void> {
  if (isElectronPrint()) {
    await window.electronPrintAPI!.saveConfig(config);
    return;
  }
  const res = await agentFetch('/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  if (!res.ok) throw new Error('Could not save printer configuration');
  const saved = await res.json().catch(() => null);
  if (
    saved &&
    (saved.paperWidth !== config.paperWidth ||
      saved.receiptTemplate !== config.receiptTemplate ||
      saved.receiptLanguage !== config.receiptLanguage)
  ) {
    throw new Error('Your Print Agent is out of date and doesn\'t support bill formatting yet — please update/reinstall it, then try again.');
  }
}

// Assigns (or clears, with an empty printerName) the printer a given
// kitchen station's KOT tickets print to on this device.
export async function setStationPrinter(stationId: number, printerName: string): Promise<void> {
  const current = await getAgentPrinterConfig();
  const printers = { ...current.printers };
  if (printerName) printers[String(stationId)] = printerName;
  else delete printers[String(stationId)];
  await saveAgentPrinterConfig({ ...current, printers });
}

// Replaces the whole "extra copy" destination list — e.g. after adding or
// removing a kitchen/store copy in Settings.
export async function setReceiptCopies(receiptCopies: ReceiptCopyDestination[]): Promise<void> {
  const current = await getAgentPrinterConfig();
  await saveAgentPrinterConfig({ ...current, receiptCopies });
}

export async function setPaperWidth(paperWidth: PaperWidth): Promise<void> {
  const current = await getAgentPrinterConfig();
  await saveAgentPrinterConfig({ ...current, paperWidth });
}

export async function setReceiptTemplate(receiptTemplate: ReceiptTemplateName): Promise<void> {
  const current = await getAgentPrinterConfig();
  await saveAgentPrinterConfig({ ...current, receiptTemplate });
}

export async function setReceiptLanguage(receiptLanguage: ReceiptLanguage): Promise<void> {
  const current = await getAgentPrinterConfig();
  await saveAgentPrinterConfig({ ...current, receiptLanguage });
}

// Thermal printers print a fixed number of characters per line depending on
// roll width — 32 for 58mm, 42 for 80mm at the printer's default font (Font
// A, the near-universal default on 80mm thermal receipt printers). 48 was
// tried first but is Font B's count, not Font A's — it overruns the real
// printable width by a handful of dots, clipping the last 1-2 characters of
// every right-aligned amount off the edge of the paper (confirmed against a
// real printed receipt, not just spec sheets).
// Every ESC/POS template call site needs both this and which template is
// selected, so callers fetch config once up front via this helper rather
// than each reaching into getAgentPrinterConfig() separately.
export async function getReceiptPrintOptions(): Promise<{ charsPerLine: number; template: ReceiptTemplateName; language: ReceiptLanguage }> {
  const config = await getAgentPrinterConfig();
  return {
    charsPerLine: config.paperWidth === '58mm' ? 32 : 42,
    template: config.receiptTemplate,
    language: config.receiptLanguage,
  };
}

// `target` is a kitchen-station id — omitted, prints to the one receipt
// printer exactly as before; passed, routes to that station's configured
// printer (falling back to the receipt printer if the station has none set).
// `bytes` is a raw ESC/POS command buffer (see escpos.ts/receiptTemplates.ts)
// — sent as a RAW print job so the printer's own firmware renders it
// directly, bypassing the Windows driver's (often broken, for thermal
// printers) HTML/GDI rendering entirely.
export async function sendPrintJob(bytes: Uint8Array, target?: number): Promise<{ success: boolean; error?: string }> {
  const targetKey = target != null ? String(target) : undefined;
  if (isElectronPrint()) {
    return window.electronPrintAPI!.print(bytes, targetKey);
  }
  try {
    // JSON can't carry raw binary — base64-encode for the HTTP hop to the
    // Print Agent; the Electron IPC branch above sends the Uint8Array
    // directly (structured clone handles typed arrays natively).
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    const dataBase64 = btoa(binary);
    const res = await agentFetch('/print', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dataBase64, target: targetKey }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { success: false, error: data.error || 'Print failed' };
    return { success: true };
  } catch {
    return { success: false, error: 'Print Agent is not running' };
  }
}
