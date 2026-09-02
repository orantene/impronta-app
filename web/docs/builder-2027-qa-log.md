# Builder 2027 — QA log

Running log for the Builder 2027 program. Opened Phase 0, 2026-09-01, on `main` @ `8d5e46a9d`.
Plan: `~/.cursor/plans/builder_2027_full_exec_b9b689af.plan.md`. Gate: [`builder-2027-ship-gate.md`](./builder-2027-ship-gate.md).

**Rule for this file:** a row is only written from something observed — a command with its exit code, or a click. Nothing is marked verified because a test passed. Six features in this codebase have shipped dead with green suites.

---

## Phase 0 — baseline inventory (measured 2026-09-01)

| Metric | Value | Source |
|---|---|---|
| `BuilderNode` kinds | 32 | `builder-node/types.ts` kind union |
| Legacy section types | 56 (+ `shared/`, 57 dirs) | `sections/*/`, `FROZEN_SECTION_KEYS` = 57 tokens incl. `shared` |
| Add Gallery items | 99 = 57 `el()` + 2 roadmap + 23 `section()` + 12 `connected()` + 5 backgrounds | `add-gallery/registry-catalog-*.ts` |
| Roadmap entries | 6: `el-list`, `el-whatsapp`, `sec-hero-video`, `conn-talent-card`, `conn-dynamic-text`, `conn-repeater` | `registry-roadmap.ts` |
| `SECTION_REGISTRY` consumers outside `sections/` (non-test) | 11 | git grep |
| `qa:*` scripts / in CI | 31 / 0 → **31 / n-a, integrity guard now in CI** | `package.json`, `ci.yml` |
| Platform slot rows | 85 across 9 tenants (3 cancelled) | Supabase |
| Non-freeform pages on **active** tenants | 14 | Supabase |
| Active tenants | 8 | Supabase |
| Impronta pages containing `section_embed` | 15 | Supabase |
| `talent_sites` | 5, **0 published**, all `compositionMode: template` on `tulala-digital` | Supabase |

### Anchor-blocking kinds — all absent, confirmed 2026-09-01

`marquee` · `directory` · `featured_talent` · `location_map` · `sticky_scroll` · `reveal` · `stats` · `before_after` · `reviews` · `logo_cloud` · `timeline` · `comparison_table` · `video_reel` · `repeater` · `dynamic_text` · `talent_card` · `header_search` · `header_account` · `header_inquiry` · `header_language`

Present and reusable: `hero_search`, `talent_type_grid`, `menu_board`, `form`, `code`, `masonry`, `carousel`, `accordion`, `tabs`, `split`, `pricing_table`, `video`, `social_*`.

### Baseline gate on `main` @ `8d5e46a9d`

Recorded below when the run completes. Any lane failing here is **inherited**, not caused by this program, and is logged as such.

| Lane | Exit | Note |
|---|---|---|
| `typecheck` | 0 | |
| `lint` | 0 | |
| `verify:server-actions` | 0 | |
| `test:builder` | 0 | |
| `test:builder-chrome` | 0 | |
| `test:builder-capabilities` | 0 | |
| `test:publish-preflight` | 0 | |
| `verify:builder-ownership` | **2** | Chains `verify:published-page-snapshots:strict`, which is red on **production data** — see F10. Its three sub-lanes (`test:builder-node-bindings`, `test:builder-chrome`, `test:publish-preflight`) all pass. |
| `test:size-ratchet` | 0 | |
| `check:builder-test-lane-coverage` | 0 | |

Two process notes from this run, both worth carrying into every later phase:

1. **A fresh worktree needs `.env.local` symlinked, not just `node_modules`.** Without it this lane exits **9** (`node: .env.local: not found`) — an environmental failure that looks identical to a code failure. Symlink both when creating a phase worktree.
2. **The harness reported "completed (exit code 0)" for a run whose 8th lane exited 2.** The wrapper's exit is not the lane's exit. Read the per-lane codes, never the notification. This is the second time today the same trap has appeared.

---

## Findings

Severity: **P0** blocks the program or a live surface · **P1** must fix before ship · **P2** worth doing, not blocking.

