// Prints bills silently instead of opening the browser/OS print dialog.
// Two backends, same API surface:
//   - Offline (Electron) POS: printing happens in-process via IPC
//     (window.electronPrintAPI, exposed by apps/pos/electron/preload-main.js)
//     — always available, nothing to install.
//   - Online (browser) POS: talks to the separately-installed BloomPOS Print
//     Agent (a small Electron tray app) over its local HTTP server. The
//     agent only ever listens on the loopback interface, so this is the one
//     place in the online POS that legitimately calls a fixed localhost port.
interface PrinterConfig {
  defaultPrinter: string | null;
  // Kitchen-station id -> printer name, for KOT routing. Empty on installs
  // that predate Restaurant Mode — always present, never undefined.
  printers: Record<string, string>;
}

interface ElectronPrintAPI {
  getPrinters: () => Promise<string[]>;
  getConfig: () => Promise<PrinterConfig>;
  saveConfig: (config: PrinterConfig) => Promise<PrinterConfig>;
  print: (html: string, target?: string) => Promise<{ success: boolean; error?: string }>;
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
  await saveAgentPrinterConfig({ defaultPrinter, printers: current.printers });
}

export async function getAgentPrinterConfig(): Promise<PrinterConfig> {
  if (isElectronPrint()) return window.electronPrintAPI!.getConfig();
  const res = await agentFetch('/config');
  if (!res.ok) throw new Error('Could not reach Print Agent');
  const data = await res.json();
  return { defaultPrinter: data.defaultPrinter || null, printers: data.printers || {} };
}

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
}

// Assigns (or clears, with an empty printerName) the printer a given
// kitchen station's KOT tickets print to on this device.
export async function setStationPrinter(stationId: number, printerName: string): Promise<void> {
  const current = await getAgentPrinterConfig();
  const printers = { ...current.printers };
  if (printerName) printers[String(stationId)] = printerName;
  else delete printers[String(stationId)];
  await saveAgentPrinterConfig({ defaultPrinter: current.defaultPrinter, printers });
}

// `target` is a kitchen-station id — omitted, prints to the one receipt
// printer exactly as before; passed, routes to that station's configured
// printer (falling back to the receipt printer if the station has none set).
export async function sendPrintJob(html: string, target?: number): Promise<{ success: boolean; error?: string }> {
  const targetKey = target != null ? String(target) : undefined;
  if (isElectronPrint()) {
    return window.electronPrintAPI!.print(html, targetKey);
  }
  try {
    const res = await agentFetch('/print', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ html, target: targetKey }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { success: false, error: data.error || 'Print failed' };
    return { success: true };
  } catch {
    return { success: false, error: 'Print Agent is not running' };
  }
}

// Builds a fully self-contained HTML document from an on-screen element,
// inlining every stylesheet currently loaded on the page (Tailwind's
// compiled CSS included) — the agent renders this in an isolated window
// with no access to the app's own stylesheets, so the styling has to travel
// with the markup.
export async function buildPrintableDocument(elementId: string): Promise<string> {
  const el = document.getElementById(elementId);
  if (!el) throw new Error(`Element #${elementId} not found`);

  const cssParts: string[] = [];
  for (const node of Array.from(document.querySelectorAll('style'))) {
    cssParts.push(node.textContent || '');
  }
  for (const link of Array.from(document.querySelectorAll('link[rel="stylesheet"]')) as HTMLLinkElement[]) {
    try {
      const res = await fetch(link.href);
      if (res.ok) cssParts.push(await res.text());
    } catch {
      // Best-effort — a missing stylesheet just means slightly plainer output.
    }
  }

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>${cssParts.join('\n')}</style>
</head>
<body>${el.outerHTML}</body>
</html>`;
}

// KOT tickets are built from API response data (a held order's items,
// possibly split across several stations), not a single on-screen element —
// so unlike buildPrintableDocument this is a plain string builder, not a
// DOM read.
export function buildKotDocument(params: {
  saleNumber: string;
  stationName: string;
  orderType: string;
  tableName?: string;
  items: Array<{ product_name: string; quantity: number }>;
}): string {
  const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] || c));
  const rows = params.items
    .map((i) => `<div class="row"><span class="qty">${i.quantity}×</span><span class="name">${esc(i.product_name)}</span></div>`)
    .join('');

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  body { font-family: monospace; font-size: 14px; width: 280px; margin: 0; padding: 8px; }
  h1 { font-size: 16px; text-align: center; margin: 0 0 4px; }
  .meta { text-align: center; font-size: 12px; margin-bottom: 8px; border-bottom: 1px dashed #000; padding-bottom: 6px; }
  .row { display: flex; gap: 6px; padding: 3px 0; font-size: 15px; font-weight: bold; }
  .qty { flex-shrink: 0; }
</style>
</head>
<body>
<h1>KOT — ${esc(params.stationName)}</h1>
<div class="meta">
  ${esc(params.orderType)}${params.tableName ? ` · ${esc(params.tableName)}` : ''}<br/>
  #${esc(params.saleNumber)} · ${new Date().toLocaleTimeString()}
</div>
${rows}
</body>
</html>`;
}
