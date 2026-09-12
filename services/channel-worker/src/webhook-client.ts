import { createHmac } from "node:crypto";

export async function postWebhook(body: unknown): Promise<boolean> {
  const url = process.env.APP_WEBHOOK_URL;
  const secret = process.env.WHATSAPP_WEBHOOK_SECRET;
  if (!url || !secret) return false;
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
