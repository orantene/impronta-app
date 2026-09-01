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
| F10 | **P0** | Publish integrity | `verify:published-page-snapshots:strict` is **red against production data** and has been failing unobserved: it needs `.env.local`, so CI cannot run it and nobody local was running it either. Same class as F2 — a gate that exists and gates nothing. It reports, for Impronta: `missingBuilderTree` on exactly `faces-of-fall-26` and `our-fashion-models`, plus `missing` `published_page_snapshot` on `fashion-models`, `hosts-promoters` and their ES variants; two other tenants are missing snapshots for `__book__` / `404`. **This independently confirms F4** — the repo's own gate already knew about the two pages the plan's first draft missed. Pre-existing and inherited: it is a production-data condition, unaffected by any Phase 0 change. | `npm run verify:builder-ownership` → exit 2; log `/tmp/p0-vbo2.log` | open — resolved by 8B-5b (the two pages) + a publish pass for the rest; re-run as the 8B exit check |
| F9 | P1 | Gallery governance | `builder_catalog_overlay` has 5 rows and **every one is a no-op**: all six `*_enabled` flags `true`, every `*_override` `null`, `source: "code"`, all written in one batch 2026-08-19. The hide mechanism Phase 2 governance depends on has therefore never hidden anything in production — it is unproven, not merely unused. One row is `conn-repeater`, a roadmap item that is enabled everywhere. | Supabase `select * from builder_catalog_overlay` | open — prove the hide path end-to-end in 2B before relying on it |
| F8 | P1 | Style | Custom breakpoints are persisted to `localStorage` only (`loadCustomBreakpoints`/`saveCustomBreakpoints`), the same shape as the linked-classes bug that could blank a block. `wide`/`compact` are `editable: false` pending `render.tsx` `@media` buckets. | `edit-chrome/breakpoint-registry.ts` | open — Phase 5A |

---

## Persona QA — Personas A–E

Source: [`builder-human-qa-plan-2026.md`](./builder-human-qa-plan-2026.md). A = non-technical agency owner · B = talent coordinator · C = designer/creative operator · D = mobile-first · E = support/admin.

Run against Impronta and one fresh tenant. Rows added only from actual clicks; scheduled for the end of Phase 0 once the machine is free of the baseline gate.

| Persona | Surface | Step | Result | Sev |
|---|---|---|---|---|
| _(pending)_ | | | | |
