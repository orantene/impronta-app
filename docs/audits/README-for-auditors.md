# Auditor Guide — Tulala / Impronta App

Read this before reporting any bug. Three of five "critical" bugs in the last audit were false positives catchable in under a minute.

---

## 1. Setup — use seeded test accounts

Passwords live in `~/.claude/projects/-Users-oranpersonal-Desktop-impronta-app/memory/reference_qa_credentials.md`.

| Role | Email | Surface |
|---|---|---|
| Admin | `qa-admin@impronta.test` | `/impronta/admin/*` — workspace ops, talent, payouts |
| Client | `qa-client-1@impronta.test` | `/impronta/client/*` — inquiries, bookings |
| Client (alt) | `qa-client-2@impronta.test` | Multi-party inquiry tests |
| Agency owner | `owner@novacrew.demo` | Nova Crew tenant — agency-specific views |
| Talent | `tulum-talent-sofia@impronta.test` | `/t/sofia-herrera` and talent inbox |

All accounts run against the local Supabase instance (`localhost:54321`). Never use anonymous accounts.

---

## 2. Before reporting "404" or "broken route"

`web/src/middleware.ts` gates every request against `public.agency_domains`. An unregistered host returns 404 before Next.js matches any route. Auth-gated routes redirect unauthenticated users, which can render as a 404-style error page. Neither is a missing route.

1. Open DevTools → **Network** tab. Enable **Preserve log**.
2. Reload the page.
3. Read the **actual HTTP status** on the first request — not what the page rendered.
4. If there's a redirect chain, follow it and report the **final** URL and status.

Distinguish:
- **Auth redirect**: 302/307 → `/login` or `/today` — route exists, user not signed in.
- **Middleware 404**: 404 before any handler fires — host not in `agency_domains`.
- **Runtime error**: 200/500 with error boundary — route exists but threw. Check Console for stack trace.

---

## 3. Before reporting "data not saved"

1. Perform the action, then query the table directly in Supabase Studio (`http://localhost:54323`).
2. **Row IS there, UI doesn't show it**: SELECT or render bug — not a write bug.
3. **Row is NOT there**: write bug or RLS. Check the network response body for a Postgres error vs. a silent empty response.

Report the DB state, not what the UI displayed.

---

## 4. Before reporting "RLS violation"

1. In DevTools → Network, find the failing Supabase request (`/rest/v1/<table>` or `/rpc/<function>`).
2. Copy the exact `message`, `code`, and `hint` from the response body.
3. Note: table name, operation (SELECT/INSERT/UPDATE), user role active.

Do not report "RLS error" without the full error body and table name.

---

## 5. Before reporting "wrong brand string"

The fallback `TENANT` mock resolves to **"Atelier Roma"** when bridge data is missing for the current host. Before filing:

- Are you signed in with a seeded account or anonymous?
- Which surface (admin / talent / client)?
- Does `SELECT * FROM public.agency_domains WHERE hostname = '<your-host>'` return a row?

A missing row is a seed gap, not a code bug.

---

## 6. Report format

```
File: web/src/app/impronta/admin/payouts/page.tsx
Route: GET /impronta/admin/payouts
Actual HTTP status: 500
Console error: "Stripe secret key is not set"
DB state: n/a (render-time error)
I suspect: Stripe env vars missing from local .env.local
```

Required: file path + line number, actual HTTP status, DB state for data bugs, exact error message for RLS/runtime bugs. Speculation prefixed with **"I suspect..."**.