| # | Sev | Surface | Finding | Evidence | Status |
|---|---|---|---|---|---|
| F1 | P0 | Repo contract | `AGENTS.md` rule 1 named `stable-work` as trunk; `origin/stable-work` does not exist and `OPERATING.md` §1 marks it historical. It had already misled the first draft of this plan into targeting a dead branch. | `git ls-remote --heads origin stable-work` → 0 rows | **fixed** Phase 0 |
| F2 | P0 | CI | `qa:builder-2027-ship` cannot run in Actions (needs dev server + live creds) and `check:ci-lane-parity` cannot see `qa:*` scripts, so the program's gate would have rotted unobserved. | parity matcher is `(?:test\|check\|verify\|eval):*` | **fixed** Phase 0 — `check:builder-2027-gate` in CI, mutation-verified |
| F3 | P1 | Shell | A **fifth** header widget type, `header_favorites`, exists in `sections/` but is not in Impronta's shell, so bridge-elimination would silently strand it. | `sections/header_favorites/` present; Impronta `__site_shell__` embeds only search/account/inquiry/language | open — decide in 2A (build) or 2B (hide) |
| F4 | P1 | Impronta | Two live public pages are still slot-composed and were missing from the original bridge inventory. | `/faces-of-fall-26` and `/our-fashion-models` both 200; `is_freeform=false`, `directory` slot | open — Phase 8B-5b |
| F5 | P1 | Data hygiene | 19 orphan `cms_page_sections` rows attached to Impronta pages that are already freeform (`about`, `contact`, `faq`, `studio`). Harmless today; the FK cascade decides for us if they survive to the table drop. | Supabase | open — Phase 8B-9 |
| F6 | P0 | WS7 | `__directory__` renders through the slot path for every tenant and degrades to a built-in page when missing, so dropping `cms_page_sections` silently degrades every tenant's directory. | `(public)/directory/page.tsx` → `loadPageForRender("__directory__")` → `HomepageCmsSections` | open — Phase 8-1b |
| F7 | P0 | WS7 | `ai-generate-action.ts` and `ai-translate-site-action.ts` both key on `SECTION_REGISTRY`; deleting `sections/` breaks both. Absent from the original plan. | git grep | open — Phase 8-0 |
| F13 | P1 | Accessibility / shell | **The live site ships no `<header>`, no `<footer>`, and zero ARIA landmark roles.** Measured on production: `<main>` 1, `<nav>` 1, `<header>` 0, `<footer>` 0, `role=banner` 0, `role=contentinfo` 0. Header and footer render as `<nav>` and divs, so a screen-reader user gets no banner or contentinfo landmark and cannot skip to either. `test:a11y` passes 29 tests while this ships — that lane validates heading hierarchy only, and its sole "banner" match is `cta_banner`, a section type key, not the role. **Fold into Phase 8B:** the shell landmark swap rewrites exactly this markup, so emitting semantic elements there is nearly free; deferring means opening the shell twice. | live `curl` + element count, 2026-09-02 | **code fixed** 8B-1, `feat/builder-2027-p8b-shell` — NOT deployed, so production still ships zero landmarks until this branch reaches `production` |
| F12 | **P0** | Perf budget | Scoped renderer CSS reached **100.4 KB against a 103 KB ceiling** after Phase 2A — the light end of the range (83.8–86.7) was what the lane reported. Resolved by the CSS-scoping work: worst design now 77.8 KB, ceiling lowered to 90 KB, and a page-shaped budget added because a real page ships **three** sheets, not one. | `perf:builder-budget`, 2026-09-01 | **closed** by PR #1483 + #1492 |
| F11 | P1 | Shell / 8B priority | **The shell contributes 4 `section_embed` nodes and ~234 builder nodes to EVERY page**, not just pages whose bodies embed. Live counts: home 7 = 4 shell + 3 body; division pages 5 = 4 shell + 1 `directory`; slot pages 4 = shell only. The DB tree analysis undercounted this because the shell lives in `__site_shell__`, not each page's `blocks`. **8B-6 (shell swap) is therefore the highest-leverage step in the phase and runs FIRST.** | live `curl` across 7 URLs, 2026-09-01 | open — 8B |
| F10 | **P0** | Publish integrity | `verify:published-page-snapshots:strict` is **red against production data** and has been failing unobserved: it needs `.env.local`, so CI cannot run it and nobody local was running it either. Same class as F2 — a gate that exists and gates nothing. It reports, for Impronta: `missingBuilderTree` on exactly `faces-of-fall-26` and `our-fashion-models`, plus `missing` `published_page_snapshot` on `fashion-models`, `hosts-promoters` and their ES variants; two other tenants are missing snapshots for `__book__` / `404`. **This independently confirms F4** — the repo's own gate already knew about the two pages the plan's first draft missed. Pre-existing and inherited: it is a production-data condition, unaffected by any Phase 0 change. | `npm run verify:builder-ownership` → exit 2; log `/tmp/p0-vbo2.log` | open — resolved by 8B-5b (the two pages) + a publish pass for the rest; re-run as the 8B exit check |
| F14 | **P0** | Phase 8B sequencing / deploy | **The prerequisite Phase 8B's entire safety model rests on is NOT on production, so steps 8B-2 (seed inline `sectionProps`), 8B-3 (data side) and 8B-6 (delete the anchor rows) cannot be done yet.** `resolveShellLandmarkSectionProps` — node-first precedence, PR #1493 `ad99a83b4` — is on `main` but is not an ancestor of `origin/production`. Production is `f956a33bf`, confirmed two independent ways: `git merge-base --is-ancestor` says no, and the sentry release embedded in the live HTML is exactly `f956a33bf482c208218f9144bb3d49ae96b982ef`. Production's `PublishedShell.tsx:281` still reads `prefixPublicHrefsDeep(slot.props, …)` and `shell-render-plan.ts` on that ref contains **zero** occurrences of `resolveShellLandmarkSectionProps`. **Why this is P0 and not a scheduling note:** the plan's step 2 says to seed inline props and then verify the live site is byte-identical. Against this deploy that check passes VACUOUSLY — the page is unchanged because the seed is being ignored, not because it is correct. Deleting the anchor rows on the strength of that check is precisely the "a mistake blanks a real agency's website header" scenario. Same class as F2 and F10: a verification step that runs, reports success, and measures nothing. **Unblock:** land #1493 on `production` (merge `main` → green CI → pointer FF), re-confirm the sentry release on the live page, and only then seed. | `git merge-base --is-ancestor ad99a83b4 origin/production` → 1; live HTML sentry release; `git show origin/production:…/shell-render-plan.ts \| grep -c resolveShellLandmarkSectionProps` → 0. 2026-09-02 | open — BLOCKS 8B-2 / 8B-3-data / 8B-6 |
| F15 | P1 | Test lanes | **The Impronta shell seed tests have never run in any lane.** `test:impronta-pages` globbed `scripts/impronta-rebuild/*.test.ts` and `scripts/impronta-rebuild/pages/*.test.ts` but not `scripts/impronta-rebuild/shell/*.test.ts`, and no other script referenced that directory (`grep` over every `package.json` script → 0 hits). So `shell/header.test.ts`, `shell/footer.test.ts` and `shell/seed-shell.test.ts` were dead — including the pre-existing pins on header widget order and the mobile-hidden set. Caught only because a deliberate mutation during 8B-3 came back GREEN. Wiring the glob in took the lane from **151 to 199 tests** and immediately failed a real assertion that pinned `section_embed` as the only mobile-hideable kind. `check:builder-test-lane-coverage` did not catch it — it reports on `src/` builder files, not `scripts/`. | `package.json` lane list; 151 → 199 tests, 2026-09-02 | **fixed** 8B-3 — consider extending `check:builder-test-lane-coverage` to `scripts/` |
| F9 | P1 | Gallery governance | `builder_catalog_overlay` has 5 rows and **every one is a no-op**: all six `*_enabled` flags `true`, every `*_override` `null`, `source: "code"`, all written in one batch 2026-08-19. The hide mechanism Phase 2 governance depends on has therefore never hidden anything in production — it is unproven, not merely unused. One row is `conn-repeater`, a roadmap item that is enabled everywhere. | Supabase `select * from builder_catalog_overlay` | open — prove the hide path end-to-end in 2B before relying on it |
| F8 | P1 | Style | Custom breakpoints are persisted to `localStorage` only (`loadCustomBreakpoints`/`saveCustomBreakpoints`), the same shape as the linked-classes bug that could blank a block. `wide`/`compact` are `editable: false` pending `render.tsx` `@media` buckets. | `edit-chrome/breakpoint-registry.ts` | open — Phase 5A |

