// Talks to the locally-installed BloomPOS Print Agent (a small Electron tray
// app the customer downloads from Settings) so bills print silently to a
// physical receipt printer instead of opening the browser's print dialog.
// The agent only ever listens on the loopback interface, so this is the one
// place in the online POS that legitimately calls a fixed localhost port.
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
  try {
    const res = await agentFetch('/health');
    return res.ok;
  } catch {
    return false;
  }
}

export async function getAgentPrinters(): Promise<string[]> {
  const res = await agentFetch('/printers');
  if (!res.ok) throw new Error('Could not reach Print Agent');
  const data = await res.json();
  return data.printers || [];
}

export async function getAgentDefaultPrinter(): Promise<string | null> {
  const res = await agentFetch('/config');
  if (!res.ok) throw new Error('Could not reach Print Agent');
  const data = await res.json();
  return data.defaultPrinter || null;
}

export async function setAgentDefaultPrinter(defaultPrinter: string): Promise<void> {
  const res = await agentFetch('/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ defaultPrinter }),
  });
  if (!res.ok) throw new Error('Could not save default printer');
}

export async function sendPrintJob(html: string): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await agentFetch('/print', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ html }),
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
