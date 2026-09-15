/**
 * Browser URL for the channel-worker's WhatsApp Web viewer.
 * WhatsApp blocks iframing web.whatsapp.com. The worker already has that
 * page open (whatsapp-web.js / Puppeteer); the drawer loads this origin.
 * Only loopback worker URLs are used so a Docker hostname never reaches the browser.
 */
export const DEFAULT_WHATSAPP_WEB_ORIGIN = "http://127.0.0.1:8788";

export function loopbackWorkerOrigin(workerUrl?: string | null): string {
  if (!workerUrl) return DEFAULT_WHATSAPP_WEB_ORIGIN;
  try {
    const parsed = new URL(workerUrl);
    if (parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost") {
      return parsed.origin;
    }
  } catch {
    /* keep default */
  }
  return DEFAULT_WHATSAPP_WEB_ORIGIN;
}

export function whatsappWebViewUrl(tenantId: string, workerUrl?: string | null): string {
  const origin = loopbackWorkerOrigin(workerUrl);
  return `${origin}/view?tenant=${encodeURIComponent(tenantId)}`;
}