---

## Phase 8B part 1 — shell anchor retirement (2026-09-02, `feat/builder-2027-p8b-shell`)

**Stopped at step 3 of 6 by F14.** Steps 4 (semantic landmarks), 5 (seed source →
native kinds) and the lane fix landed as code. Steps 2, 3-data and 6 — every step
that writes to or deletes from production Supabase — are **not done**, because the
precedence commit they depend on is not deployed. See F14.

### Embed scoreboard, measured from live HTML

| | Before | After | Why unchanged |
|---|---|---|---|
| `section_embed` on `improntamodels.com/home` | 7 | 7 | code-only branch, never pushed or deployed |
| live embeds / routes (`verify:no-embed-bridges`) | 167 / 37 | 167 / 37 | same |
| header widget embeds in the SEEDED tree | 4 per locale | **0** | `header.test.ts` pin, mutation-verified |

The seed swap removes 4 embeds from every one of 37 routes — 148 of the 167 — but
only once the shell is re-seeded and re-published, which F14 blocks.

### Landmark elements, measured on production before the fix

`<main>` 1 · `<nav>` 1 · `<header>` **0** · `<footer>` **0** · `role=banner` **0** ·
`role=contentinfo` **0**. Root cause found: Impronta's landmarks are `ejected: true`,
which suppresses the curated component that was the only thing emitting those
elements. `shellLandmarkWrapper` now emits `<header role="banner">` /
`<footer role="contentinfo">` exactly when a landmark is ejected, on both render
paths. Non-ejected keeps its `div`, so no tenant gets a doubled landmark.

