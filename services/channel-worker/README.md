# channel-worker (experimental)

Isolated WhatsApp linked-device worker. Delete this folder with `web/src/lib/channels/REMOVAL.md`. Nothing in `web/` imports these files.

## Start it

The webhook pair is **required**, not optional. Without `APP_WEBHOOK_URL` + `WHATSAPP_WEBHOOK_SECRET` the worker pairs, shows a QR, reports "connected" — and silently drops every message it sees, which is exactly how the drawer ended up empty for a week. The worker now logs a loud error on boot when they are missing; read the log if the inbox stays empty.

```
APP_WEBHOOK_URL=https://app.tulala.digital/api/webhooks/messaging/whatsapp \
WHATSAPP_WEBHOOK_SECRET=<same value as Vercel> \
CHANNEL_WORKER_TOKEN=dev-local-whatsapp \
CHANNEL_SESSION_KEY=<32-byte hex, keep it stable> \
SUPABASE_URL=https://<project>.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<service role key> \
  npm start
```

`WHATSAPP_WEBHOOK_SECRET` must byte-match the Vercel value (Project → Settings → Environment Variables). The app's webhook compares HMAC-SHA256 digests with `timingSafeEqual`, so a mismatch is an indistinguishable `401 not_allowed`. If the variable does not exist on Vercel yet, generate one with `openssl rand -hex 32`, add it to Vercel for Production, redeploy, then use the same value here.

`CHANNEL_SESSION_KEY` must stay the same between restarts or the stored session can't be decrypted and the phone has to scan a new QR. Keep it off Vercel — it is worker-only.

Env:

- `APP_WEBHOOK_URL` + `WHATSAPP_WEBHOOK_SECRET` — **required**; HMAC POST back to the app's webhook
- `CHANNEL_WORKER_TOKEN` — Bearer for `/pair`, `/logout`, `/pairing-code`, `/backfill`
- `CHANNEL_SESSION_KEY` — 32-byte hex, AES-256-GCM for `channel_connections.session_ciphertext`
- `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` — required; the worker reads the outbox and uploads media
- `WWEBJS_MOCK=1` — no Chrome; writes a fake QR and acks outbox rows
- `WWEBJS_CHROME_PATH` — Chromium for real `whatsapp-web.js`

## History import

On `ready` the worker walks the 25 most recently active 1:1 chats and relays up to 50 messages each to the app's webhook (`src/backfill.ts`). Media is downloaded only for the 20 newest messages per chat — every message read is a round trip to the phone, and an unbounded walk of a busy account holds the session for an hour. Groups, `status@broadcast` and channels are skipped.

The app de-dupes on `message_delivery.provider_ref`, so re-running the import is safe:

```
curl -s -X POST http://127.0.0.1:8788/backfill \
  -H "authorization: Bearer $CHANNEL_WORKER_TOKEN" \
  -H 'content-type: application/json' \
  -d '{"tenantId":"<agency-id>"}'
```

Inbound photos and documents under 5 MB are uploaded to the private `inquiry-files` Supabase bucket at `{tenantId}/whatsapp/{hash}.{ext}`; the webhook body carries the storage path, and the admin thread resolves a short-lived signed URL on demand. Anything larger keeps its caption and drops the file.

## The screencast viewer

`http://127.0.0.1:$PORT/view?tenant=<agency-id>` (loopback only) is the worker's own WhatsApp Web Chrome session. It is no longer the drawer's main surface — the drawer reads the database and shows a native chat list. The viewer stays as the "Open full WhatsApp Web" link for what a native list cannot do: groups, calls, sending media. Restart this process after pulling viewer changes; the live site cannot update the worker on your machine.
