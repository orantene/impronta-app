# Local QA harness — 3 surfaces at once (guest · talent · client)

The conversational-inquiry loop spans three actors on three hosts. The middleware
gates every request against the `agency_domains` table, so a raw `localhost:3000`
or `*.vercel.app` URL renders a 404 "Host not registered". The fix for local dev
is a tiny **host-proxy** that forwards a real, seeded hostname to the dev server.

This harness lets you drive **guest → talent → client** end-to-end on localhost,
QA every change, and only then push to Vercel.

## One-time

```bash
cd web && npm install
# Ensure web/.env.local exists and points at the project Supabase. In a fresh
# git worktree it is NOT copied (gitignored) — copy it from your main checkout:
#   cp <main-checkout>/web/.env.local web/.env.local
```

Localhost dev uses the **prod** Supabase project — seed/cleanup test data carefully.

## Boot (4 terminals)

```bash
# 1 — the dev server (shared by all surfaces)
cd web && PORT=3000 npm run dev

# 2 — GUEST + hub public pages (tulala.digital)
node scripts/local-host-proxy.mjs 3001 tulala.digital

# 3 — TALENT app (app.tulala.digital)
node scripts/local-host-proxy.mjs 3002 app.tulala.digital

# 4 — CLIENT app (app.tulala.digital, separate browser profile)
node scripts/local-host-proxy.mjs 3003 app.tulala.digital
```

The proxy rewrites `Host`/`Origin`/`Referer` (so Server-Action CSRF passes) and
forwards the Turbopack HMR WebSocket (so the page actually hydrates — without it
every button is inert). Source: [`scripts/local-host-proxy.mjs`](../../scripts/local-host-proxy.mjs).

## Sign in (dev only)

`GET /api/dev/signin?email=<e>&password=<p>&next=<path>` — sets the Supabase
cookies and redirects. Dev/preview only ([`route.ts`](../src/app/api/dev/signin/route.ts)).
Credentials live in the secure memory file `reference_qa_credentials.md` — **never
commit passwords**.

| Surface | Open | Sign in as |
|---|---|---|
| **Guest** (incognito) | `http://localhost:3001/t/<TALENT_CODE>` (e.g. `/t/TAL-92026`) | — none — the floating "Message {name}" launcher is the front door |
| **Talent** | `http://localhost:3002/api/dev/signin?email=…&next=/talent/inbox` | the talent who owns the inquiry (e.g. Orlando · `TAL-92026`) |
| **Client** | `http://localhost:3003/api/dev/signin?email=…&next=/` | a seeded client (e.g. `qa-client-1@impronta.test`) |

Use a separate browser profile (or one incognito window per surface) so the
three sessions don't share cookies.

## The smoke loop (run after every change before pushing)

1. **Guest** (`:3001/t/<code>`): open the launcher, send a first message, complete
   the inline name/email gate. **Refresh the page** → reopen the launcher → the
   thread is still there (B1). Send another message.
2. **Talent** (`:3002/talent/inbox`): the inquiry appears; open it, reply on the
   group thread **and** (if you're the coordinator) the client thread → the reply
   posts without "Inquiry not found in this workspace" (B2) and lands back in the
   guest popup on the next poll (~4s).
3. **Client** (`:3003`): after the guest claims an account with the same email,
   the conversation appears in the client inbox; the offer → approve → pay cards
   render and drive the same money rail.

Console + network must be clean on all three. Then run the gate:

```bash
cd web && npx tsc --noEmit && npm run lint
```

## Notes

- The Claude **Preview tool can't hydrate** the client-component chat — QA the
  interactive popup in a real browser via the proxy hosts (Chrome MCP or manual).
- `predev` runs a migration-drift check (`--warn-only`); a warning is fine locally.
- Hosts must exist in `agency_domains`. `tulala.digital` + `app.tulala.digital`
  are seeded. To add a reserved QA host, seed a row rather than editing middleware.