### Gates — real exit codes, read from logs

`typecheck` 0 · `lint` 0 · `verify:server-actions` 0 · `test:builder` 0 (2121) ·
`test:builder-chrome` 0 (1280) · `test:builder-node-bindings` 0 (1533) ·
`test:impronta-pages` 0 (**199**, was 151) · `test:tenant-isolation` 0 (323) ·
`test:publish-preflight` 0 (47) · `test:a11y` 0 (29) · `test:size-ratchet` 0 ·
`perf:builder-budget` 0 · `check:ci-lane-parity` 0 · `check:builder-test-lane-coverage` 0 ·
`check:builder-2027-gate` 0 · `verify:no-embed-bridges` **1** (expected — 167 live
embeds remain; it is the scoreboard, not a regression).

`lint` initially failed: `PublishedShell.tsx` hit 814 lines against its 800 ceiling.
Resolved by trimming duplicated commentary and hoisting a slot address key that was
computed twice from identical literals — the budget was not raised.

### Mutations run

| Mutation | Expected | Result |
|---|---|---|
| ejected-header branch returns `div` | banner test red | red, 1 fail, exactly that test |
| drop the non-ejected guard | doubling test red | red, 1 fail, exactly that test |
| ES search label reverted to English | accessible-name test red | **green first time — the lane was dead (F15)**; red after the lane was wired |
| restore a `section_embed` bridge in the seed | anti-bridge pin red | red, 4 fails incl. the dedicated pin |

The third row is the finding: a mutation that comes back green is the only reason
F15 was caught. Every guard here was re-verified after the lane was made live.

### Not done, and not attempted

- No throwaway tenant was created. It would only have rehearsed against the same
  undeployed code path, so it could not have proven what step 2 needs proven.
- No production row was written, seeded or deleted. The shell anchor rows are
  un-snapshotted; snapshot them at the same time as the seed, once F14 clears.
- `SiteHeaderInspector` retarget (step 5) not done. It is inert until a landmark
  carries inline `sectionProps`, which F14 blocks — but it MUST land before the
  seed, or the shell editor goes silently dead for header config.

## Browser QA — Phase 2A kinds (2026-09-01, Chrome, PR #1475 preview)

Done on the PR's Vercel preview aliased to `staging-impronta.tulala.digital` (raw `*.vercel.app` is SSO-gated in a browser and not in `agency_domains`; the alias was restored to the production deployment afterwards). Impronta's draft was **not** mutated — the gallery was opened and searched, nothing inserted or published.

**Verified live in the operator's Add Gallery — 8 of 12:**

| Kind | Tab | What the operator sees |
|---|---|---|
| `marquee` | Blocks | "Marquee — A continuously scrolling strip of text or tags. Used for press lines, partner names and value statements." |
| `stats` | Blocks | "Stats — Oversized numbers with labels, counting up as they scroll into view." |
| `before_after` | Blocks | "Before and After — Two images with a slider between them, so a visitor can drag to compare." |
| `sticky_scroll` | Blocks | "Sticky Scroll" |
| `reveal` | Blocks | "Reveal — Wrap any blocks so they animate into view as the visitor scrolls" |
| `directory` | Data | listed as "Directory" |
| `featured_talent` | Data | listed as "Featured Talent" |
| `location_map` | Data | "Location Map", marked **Connected · Source: Talent Directory** |

The Data tab enumerates: Talent Grid, Featured Talent, Search Hero, Talent by Discipline, Directory, Location Map, Talent Search Bar, Talent Directory Grid.

**NOT verified — 4 of 12:** `header_search`, `header_account`, `header_inquiry`, `header_language`. They are shell-scoped and this page surface exposes only Blocks / Designs / Data — there is no Shell tab here, so searching "account" and "language" correctly returns no matches. Confirming them needs the site-shell editor, which is where 8B-6 uses them. **Do not treat these four as verified.**

## Persona QA — Personas A–E

Source: [`builder-human-qa-plan-2026.md`](./builder-human-qa-plan-2026.md). A = non-technical agency owner · B = talent coordinator · C = designer/creative operator · D = mobile-first · E = support/admin.

Run against Impronta and one fresh tenant. Rows added only from actual clicks; scheduled for the end of Phase 0 once the machine is free of the baseline gate.

| Persona | Surface | Step | Result | Sev |
|---|---|---|---|---|
| _(pending)_ | | | | |
