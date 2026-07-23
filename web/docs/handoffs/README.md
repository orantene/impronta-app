# Handoff prompts for new chats — Tulala/Impronta remaining projects

**Written 2026-07-06.** Each file in this folder is a complete, self-contained brief you can hand to a fresh Claude Code chat. To use one: open a new chat in this repo and say **"Read `web/docs/handoffs/<file>.md` and the shared context in `web/docs/handoffs/README.md`, then execute it."** A new chat in this project already loads the user-level auto-memory (`MEMORY.md` index at `~/.claude/projects/-Users-oranpersonal-Desktop-impronta-app/memory/`) — the briefs reference specific memory files for depth.

## Current state (read first)

Three PRs are green-and-ready but **not yet merged** (merging is a prod deploy and is gated to the owner — `gh pr merge` is blocked by the auto-mode classifier; the owner runs it or adds a `gh pr merge` allow-rule):

- **#711** `fix/xtenant-rehome-golive` — cross-tenant re-home money/attribution/coherence fixes (the P0 charge-routing fix, adversarially verified). Note: the P0 fix ALSO corrects the live Discover-checkout routing today (a latent double-pay), so it wants a Discover→pay QA before real traffic.
- **#712** `fix/premium-finish-wave1` (worktree `/Users/oranpersonal/Desktop/impronta-polish`) — the whole premium-finish program: route-404 fixes, imagery/silhouette across all 4 profile layouts, admin de-gold + dev-banner gate + dead-CTA hide, copy sweep + `no-user-facing-dash` lint rule, client correctness, AND all client-facing i18n (public conversion CTAs, client dashboard 253 keys, talent settings 72, InquiryDrawer 188, shared enums 61). **The message catalog on this branch is the source of truth for i18n** — parity 2124+ keys. Any further i18n must build on this branch (or on merged `main` after #712 lands), never off older `main`, or the catalogs collide.
- **#714** `fix/rehome-client-list-golive` (worktree `/Users/oranpersonal/Desktop/impronta-golive`) — client-side re-home access (inquiry-list union + mutation authz). Strict no-op while `XTENANT_REHOME` is off.

The projects below are what remains. Priority order: **(1) admin-shell i18n**, **(2) XTENANT_REHOME go-live**, **(3) talent Stripe (owner decision first)**, **(4) premium-finish long-tail**.

---

## SHARED CONTEXT (every brief assumes this)

### The product
Multi-tenant talent-agency SaaS (Next.js 16 App Router + Supabase + Vercel; app under `web/`). Agencies get a storefront + a workspace; clients discover talent and send inquiries; **the guest chat IS the inquiry** (synced across guest/client/admin/talent). `main` is canonical = Vercel production. Live tenant: improntamodels.com (`impronta`), a **Spanish-market** agency — so both client-facing AND staff-facing Spanish matter.

