import { createHmac } from "node:crypto";

let warned = false;

/**
 * Missing webhook env used to return false in silence, so a paired phone
 * looked healthy while every message it sent was dropped on the floor. Say it
 * once, loudly, instead.
 */
function warnUnconfigured(): void {
  if (warned) return;
  warned = true;
  console.error(
    "[channel-worker] APP_WEBHOOK_URL and WHATSAPP_WEBHOOK_SECRET are unset — " +
      "nothing this worker sees will reach the app. See services/channel-worker/README.md.",
  );
}

export function webhookConfigured(): boolean {
  return Boolean(process.env.APP_WEBHOOK_URL && process.env.WHATSAPP_WEBHOOK_SECRET);
}

export async function postWebhook(body: unknown): Promise<boolean> {
  const url = process.env.APP_WEBHOOK_URL;
  const secret = process.env.WHATSAPP_WEBHOOK_SECRET;
  if (!url || !secret) {
    warnUnconfigured();
    return false;
  }
  const raw = JSON.stringify(body);
  const signature = createHmac("sha256", secret).update(raw).digest("hex");
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-messaging-signature": signature,
      },
      body: raw,
    });
    return res.ok;
  } catch {
    return false;
  }
}
