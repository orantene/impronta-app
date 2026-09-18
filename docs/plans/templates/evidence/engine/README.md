# Visual Asset Engine — live run on the QA tenant (2026-09-16, localhost:3061, `tpl-qa-studio`)

Branch `feat/visual-asset-engine`. Every write here went to the QA tenant only.

## What ran

1. `POST /api/dev/compose-site` with stated facts (`work.discipline` "Japanese sushi", `brand.audience` "couples and small groups", hours, WhatsApp) as qa-admin (email confirmed 2026-08-19). Result: `outcome fallback_used` (no AI copy provider locally, as before), 16 slots stored in `tenant_asset_assignments` (all `universal`, the only pool), `placed.photos.heroSource = universal`, `pendingJobId` set; job row `queued` with `facts {cuisine, clientele}` and 8 slots across 5 directions.
2. Drain (same code the cron runs, `runTenantImageJobs`): **8/8 images generated, QA-passed, swapped; $0.1014 measured** (1536×1024 $0.0112–0.0113, 1024² $0.0141). Tenant rows carry `tags {cuisine, clientele}`, `direction`, `layer_versions`, model `gpt-image-2.5-flare`, `qa_json` (aspect/blank/duplicate pass; 4 vision checks `skipped`, no QA model set). Usage rows: 8, sum $0.1014, `feature tenant_image`, `site_compose_id`.
3. Re-compose without facts: `heroSource = tenant_generated` (the tenant's own images now outrank the pool); a second job for the 7 remaining pool slots: **7/7 done, $0.0902**. Assignments: 15 `tenant_generated`, 1 `universal`.
4. Retire test: retiring the tenant's hero asset swapped that one tenant's hero to the next pool image and rewrote the home page's **live snapshot and draft revision** (old src gone in both, new present in both). Asset un-retired afterwards.
5. Builder: three slots flagged pending → "Your photos are being made · 3" pill, the pending frames dimmed and pulsing (`img[data-image-pending]`), editing untouched. Flags cleared afterwards.

## Screenshots (1440)

- `qa-home-1440.jpg` — home after the runs: the three cards and the four gallery frames are the tenant's own sushi images (tags applied); the hero is the pool image the retire test swapped in.
- `qa-gallery-1440.jpg` — gallery page with tenant images.
- `builder-pending-1440.jpg` — the pending state in the builder.

## Not shown

- `/platform/admin/stock` and `/platform/admin/stock/review` were not clicked: `super_admin` is the owner's account only (create-test-admin.mjs, by design) and no QA account may hold it. They are type- and lint-gated; the owner's first look is owed.
- The cron route itself answered 503 locally because the pulled env has `CRON_SECRET=""` (unset refuses by design); the drain was exercised through the same `runTenantImageJobs` function the route calls.

## Spend this run

$0.1014 + $0.0902 = **$0.19** (15 images), QA tenant only.

## Fixes found by the run (in the branch)

- Page swap first ignored the home page (`is_freeform = false` on the composed home row) and rewrote every occurrence of a seed src reused in two slots; now scoped to the slot's page (stamp `pageIds`), one node, and patches the homepage's `published_homepage_snapshot` plus its draft revision.
- Pending style was scoped under `[data-edit-chrome]`, which the canvas is not inside; unscoped.
- Pending pill sat on the presence pill; lifted.