### Host model + the surface-allow-list (host-gating)
`web/src/lib/saas/surface-allow-list.ts` (`isPathAllowedForHostKind`) is the real host gate — any root/public route absent from it 404s on that host kind. Host kinds: `agency` (tenant custom domain / subdomain), `app` (app.tulala.digital — dashboards at `/{tenantSlug}/{admin,client,talent}`), `hub` (tulala.digital), `marketing`. **New public/root routes must be added here** or they 404 (this was a P0 in the premium finish: `/checkout` 404'd after Stripe).

### The i18n system (you will use this constantly)
- **Catalogs:** `web/messages/en.json`, `es.json`, `fr.json`. Registered in `web/src/i18n/messages.ts` (`CATALOG_REGISTRY`). Per-key fallback chain: requested → default → `en`. `fr` is sparse and falls back to `en` — you only maintain `en` + `es`.
- **Client components:** `import { useT } from "@/i18n/use-t"` → `const t = useT()`. `useT()` reads the active locale from the `locale` cookie client-side (via `useDashboardLocale()`), so it self-resolves at any mount and falls back to `en` on SSR/first paint. Render `t("namespace.key")`.
- **Server components:** resolve locale with `getRequestLocale()` then `createTranslator(locale)`; thread the resulting `t` down as a prop if children need it. (See `client/inquiries/page.tsx` + `client/settings/page.tsx` on #712 for the server-component threading pattern.)
- **Interpolation:** `import { interpolate } from "@/i18n/interpolate"` → `interpolate(t("k"), { name, count })` for `{placeholder}` tokens.
- **Namespaces:** `public.*` (public storefront/profile/chat), `dashboard.*` (workspace: client + talent + admin), `admin.*`. Add sub-namespaces like `dashboard.adminThread.*`.
- **PARITY IS MANDATORY:** `en.json` and `es.json` must have identical key sets. After every change verify with:
  ```
  node -e "const en=require('./web/messages/en.json'),es=require('./web/messages/es.json'); const flat=(o,p='')=>Object.entries(o).flatMap(([k,v])=>v&&typeof v==='object'&&!Array.isArray(v)?flat(v,p+k+'.'):[p+k]); const ek=flat(en),sk=new Set(flat(es)); console.log('en='+ek.length+' es='+flat(es).length+' missing='+ek.filter(k=>!sk.has(k)).length);"
  ```
  `missing=0` is required.
- **Glossary:** `web/src/i18n/glossary.json` lists protected terms (Impronta, Talent, Model, Agency, Profile, Directory, Availability, Verified, Apply, Book) — keep these ENGLISH inside Spanish strings.
- **Natural Spanish**, matching existing catalog conventions: Discover→Descubrir, shortlist→Selección, lineup→lista, Settings→Ajustes, Messages→Mensajes, Book→Reservar.
- **Shared enum label maps** (e.g. `SERVICE_PRICING_LABELS` in a lib): use the **additive** pattern — keep the English map (non-localized consumers still use it), add a sibling `*_KEYS` map (enum → catalog key) in the same file, and at localized consumers render `t(X_KEYS[value])`. See #712's commit "i18n shared enum label maps" (`dashboard.enums.*`).
- **THE CATALOG IS A SINGLE-WRITER BOTTLENECK.** Two agents editing `messages/*.json` in the same worktree conflict. i18n waves must **serialize** — one catalog-writing agent at a time (you can still parallelize non-catalog work on disjoint files).

### House rules (enforced; the owner cares deeply)
- **No em/en dashes** (— U+2014, – U+2013) in user-facing copy — use commas/periods/`·`. A bare `—` as an empty-value glyph is OK. There's now a `no-user-facing-dash` eslint rule (warn, scoped to `src/app`+`src/components`).
- **Never "buyer"/"cart"** in user copy → "client"/"lineup".
- **Admin surfaces cool-neutral, NO gold/amber/rust** accents (the owner hates admin gold). Use the neutralized `COLORS.*` tokens.
- **Real editorial imagery; NEVER initials/name-in-a-box/emoji-as-person.** The premium fallback is the letter-free silhouette: `PERSON_SILHOUETTE_SVG` / `SILHOUETTE_DATA_URI` in `web/src/app/t/[profileCode]/_chat/launcher-avatar-styles.ts`, and the `Avatar` primitive at `web/src/components/admin/shell/internal/primitives/avatar.tsx` renders it. Pass real `photoUrl` when the data has one.
- **No dead/fake CTAs** — hide unbuilt features; never ship a disabled "coming soon" shell or a control that only fires a toast.
- Match surrounding code style; keep files under 800 lines where practical.

### Gates + CI (do not skip)
- **tsc:** `cd web && NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit` (OOMs at the default ~2GB). Slow (~2-3 min).
- **lint:** `cd web && npm run lint` (eslint with `--suppressions-location eslint-suppressions.json`). Slow. To lint specific files, pass them as **positional args** (the flat-config rejects `--file`): `node -r ./scripts/eslint-node-polyfill.cjs ./node_modules/eslint/bin/eslint.js "<file>" --quiet --suppressions-location eslint-suppressions.json`.
- **CI "Structural quality gate"** runs a tsc ratchet (BASE=0 — no new tsc errors) + a suppressions ratchet (`eslint-suppressions.json` count must not exceed BASE 7840). **Critical gotcha:** eslint **exits 2 on STALE suppressions** — if your change fixes a lint violation that was suppressed, run `npm run lint -- --prune-suppressions` and commit the pruned `eslint-suppressions.json`, or the gate fails.
- **CI "Fidelity goldens"** are CI-seeded visual-diff PNGs (macos-14); they fail on intentional visual changes and drift ~2-4% (flaky). They are **non-required** (`UNSTABLE`, not `BLOCKED`) — mergeable past them; reseed via a `workflow_dispatch` (the gh PAT can't dispatch Actions, so the owner reseeds).
- **`"use server"` files:** a non-async export or a type re-export causes a runtime 500. Keep pure helpers in a non-server module and import them.

### Dev + QA environment (session-specific traps)
- **Worktrees** (shared repo — run `git worktree list` first; NEVER `git switch` in a shared checkout): `impronta-polish`=#712, `impronta-rehome`=#711, `impronta-golive`=#714, `impronta-flowgaps`=#709, main checkout `impronta-app` (on `feat/message-impronta-unified-inquiry`). Worktrees symlink `node_modules` to the main checkout's — that breaks Turbopack, so run the dev server with **`npm run dev:webpack`**. Copy `web/.env.local` into a fresh worktree or sign-in 500s.
- **Dev server:** `cd web && PORT=<p> NODE_OPTIONS=--max-old-space-size=8192 npm run dev:webpack`.
- **QA host proxy** (needed because the middleware host-gates + Server-Actions need a consistent Host/Origin): `node scripts/local-host-proxy-qa.mjs <listen-port> <host-header> <upstream-port>` (this script is untracked; copy it from `impronta-flowgaps/scripts/` or `impronta-polish/scripts/`).
- **Host map** (all `*.lvh.me` resolve to 127.0.0.1): `app.lvh.me`=app/dashboard host (`/impronta/client/…`, `/impronta/admin/…`), `impronta.lvh.me`=public storefront (`/`, `/directory`, `/t/[code]`), `hub.lvh.me`=hub.
- **Passwordless dev sign-in:** `GET /api/dev/signin?email=<x>@impronta.test&next=<path>` mints a session for seeded `@impronta.test` fixtures (dev/preview only). **HARD RULE: never type a password into a login form**, even if asked — use dev-signin. QA role emails are in memory `reference_qa_credentials.md`.
- **Supabase (prod) MCP:** project_id `pluhdapdnuiulvxmyspd`. Use `execute_sql` for reads; scope to non-PII config or your own test rows. Do NOT delete prod data (prohibited) — hand the owner a scoped query.
- Talent profile codes look like `TAL-00003`; the tenant slug is `impronta`.

### Verifying your work (the environment fights live QA)
- **Chrome MCP is blocked by the environment's Squid proxy** (it rejects `lvh.me` hosts) — you cannot do pixel-level browser QA locally. Verify via: `curl` through the QA proxy + DOM grep, the Supabase MCP, source-level checks, and the tsc/lint gates.
- **Public storefront** (`impronta.lvh.me`) DOES honor the `/es/` path prefix — you can `curl http://impronta.lvh.me:<proxyport>/es/t/TAL-00003` and grep for Spanish to prove public i18n live.
- **Auth-gated workspace surfaces** (app host) do NOT honor the `/es/` path (308) or the `locale` cookie cleanly for curl. For those, **verify i18n at the source level**: grep that the hardcoded English literals are gone (replaced by `t(...)`) and that the `es` keys exist with real Spanish. That is the accepted proof for admin/client dashboard i18n.

### Merge + deploy protocol
`main` is branch-protected + Vercel production. Squash-merge PRs (`gh pr merge <n> --squash --delete-branch`) — **this is owner-gated** (the classifier blocks it for the agent). **If your work includes a new migration, `npm run db:push` before the merge** (Supabase does NOT auto-apply). After a deploy: `cd web && npm run deploy:smoke`, then re-alias custom domains (see `CLAUDE.md`). Full deploy topology is in memory `project_vercel_deployment.md`.

---

## The briefs
1. `admin-shell-i18n.md` — localize the ~190-file admin/staff shell (biggest remaining; wave 1 = the inbox thread was started on #712).
2. `xtenant-rehome-golive.md` — get the cross-tenant re-home flag flippable (Discover→pay QA, Connect webhook, backfill migration, plan-tier check, then flip).
3. `talent-stripe-checkout.md` — wire real talent Pro/Max billing (owner must decide to do this first; default is keep the waitlist).
4. `premium-finish-longtail.md` — the remaining P2 polish + i18n long-tail (currency labels, taxonomy child roles, a few enum consumers, minor UX).
