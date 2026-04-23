# Round 0 — Internal browser QA findings

**Tester:** Claude (internal, pre-Round 1 dry run)
**Date:** 2026-04-22
**Target:** app.local (admin) + midnight.local (storefront)
**Lens:** "Does this feel premium, trustworthy, and effortless for real agency admins? Does the storefront feel premium enough for a real agency to proudly use publicly?"

Round 0 caveat: the dev server was unstable during the walkthrough (Supabase auth ECONNRESET + 2–4 min compiles per admin subpage). A full end-to-end task-based walkthrough per `QA_SCRIPT.md` could not be completed in one sitting. Findings below combine what was observed in-browser with targeted code review of the surfaces that failed or stalled. Items that require live interaction (drag-drop, autosave latency, publish diff visuals) are flagged.

---

## 1. Admin UX findings

### A1. Admin landing is translation-ops heavy, not builder-forward
**Observed:** `/admin` renders "Translation health" as the dominant section (7 count-cards: Bios ES, Bios needs attention, Taxonomy, Locations, CMS, UI strings, Profile fields), followed by a "Control center" of 3 operational links (Talent review, Pending media, Clients). `web/src/app/(dashboard)/admin/page.tsx:119-196`.
**Why it hurts:** A first-time agency admin logging in does not associate "set up my site" with "translation gaps in bios." The builder (`/admin/site-settings/structure`) is not surfaced from the landing. There is no "Set up your site" tile, no banner, no call-to-action pointing at the composer.
**Severity:** High (orientation).

### A2. Site-settings sidebar is a flat 12-item list
**Observed:** `web/src/components/admin/site-settings-section-nav.tsx:12-67` lists 12 routes (index, identity, branding, design, navigation, pages, sections, content, seo, structure, system, audit) with no grouping and no visual priority. "Structure" — the composer — is 10th.
**Why it hurts:** The composer is the main thing a new tenant needs. Burying it behind 9 siblings adds cognitive load on every session, not just the first.
**Severity:** High (orientation / daily friction).
**Reference:** this matches Polish Queue item #4 (`QA_POLISH_QUEUE.md`), which is currently held pending QA signal. Round 0 provides that signal.

### A3. Login copy leans technical
**Observed:** `web/src/app/(auth)/login/page.tsx:17-20` — "Google or email — staff roles are never chosen here. With Google, a password is optional (add one under Account after signing in)."
**Why it hurts:** "Staff roles are never chosen here" is defensive wording that implies the reader was going to try something wrong. Unclear to an agency owner who only needs to log in. The parenthetical about Google + optional password is correct but noisy for a login screen.
**Severity:** Medium (first-impression).

