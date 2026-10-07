# Support Desk — `/admin` → `/desk` redirect (2026-10-04)

Oran bookmarked `https://support.tulala.digital/admin` and hit Tulala “Page not found”. Live Desk is `/desk`.

## Fix

On Support Desk hosts only (`support.tulala.digital`, `desk.tulala.digital`, `support.local`, `desk.local`):

- `GET/HEAD /admin` and `/admin/*` → **308** `/desk` (query string preserved)
- Wired in `proxy.ts` after the Desk dead-flag gate, before the surface 404
- **Does not** touch `app.tulala.digital/admin` (talent/agency admin)

## Auth follow-on

Same PR also fixes Desk login landing / cookie shadowing — see
[`support-desk-auth-fix-2026-10-04.md`](./support-desk-auth-fix-2026-10-04.md).
