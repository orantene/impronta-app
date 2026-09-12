# channel-worker (experimental)

Isolated WhatsApp linked-device worker. Delete this folder with `web/src/lib/channels/REMOVAL.md`. Nothing in `web/` imports these files.

```
WWEBJS_MOCK=1 CHANNEL_WORKER_TOKEN=dev CHANNEL_SESSION_KEY=$(openssl rand -hex 32) \
  SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… \
  WHATSAPP_WEBHOOK_SECRET=… APP_WEBHOOK_URL=http://127.0.0.1:3000/api/webhooks/messaging/whatsapp \
  npm start
```

Env (worker-only; do not put `CHANNEL_SESSION_KEY` on Vercel):

- `CHANNEL_WORKER_TOKEN` — Bearer for `/pair`, `/logout`, `/pairing-code`
- `CHANNEL_SESSION_KEY` — 32-byte hex, AES-256-GCM for `channel_connections.session_ciphertext`
- `WWEBJS_MOCK=1` — no Chrome; writes a fake QR and acks outbox rows
- `WWEBJS_CHROME_PATH` — Chromium for real `whatsapp-web.js`
- `APP_WEBHOOK_URL` + `WHATSAPP_WEBHOOK_SECRET` — HMAC POST back to the existing webhook

After a phone scans the linked-device QR, open `http://127.0.0.1:$PORT/view?tenant=<agency-id>` (loopback only). That page is the worker's WhatsApp Web Chrome session, not the Cloud API and not the Messages inbox. The admin drawer iframes this URL, or opens it in a window when the live site blocks the embed.
