# Onboarding p13 · composed sites with Looks v2 + per-site generated images (PR #2114)

Isolated QA stack, real model (Haiku/Sonnet copy, gpt-image per-site frames via the engine, ≈ $0.10 per site). Flow: sentence → module → build → compose (Look v2, universal stand-ins) → per-site image job (8 frames) → cron drain → live page.

| Site | Look | Result |
|---|---|---|
| Barbería Norte | minimal (v2) | chair hero, fade, tools; captured before the resolver fix, two generic frames then |
| Taquería El Güero | bold (v2) | al pastor hero, tacos; same caveat |
| Casa Selva Spa | warm (v2) | **every frame on the page is a tracked tenant_generated asset** (verified by mapping each `media-public` URL on the served HTML to `tenant_asset_assignments`) |

## Defects found and fixed here
1. Finished per-site images never reached the live page: the job runner rewrote the trees but never busted the tenant cache tags. `runTenantImageJobs` now calls `bustAllTenantCaches` when it settles a job with done slots.
2. `detail` (the first content-band picture in the v2 Looks) was outside the per-site set; it is in, and slots are ranked home-first so the 8-frame cap spends above the fold.
3. The image resolver drew a *different* photo each time a Look named the same slot on a page (sticky story + picture both ask `wide`), so the assignment tracked one and the job could only replace that one; the second stayed a universal stock photo forever. One photo per page+slot now (`layer3.test.ts`), and the swap covers every node carrying that photo on the page.

## Stack notes
- `shot-site.spec.ts` walks the page before capturing (v2 scroll-reveals fire on intersection; a blind full-page capture shows blank bands).
- The served page lags the drain by a few seconds in dev; verify by URL mapping, not by eye.
