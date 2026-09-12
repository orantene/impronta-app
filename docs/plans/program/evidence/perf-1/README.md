# perf-1: why every click waited, what was cut, what it measures now

Branch `work/perf-1` off `program/fidelity` (2026-09-11). The owner's words: the
workspace must feel like software that is quick; today every click waits.

Everything below names which numbers are from the **deployed QA host**
(`staging-qa-journeys.tulala.digital`, serving `dd74cf00f` of
`program/journeys-2026-09`, which predates the bundle-trim commit and
everything here) and which are from a **local production build of this
branch** (`next start` on this laptop, isolated QA database in us-east-2,
about 200 ms per Supabase round trip from here versus 2-5 ms from a Vercel
function in the same region). The host cannot carry this branch (no push), so
the after-numbers are local and the before-numbers are the host's; the
build-independent numbers (Supabase reads per request, server round trips
per click) are given for both and are the honest comparison.

## 1. Where the time went (measured, before any change)

Tooling: `web/src/lib/server/perf-trace.ts`, on with `TULALA_PERF_TRACE=1`,
one stderr line per awaited loader and every outbound fetch attributed to the
loader it ran under (`runs/dev-trace-admin-before.txt`).

| Cause | Measured | File |
|---|---|---|
| The admin layout awaited **22 loaders, ~100 Supabase reads**, before the first byte of EVERY admin route: all inquiries with their threads (16 reads), the website's pages/posts/redirects (11), the media library (10), the calendar (6), the payouts snapshot (4), the team with one Auth-admin read per member, every client, the roster... The catalog, POS, appointments pages read none of them. | dev trace, /admin: 256 fetches per request, layout fan-out 2.2 s (laptop); host warm TTFB 1.8-2.6 s on all six routes | `web/src/app/(workspace)/[tenantSlug]/admin/layout.tsx` |
| The overview snapshot (`/admin/page.tsx`) read `preparation_ticket_revisions` **27 times in series** (one per ticket, current + previous revision), `capacity_remaining_public` **19 times in series** (one RPC per pool), `tenant_integrations` 14 times (the root layout's analytics resolver and the tracking head each asked for the same five keys). | dev trace, span `-` (page): 155 of the 256 | `lib/preparation/tickets.ts`, `lib/pos/classes/day.ts`, `lib/integrations/repository.ts` |
| The proxy paid a **round trip to Supabase Auth (`getUser`) plus the `ensure_profile_for_current_user` RPC on every request**: every page, every RSC navigation, every server action. Three layout loaders then called `getUser()` again each. | `proxy.updateSession` 217-250 ms (laptop), 4 x `/auth/v1/user` per /admin | `lib/supabase/middleware.ts`, `_data-bridge/{notifications,inquiries-messages,inquiry-thread-messages}.ts` |
| A rail click was `router.push`: a server render of a bare `PageRouteSyncer` page through the proxy. The catalog fired **9 Link prefetches** on landing (one server render each). | host: GET `/admin/messages?_rsc` 3.9 s for 8.4 KB; 9 x GET `/admin/catalog?item=...&_rsc` after one click | `admin/shell/internal/state/context.tsx`, `catalog/CatalogList.tsx`, `catalog/catalog-ui.tsx` |
| Functions run in **iad1** (Virginia); the Supabase project `pluhdapdnuiulvxmyspd` is in **us-east-2** (Ohio, Vercel `cle1`). Fluid compute is on (`resourceConfig.fluid: true`); `regions` was unset. | `vercel inspect`: `λ ... [iad1]`; `supabase projects list`: `us-east-2` | `web/vercel.json` |
| The whole website builder rode in the **root layout's client graph**, i.e. every route's first paint: `/offline` (one button) = 5.77 MB of client chunks, 63 section modules; `/admin/catalog` carried the same 74 `site-admin` + 7 `edit-chrome` client modules. Two roads: the `@/lib/site-admin` barrel (re-exports the sections registry with every Editor) imported for one helper; and `EditChromeMount` statically importing the builder adapters. | route manifests of this branch's build | `app/layout.tsx`, `edit-chrome-mount.tsx`, `site-admin/server/*.ts` |
| **All three UI message catalogs (en 967 KB, es 1.05 MB, fr 377 KB) are in ONE client chunk** on every admin route: 1.84 MB raw / 588 KB compressed, because `admin/shell/internal/state/context.tsx` (and 36 other client modules) import `@/i18n/messages`, whose three JSON imports are static. | host chunk `0vgz5itpa5m.m.js`: 2,466 of 2,955 en leaves + 3,424 of 3,634 es leaves + fr present | `web/src/i18n/messages.ts` — **not cut here, see section 5** |
| The host lookup in the proxy (`agency_domains`) was already cached (60 s TTL, hit + miss maps). Language settings and tenant locale: also 60 s caches. Nothing to do. | `proxy.resolveTenantContext 0ms` on warm requests | `lib/saas/host-context.ts` |
| Unbounded parallel `fetch` from one Node process: 60 parallel Supabase reads take **p50 3.6 s / max 7.2 s** (each answers in 0.2 s alone); with ten keep-alive connections p50 0.49 s / max 0.71 s. The stall is the burst of TLS handshakes. The layout used to open ~100 at once. | direct probe from this codebase (section 3) | `web/src/instrumentation.ts` (opt-in cap) |

Not applicable: `export const dynamic`/`revalidate` -- every admin route is
`force-dynamic` by necessity (a signed-in tenant surface reads cookies and
headers); there is no needlessly dynamic route among the six.

## 2. What changed (one commit each, before/after in the message)

| # | Commit | Change | Before -> after |
|---|---|---|---|
| 1 | `perf(trace)` | `timed()` / `perfMark()` / fetch attribution, off unless `TULALA_PERF_TRACE=1`. | tooling |
| 2 | `perf(overview)` | `listBoard`: one `in(ticket_id)` read of revisions. `loadClassesDay`: one `Promise.all` wave of seat RPCs. `getTenantIntegration`: React `cache()` per request. | revisions 27 -> 1; seat RPCs 19 serial -> 19 parallel; integrations 14 -> 6 (dev trace, `runs/dev-trace-admin-after-overview-n+1.txt`) |
| 3 | `perf(proxy)` | `auth.getClaims()` (local ES256 verification against the project JWKS, fetched once per process; `getUser()` fallback) instead of `auth.getUser()`; access profile memoised 60 s per user; the three loaders read the proxy's verified actor. | proxy session step 217-250 ms -> 3-5 ms (laptop); `/auth/v1/user` per /admin 4 -> 0 |
| 4 | `perf(admin)` | `bridge-slices.ts`: the heavy loads are named slices with a page -> slices map. The layout loads the chrome + the URL's page slices in one wave (capabilities folded in); the shell fetches the missing slices in ONE server action after hydration; the PageRouter shows the skeleton until a page's slice arrives; live mode never falls back to mock rows. Rail clicks to bare-syncer segments are `history.pushState` (`spa-segments.ts`, pinned by a static test); `useUrlPageSync` follows Back/Forward. Catalog view changes are `replaceState`; catalog links stop prefetching. | /admin/catalog: layout reads ~100 -> 0 slices (57 fetches per request incl. chrome + page, was 256 on /admin-shaped layouts); rail click server round trips 1 -> 0; catalog landing prefetch renders 9 -> 0; HTML 718 KB -> 430 KB |
| 5 | `perf(root)` | `EditChrome` / `AdminQuickBar` behind `next/dynamic` in their mounts. | superseded by 7 for the editor; the quick bar keeps it |
| 6 | `infra(vercel)` | `"regions": ["cle1"]`. | iad1 -> cle1 (Supabase us-east-2); unmeasurable from here, ~10-15 ms per round trip on the host |
| 7 | `perf(bundle)` | Leaf imports instead of the `@/lib/site-admin` barrel on the root and admin paths (`tagFor`, `resolveDesignTokens`, `DEFAULT_PLATFORM_LOCALE`, `homepageTemplate`); `EditChromeMount` is a headers-only gate that reaches `edit-chrome-mount-storefront.tsx` through a runtime `import()`. | static import graph (`tools/import-graph.mjs`): from `app/layout.tsx` and the admin layout/page/POS/messages routes, `sections/registry.ts`, `builder-node/render.tsx`, `edit-chrome/edit-chrome.tsx` NOT reached (before: all reached). Bundle figure after this commit: **owed to the next build** (this session's one build predates it) |
| 8 | `perf(fetch)` | Opt-in `TULALA_FETCH_CONNECTIONS=<n>` in `instrumentation.ts`: an undici Agent capping connections per origin (undici declared as a dependency at the version already in the lockfile). | 60 parallel reads p50 3.6 s -> 0.49 s (cap 10), see section 3; default off |

## 3. The tables

### Hard loads: deployed host BEFORE (curl, warm = runs 2-3; `runs/host-before-curl.txt`)

TTFB here is curl's first byte (the server's full render; Chrome reports
~90 ms on the host because the response streams the `<head>` first). LCP /
DCL / JS are Chrome's (`runs/host-before-playwright.txt`).

| Route | TTFB warm (s) | HTML (KB) | LCP warm (ms) | DCL warm (ms) | JS decoded (MB) | JS files |
|---|---|---|---|---|---|---|
| /admin | 2.03-2.65 | 740 | 3,720 | 3,714 | 7.36 | 58 |
| /admin/catalog | 1.81-1.84 | 702 | 3,792 | 2,877 | 7.45 | 59 |
| /admin/catalog?create=1 | 1.74-1.78 | 702 | 2,092 | 1,658 | 7.45 | 59 |
| /admin/pos?mode=counter | 1.87-1.90 | 710 | 2,048 | 1,973 | 7.52 | 61 |
| /admin/messages | 1.84-2.37 | 1,033 | 1,996 | 1,789 | 9.92 | 66 |
| /admin/appts | 1.87-2.12 | 705 | 6,020 | 2,177 | 7.41 | 59 |

Cold on the host: /admin TTFB 7.7 s (a cold 32 MB function).

### Hard loads: local production build AFTER (this laptop, cap 20; `runs/local-after-curl6-cap20.txt`, `runs/local-after-playwright-cap20.txt`)

Every Supabase round trip costs ~200 ms from here (measured directly:
0.20-0.23 s per single read). The TTFB column is therefore roughly
`2-4 sequential round trips x 200 ms` and would be `x 5 ms` on the host.

| Route | TTFB warm (s), 6 samples | HTML (KB) | LCP warm (ms) | DCL warm (ms) | JS decoded (MB) | JS files | Supabase reads / request |
|---|---|---|---|---|---|---|---|
| /admin | 0.54-0.62 | 466 | 2,476 | 2,456 | 7.34 | 57 | ~150 (the overview snapshot; was 256) |
| /admin/catalog | 0.51-0.67 | 421 | 2,452 | 665 | 7.44 | 58 | 57 |
| /admin/catalog?create=1 | (same page) | 421 | 2,220 | 666 | 7.44 | 58 | 57 |
| /admin/pos?mode=counter | 0.51-0.70 | 372 | 1,096 | 1,084 | 7.51 | 60 | ~74 |
| /admin/messages | 1.30-1.44 | 1,061 | 1,356 | 1,363 | 9.91 | 65 | ~82 (its own inquiries slice) |
| /admin/appts | 0.62-0.81 | 434 | 7,888 (see note) | 632 | 7.39 | 58 | ~59 |

Notes on the after-table:
- **Unbounded fetch on this laptop is bimodal** (`runs/local-after-curl5-unbounded.txt`): /admin/catalog 0.49 s x3 then 4.6-4.9 s x4, /admin/pos 0.42-0.48 then 4.6/3.8. Cap 10 removes the stalls but queues (0.75-0.9 s, `runs/local-after-curl5-cap10.txt`); cap 20 removes them without queuing (the table above). The cap is opt-in; on Vercel the same burst is same-region and cheaper, and the right number depends on the per-process concurrency: a decision for whoever owns the runtime, with the two files above as the argument.
- LCP is now bound by JS, not the server: DCL is 0.63-0.67 s on catalog/appts while LCP is 2.2-2.5 s, i.e. hydrating 7.4 MB of decoded JS (of which 1.95 MB is the three message catalogs) plus the page's own post-hydration action (`loadWorkspaceMenuForEditor`, 300-800 ms). /admin/appts LCP 7.9 s is the appointments page's own four post-mount actions, untouched here.
- The 4.7 s "TTFB" samples in `runs/local-after-curl-unbounded.txt` are the same connection stall, not the layout: the trace shows batches of trivial reads (`settings?key=eq.public_font_preset`) all taking 3.8-4.6 s together.

### Clicks (server round trips per click)

| Click | Host BEFORE | Local AFTER |
|---|---|---|
| catalog: Create (list -> type chooser) | 433 ms, 0 RSC, 0 actions (served from the prefetch cache) | 99 ms, 0, 0 (`replaceState`, no prefetch needed) |
| catalog: Continue (type chooser -> new item editor) | 29 ms, 0, 0 | 42 ms, 0, 0 |
| rail: Overview -> Catalog | 1 RSC (`/admin/menu`), then 9 prefetch renders + 1 action (`loadWorkspaceMenuForEditor` 464 ms); 4.1 s to settle | 0 RSC, 1 action (the catalog's own load, 311 ms); 864 ms to settle |
| rail: Catalog -> Messages | 1 RSC, **3.9 s** (`/admin/messages?_rsc`, 8.4 KB) | 0 RSC; 57 ms |
| rail: Messages -> Appts | 1 RSC + the page's actions; ~6.3 s | 0 RSC; 37 ms |
| rail: Appts -> Overview | 1 RSC; ~3.3 s | 0 RSC (overview keeps `router.push`: its page loads the snapshot); 29 ms to switch, the snapshot re-render follows |

"browser Back (editor -> list)" in the Playwright output is not a
measurement: Back after two `replaceState`s lands on the hard-load entry and
the settle selector waits on a full reload; ignore that row.

### Bundle (one production build, `runs/bundle-budget-after-build.txt`)

```
Admin workspace (all routes)   8.37 MB  (<= 9.63 MB; 87 routes, 89 chunks)
POS register                   6.66 MB  (<= 9.17 MB; 2 routes, 51 chunks)
```

The build was made after commit 5 and before commit 7, so it measures the
`next/dynamic` boundaries alone (which, in Turbopack's route-level chunk
groups, did not move the union: the storefront editor's chunks were still in
`/admin/catalog`'s 49-chunk group, 6.95 MB). Commit 7 cuts the static graph
instead; its figure comes from the next build (CI's `perf:app-budget`). No
ceiling was raised; both stay under the ratchet.

## 4. Gates (this worktree, real exit codes)

| Gate | Exit |
|---|---|
| `TSC_QUEUE_LOCK=/tmp/tulala-tsc.perf-1.lock TSC_QUEUE_TICKETS=/tmp/tulala-tsc.perf-1.tickets npm run typecheck` | 0 |
| `npm run lint` | 0 |
| `npm run test:design-system` (now includes `spa-segments.static.test.ts`) | 0, 118 pass |
| `npm run test:tenant-isolation` | 0, 619 pass (one red run first: the shell guard forbids the substring `usePathname` in WorkspaceShell.tsx; the hook was renamed `useUrlPageSync`) |
| `npm run test:size-ratchet` | 0, 173 pass (one red run first: two ratcheted files over budget, fixed by extracting `use-url-page-sync.ts`, `state/use-lazy-bridge-slices.ts`, `state/bridge-adapters.ts`; the unchecked-read baseline LOWERED for three fixed reads; no budget raised) |
| `npm run test:money` | 0, 1084 pass |
| `npm run test:phase1-i18n` | 0, 20 pass |
| `node scripts/check-server-actions.mjs` | 0 |
| `npx playwright test e2e/cases/POS-counter-cash-sale.spec.ts --project=chromium --workers=1` (local production build) | 0, 4 passed (`runs/playwright-POS-counter-cash-sale.log`) |
| `npx playwright test pos-customer-display --project=chromium --workers=1` | run 1 and 2: 1 (the spec clicked the cashier chip before React had attached its handler: the button went `[active]`, no menu, `runs/playwright-pos-customer-display-run1-fail.log`); run 3: 0 after the spec waits for the chip to be hydrated, the same wait the counter harness makes before its first tile tap; no assertion changed (`runs/playwright-pos-customer-display-run3-pass.log`) |

## 5. Not done, and the numbers that say what it is worth

1. **The three message catalogs in the client bundle** (1.84 MB raw, 588 KB
   compressed, on every admin route; en alone is 967 KB raw). The cut is a
   per-locale client catalog behind a `next/dynamic` boundary loaded by the
   admin shell for the active locale (+ en as the fallback root), with the
   37 client importers of `@/i18n/messages` moved to a client registry. It
   is the single largest chunk and the reason LCP is JS-bound now; it needs
   a build to verify and touches every surface, so it is the next cut, not
   this one.
2. **The overview snapshot** is still ~100 reads per /admin load (kitchen
   board, host stand, floor, orders, takings, exceptions, classes day).
   Batched where it was serial; the rest is parallel fan-out that a
   single-region function pays 5 ms each for.
3. **`loadWorkspaceOverviewMetrics`** (14 parallel COUNT queries) stays in
   the chrome wave because the identity chip and the rail badges read it on
   first paint; one RPC would make it one read, but that is a migration.
4. **`inquiries[].threadMessages`** (62 KB of the messages page's HTML) is
   read by the inbox's thread view from the list payload; a per-thread load
   would take it out of the list, and out of the lazy slice.
5. The appointments page's four post-mount actions (LCP 7.9 s locally).
6. The regions change and the fetch cap are unmeasured on the host; both
   are one-line reversals.

## 6. Decisions taken

- **D-PERF-1** Rail clicks to bare `PageRouteSyncer` segments do not render
  on the server; `spa-segments.ts` lists them and a static test pins the
  list to the page files. The overview stays a `router.push` because
  `/admin/page.tsx` loads its snapshot.
- **D-PERF-2** The layout loads a page's slices before the first byte and
  the shell asks for the rest after hydration; in live mode a slice that has
  not arrived is an empty list and the page shows its skeleton, never the
  prototype's mock rows and never an empty state that reads as "nothing".
- **D-PERF-3** The proxy verifies the session JWT locally (`getClaims`). A
  session revoked server-side stays valid until the access token expires;
  that is Supabase's documented middleware trade and the money/admin actions
  re-check on the server. The owner of security should know this line is one
  function (`resolveVerifiedUser`) to revert.
- **D-PERF-4** The overview's KPI wave stays on the first byte (rail badges
  and the identity chip would otherwise flicker in on every hard load).
