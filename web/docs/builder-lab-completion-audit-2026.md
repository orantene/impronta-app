# Builder Lab Polish — Completion Audit (2026-06-18)

Companion to [`builder-lab-polish-plan-2026.md`](./builder-lab-polish-plan-2026.md). Blunt by request: what actually shipped, what was deferred and **why**, what QA found, and a prioritized still-to-do. No softening.

## Headline

The full plan — **Phases 1–6 (37 tasks) + both stretch tasks (X7, X8)** — is code-complete on `feat/starter-kit-manager`, integrated through **13 disciplined waves**, every wave tsc + lint + `test:builder` (1192 tests) + `test:builder-chrome` (190 tests) green, and **7 forward-banded migrations applied live** to prod Supabase (`20261106000000`–`20261106000800`, plus #612's shell `gallery_tab` fix earlier in the session).

**But the test gate lied once.** Live runtime QA caught a production-build breaker that tsc, lint, and the tsx test runner structurally cannot see. That's the most important finding in this document and the reason the "QA after" step was non-negotiable.

## Score

**Builder Lab operability: 6.5 → 8.7 / 10.** Honest, not the sum of per-lane deltas.

- It is now the single control plane the plan set out to build: 5-axis surface governance, lifecycle + approval + audit + undo, bulk ops, search, saved views, keyboard nav, usage/health intelligence, and a real authoring loop (thumbnails, import/export, promote, checklist, collections).
- It is **not** a 10: the interactive click-through QA wasn't completed by me (credential boundary, below), the auto-thumbnail capture is a stub, one confirm dialog is half-wired, and the gate gap that let the runtime bug through is a process smell that will recur until fixed.

## The bug the gate missed (fix shipped)

**Symptom:** the integrated build compiled clean (tsc 0, 1192 tests green) but the live Builder Lab route returned **HTTP 500** on load.

**Root cause:** a `"use server"` module may only export **async functions** (a Next.js build rule). Two files violated it:
- `taxonomy-actions.ts` (D5, latent since Wave 4) exported 5 pure helper functions + 2 types.
- `component-usage-action.ts` (D1) exported a `cache()`-wrapped const.

tsc doesn't model the directive; the tsx test runner imports the symbols directly and never applies it. So both stayed invisible to the per-task gate while breaking `next build` / the dev runtime.

**Fix:** pure helpers moved to a non-`"use server"` `taxonomy-shape.ts`; the cached tally became a private const behind an exported async wrapper. Lab route **500 → 307** (clean auth redirect). Verified at runtime.

**The systemic gap (fix this):** the repo **already ships** `scripts/check-server-actions.mjs` (`npm run verify:server-actions`) that catches exactly this. It's in the `ci` script but **was not in the per-task gate** the agents ran. Across the whole branch it now reports **235 "use server" files, 0 failures** — but only because QA found the two by hand first. **Add `verify:server-actions` to the standing per-task gate** (and ideally a `next build` smoke on the integration branch). Had it been there, this dies at Wave 4.

## What shipped (by phase)

- **Phase 1 — fixes & foundation:** F1 collision-safe duplicate slug, F2 real Default-surfaces preview, F3 platform dead-end, F4 category precedence, F5–F8 preview wiring + UX unification, O1 bulk overlay actions.
- **Phase 2 — cross-surface truth:** X1 read-only 4-surface matrix, X2 catalog-version drift banner, X3 tighten-only guard + tooltip, **X4 real 4-surface overlay matrix** (migration), X5 live-gallery parity probe, **X6 `lab_enabled` 5th axis** (migration).
- **Phase 3 — accountability:** G1 audit log + feed (migration), G2 platform_audit parity, G3 publish-diff verdict, **G4 two-person approval** (migration), G5 depend-on archive guard, G6 tenant picker + impact, G7 per-row overlay undo, **G8 flag-gated timed rollout cron + auto-archive** (migration).
- **Phase 4 — operator efficiency:** O2 bulk action bar, O3 mounted Templates/Parity/Taxonomy tabs, O4 playground inline rollout/revisions, O5 undo toast, O6 Cmd-K palette, O7 saved views, O8 keyboard nav, O9 multi-row accordion, O10 unified "All" index.
- **Phase 5 — discoverability:** D1 usage counter, D2 hidden/archived chips, D3 staged-rollout chip, D4 per-template changelog, D5 taxonomy manager, D6 where-used confirm, **D7 provenance + usage table** (migration), D8 health dashboard.
- **Phase 6 — authoring:** A1 duplicate-with-rename, A2 thumbnails, A3 export JSON, A4 import JSON, A5 promote draft→starter, A6 pre-publish checklist, A7 collections grouping, A8 (flag-gated, stubbed — see below).
- **Stretch:** X7 per-surface rollout admission diff, X8 per-surface preview-subject parity.

## Left behind / deferred (and why)

1. **A8 auto-thumbnail capture is a no-op stub.** The flag-gated hook (`BUILDER_AUTO_THUMBNAIL_ENABLED`, default OFF) is wired into `publishRowCore` best-effort, but the actual headless render `renderTemplatePreviewToPng()` **degrades to `null`** — the only headless browser in the repo is `@playwright/test` (a devDependency), which can't run in the Vercel serverless runtime. **Follow-up:** a real capture path (a screenshot edge function / external service hitting `/template-preview`). Until then, published starters without a manual thumbnail stay placeholder-less.

2. **D6 where-used confirm is only wired to the Template Manager archive.** The `WhereUsedConfirm` component + `loadHideImpact` action are built and exported, but the **code-row (catalog-row-table) hide/archive path is not wired** — deliberately, to avoid a same-wave file collision with D2 (which owned `catalog-row-table.tsx`). **Follow-up:** wire the confirm into the row-table status menu (one small PR).

3. **Interactive Chrome QA was not completed by me — credential boundary.** The Builder Lab is super_admin-only. Verifying tabs/toggles/dialogs by clicking needs a super_admin session, and the standing safety rules (don't enumerate the super_admin email; never put a password in a URL) correctly blocked auto-authenticating. **What I did verify at runtime:** the integrated build compiles and the Lab route serves a clean 307 (was 500), homepage 200, no 500-class errors across a route smoke. **What still needs a human:** the pixel-level click-through (5-axis toggles, bulk+undo, Cmd-K, import/export round-trip, approval flow, health dashboard). Owner drives `/api/dev/signin` then walks the tabs.

4. **Per-task gate gap (process).** See the bug section. Not code — a CI/workflow change.

## Owner-gated (not code — needs you)

- **Merge `feat/starter-kit-manager` → `main`.** The whole program is pushed but unmerged. All 7 migrations are **already applied to prod Supabase**, so the code merge is schema-safe (no drift-on-deploy 500). After merge: `cd web && npm run deploy:smoke`.
- **G8 rollout cron:** flip `BUILDER_ROLLOUT_CRON_ENABLED` + register the Vercel Cron for `/api/cron/builder-rollout-ramp` (inert until both).
- **A8 auto-thumbnail:** `BUILDER_AUTO_THUMBNAIL_ENABLED` stays OFF until a real capture path exists (see deferred #1).
- **Vercel Skew Protection** (carried over from prior batches).

## Prioritized still-to-do

1. **[P0, process]** Add `verify:server-actions` to the per-task gate; consider a `next build` smoke on the integration branch. This is the single highest-leverage fix — it converts the class of bug QA just caught into a gate failure.
2. **[P1]** Owner interactive Chrome QA pass (deferred #3) before/after merge to main.
3. **[P1]** Wire D6 where-used confirm into the code-row archive path (deferred #2).
4. **[P2]** Real A8 headless capture infra (deferred #1).
5. **[P2]** Enable + observe the G8 rollout cron on a canary template once the flag is flipped.

## Verification trail

- Gate (final): tsc **0**, lint **0**, `verify:server-actions` **235/0**, `test:builder` **1192/0**, `test:builder-chrome` **190/0**.
- Runtime: Lab route **307** (post-fix), homepage **200**, no 500-class errors in the dev log across a route smoke.
- Migrations: `20261106000000`–`20261106000800` applied via Supabase MCP + ledgered in `supabase_migrations.schema_migrations`.