### A4. Admin dev-time compile latency observed on most site-settings subpages
**Observed:** dev server logs show `/admin/site-settings/identity` 57s, `/admin/site-settings/system` 2.3min, `/admin/site-settings/seo` 3.3min, `/admin/site-settings/audit` 4.3min, `/admin/site-settings/content` 4.4min on first cold compile. Supabase `fetch failed` ECONNRESET appeared repeatedly during middleware auth during that window.
**Why it hurts:** Dev-time only — won't affect production — but it masks real performance issues: these subpages pull a heavy graph of server reads on every request (`loadAdminOverviewData`, `loadAdminTranslationHealth`, homepage + identity + branding + composition). Worth measuring in prod telemetry before Round 1 starts so latency regressions aren't invisible.
**Severity:** Medium (confidence — not a shippable bug, but it's a real signal).

### A5. Admin landing auth-middleware shows repeated ECONNRESET on Supabase
**Observed:** during the Round 0 pass, 10+ consecutive `[auth/loadAccessProfile.rpc] TypeError: fetch failed | Error: read ECONNRESET` errors fired from the Next middleware.
**Why it hurts:** If this is reproducible in Round 1 (not just my machine), every admin page load stalls at auth. Needs reproduction on a second machine before we conclude it's a broad issue.
**Severity:** Unknown (blocker if reproducible, non-issue otherwise).

---

## 2. Frontend / storefront findings

### F1. Default storefront brand fallback is "Roster" — likely a stale brand name
**Observed:** `web/src/components/home/agency-home-storefront.tsx:58` — `const brandLabel = identity?.public_name?.trim() || "Roster";`. The platform brand is `Rostra` (`web/src/lib/platform/brand.ts:11`), not "Roster." Tenants that haven't set `public_name` in Identity will render "Roster" in the header/footer.
**Why it hurts:** A fresh tenant that skips Identity gets a storefront labeled with a brand name that isn't theirs and isn't even the platform. It reads as broken.
**Severity:** High (trust).
**Fix:** change fallback to `identity?.public_name?.trim() || PLATFORM_BRAND.name` (or better: refuse to render storefront without `public_name` and redirect admin to Identity).

### F2. Auth layout hardcodes "IMPRONTA" wordmark across all hosts
**Observed:** `web/src/app/(auth)/layout.tsx:21` — `<Link href="/" className="...">IMPRONTA</Link>`. This renders on `/login` and `/register` regardless of host. On app.local the document title is "Rostra Workspace" (`web/src/app/page.tsx:91`) while the visible wordmark says "IMPRONTA."
**Why it hurts:** Brand conflict on the very first screen. Either we're Rostra (platform) or we're Impronta (first tenant) — the login screen can't be both.
**Severity:** High (trust / first-impression).
**Fix:** read `PLATFORM_BRAND.name` for app.local; read tenant `public_name` on agency hosts; fall through to platform brand on unknown.

### F3. Login form has a Tailwind typo: `text-smuted-foreground`
**Observed:** `web/src/app/(auth)/login/login-form.tsx:67` — `text-smuted-foreground` (extra `s`). The class doesn't exist, so the "No account? Sign up" helper line renders with default color instead of muted-foreground.
**Why it hurts:** Visible polish miss on the first screen. Cheap to fix.
**Severity:** Low (polish).

### F4. Storefront homepage render path was not interactively walked in Round 0
**Observed:** midnight.local compiled but browser reloads hung during the pass — likely the same ECONNRESET chain as A5. Layout, editorial sections, and the publish-diff preview were not visually confirmed this round.
**Severity:** Unknown — flagged for Round 1 priority coverage.

---

## 3. Critical issues

### C1. `starter-action.ts` had non-async exports — blocked the admin composer entirely (fixed)
**Observed:** `web/src/app/(dashboard)/admin/site-settings/structure/starter-action.ts` was a `"use server"` file but exported a synchronous `listStarterRecipes()` function plus a non-function const `_touchRegistry`. Next.js Server Actions require all exports from a `"use server"` file to be async functions. Dev server produced `Server Actions must be async functions` and the structure page would not render at all — admins saw a permanent "Loading…" state.
**Fix landed:** removed the synchronous `listStarterRecipes` export and the `_touchRegistry` const, and removed the now-unused `SECTION_REGISTRY` import. The file now exports only `applyStarterComposition` (async). Confirmed in the current file (lines 114-280 are the sole export body).
**Why it's critical even post-fix:** `tsc --noEmit` passed despite this — the check that would have caught it is Next.js's own SWC loader at bundle time. Suggested guard: a CI step that runs `next build` (or at minimum a headless visit to 3-4 high-risk admin routes) before merge, so "use server" invariants fail in CI not on a QA admin's screen.
**Severity:** Critical (production-blocking until landed; process gap remains).

### C2. No cold-start verification of the main admin route before Round 1
**Observed:** C1 above only surfaced by clicking the structure page in a browser. Round 1 testers will do the same. We need a smoke test — ideally headless Playwright or a CI curl — that hits `/admin`, `/admin/site-settings/structure`, `/admin/site-settings/sections`, `/admin/site-settings/design` against a fresh tenant and asserts they respond 200 with non-empty HTML.
**Severity:** High (process / repeat-risk).

### C3. Supabase middleware ECONNRESET during Round 0 (severity depends on reproducibility)
**Observed:** See A5. Needs cross-machine reproduction to classify as critical vs environmental.
**Severity:** Unknown — escalate to Critical if Round 1 testers hit it.

---

## 4. Trust issues

### T1. Two-name identity on the login screen (ties to F2)
"Rostra Workspace" in the browser title, "IMPRONTA" as the visible wordmark. Either one alone is fine; together they read as a half-rebranded product. Round 1 testers will notice within 3 seconds of landing.

### T2. `"Roster"` fallback brand (ties to F1)
If any Round 1 tenant hasn't filled Identity before the storefront is shown, the public-facing brand reads "Roster" — not the tenant's name, not the platform. A worse failure mode than a generic placeholder because "Roster" is close-enough-to-look-intentional that a tester may assume it is the product's chosen branding.

### T3. `QA_POLISH_QUEUE.md` #4 (admin shell consolidation) now has evidence
The Round 0 navigation walkthrough hit the friction the polish queue predicted: 12 flat sidebar items, no grouping, the main composer buried at position 10. The queue says "Promote if every tester hesitates in the sidebar on Task 1 or complains about navigation." Round 0 is N=1 and won't promote on its own, but Round 1 Task 1 should be watched specifically for this.

### T4. No visible "where do I start?" on `/admin`
A new admin sees "Translation health" counts and "Control center" links to ops surfaces — nothing that says "Start by setting up your site." Starter composition exists (`starter-action.ts`) but only fires from the Structure page empty state. A fresh tenant has to know to click past translations and into site-settings → structure to discover it.

---

## 5. Polish issues

### P1. Login form typo (see F3)
`text-smuted-foreground` → `text-muted-foreground`. Single character.

### P2. Admin landing header copy
"Control center for inquiries, talent operations, and merchandising" is descriptive but flat. Not a blocker, but a chance to frame the product in the admin's language ("Run your agency" / "Operate inquiries, roster, and your public site"). Held pending Round 1 signal.

### P3. Site-settings subpage first-visit dev-time cost (ties to A4)
Already flagged above; polish-category because end users never see dev-server compiles, but the underlying "each subpage does a lot of server reads on mount" is worth profiling in prod traces.

### P4. Login description — 2 sentences into 1
`page.tsx:17-20` could drop the "staff roles are never chosen here" clause entirely and keep the Google/password hint; the clause is internal-logic leakage.

---

## 6. Recommended next fixes (ordered)

These are small, high-leverage, and safely landable before Round 1 opens. They are ordered by blast-radius-per-hour — the top items are cheap and reduce tester friction the most.

### 6.1 — Fix the "Roster" fallback on agency storefronts (F1 / T2)
Change `web/src/components/home/agency-home-storefront.tsx:58` to use `PLATFORM_BRAND.name` (or gate on `public_name` being set). 5-minute edit + visual check on midnight.local and a fresh tenant. Blocks a trust miss.

### 6.2 — Fix the auth-layout wordmark to be host-aware (F2 / T1)
`web/src/app/(auth)/layout.tsx` should read the current host context and render the platform brand on app.local and the tenant brand on agency hosts. 20–30 min. Resolves brand conflict on the very first screen a tester sees.

### 6.3 — Fix the login-form typo (F3 / P1)
`text-smuted-foreground` → `text-muted-foreground`. 30 seconds.

### 6.4 — Soften login copy (A3 / P4)
Drop the "staff roles are never chosen here" clause. Keep the Google/password hint tightened. 10 min.

### 6.5 — Add a "Set up your site" CTA to the admin landing (A1 / T4)
One banner-style card at the top of `/admin` for tenants whose homepage composition is empty, pointing at `/admin/site-settings/structure`. Use the existing starter recipes to make it tangible ("Pick a starter: Editorial Bridal / Classic / Studio Minimal → we'll set up a working draft"). 1–2 hrs; measurable in Round 1 via task-1 time-to-first-section.

### 6.6 — Add a smoke-test step before Round 1 opens (C1 / C2)
`next build` in CI, plus a headless visit to `/admin`, `/admin/site-settings/structure`, `/admin/site-settings/sections`, `/admin/site-settings/design` with assertion on HTTP 200 + non-empty body. Guarantees the starter-action class of bug can't repeat silently. 1–2 hrs.

### 6.7 — Investigate the Supabase ECONNRESET pattern (A5 / C3)
Reproduce on a second machine. If reproducible, treat as Critical; if only my environment, close with a note. 30 min to reproduce, unbounded to fix.

### Held (ship on Round 1 evidence, not on Round 0 alone)
- Admin shell consolidation / sidebar grouping (Polish Queue #4). Round 0 provides one data point; Round 1 needs to show ≥2 testers hesitating before promoting.
- Content-level field diff in publish pre-flight (Polish Queue #1).
- Real PNG variant thumbnails (Polish Queue #2).
- Shortcut parity (Polish Queue #3).

---

## Round 0 meta — what this pass could not cover

The dev environment's slowness + Supabase resets meant several flows were not interactively executed:

- Section editor → autosave latency and undo/redo behavior under stress.
- Drag-and-drop in the composer — behavior with many sections, touch, screen-reader.
- Publish pre-flight modal — visual diff quality on a realistic draft.
- Revision preview + restore — actual round-trip.
- Editorial profile page (`/t/[profileCode]`) — M8 columns rendering.
- Storefront responsive pass (mobile / tablet / desktop).
- i18n — ES locale across the whole admin + storefront.

These are the first things Round 1 testers should exercise, because Round 0 only surfaced the bugs that block reaching them. Once the environment is stable (or a staging host is used instead of the local dev), re-run the full `QA_SCRIPT.md` walkthrough with one tester before opening Round 1 to externals — Round 0's value was catching C1 before a tester did, and a second internal pass on a stable host would catch the next class of block before Round 1 sees it.
