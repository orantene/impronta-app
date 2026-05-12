# Phase 0 — Registered-host QA matrix

Per [builder-execution-plan-2026.md §4](builder-execution-plan-2026.md) **P0-1**. Preview URLs under `*.vercel.app` do **not** hit app routes until aliased to a host in `public.agency_domains` ([middleware](../../CLAUDE.md)).

## Preconditions

- Tenant host present in `agency_domains` (e.g. production alias domain).
- Authenticated builder session (agency admin).

**Automation cannot replace this doc:** filling the matrix requires a human on a registered host. To **waive** Phase 0 for a release, record the risk note + approver in **Deferred bugs** and update [builder-execution-plan-2026.md § Implementation status](./builder-execution-plan-2026.md).

## Viewport matrix

For each width, complete the checklist and note **Pass / Fail** and **Issue ID** (ticket or PR).

| Width | Insert section visible on canvas | Navigator sync | Publish succeeds | No console errors on insert/publish |
|-------|-----------------------------------|------------------|------------------|--------------------------------------|
| ~390px | | | | |
| ~820px | | | | |
| ~1440px | | | | |

### Steps (repeat per viewport)

1. Open site workspace → live preview / builder for a CMS page (`/p/...`).
2. Insert a new section (library or duplicate).
3. Confirm new section appears **on canvas** without full page reload; navigator lists it in same order.
4. Open publish drawer; run preflight; publish (or dry-run if staging policy forbids live publish).
5. Open DevTools console; confirm no **errors** (warnings acceptable if documented).

## Deferred bugs (P0-3)

| Severity | Summary | Owner | Link |
|----------|---------|-------|------|
| | | | |

## Automated substitute (local dev only)

**Dirty local homepage:** If Impronta `/impronta?edit=1` is full of duplicate QA sections, see [impronta-local-qa-homepage-baseline.md](./impronta-local-qa-homepage-baseline.md) (inspect SQL + optional draft reset) before scoring human scenarios.

Not a replacement for registered-host QA. From repo root:

```bash
cd web && npm run test:e2e:browser-health
cd web && npm run test:e2e:registered-host   # loads https://tulala.digital — verifies no middleware host block (override with PLAYWRIGHT_REGISTERED_HOST_URL)
cd web && npm run test:e2e:impronta-local   # requires dev stack + seed
```

Record last run date and result here:

| Date | Command | Result |
|------|---------|--------|
| 2026-05-09 | `npm run test:e2e:browser-health` | Pass (Chromium) |
| 2026-05-09 | HTTPS GET https://tulala.digital (curl) | HTTP 200; HTML body does not contain Host not registered |
| 2026-05-09 | `npm run test:e2e:registered-host` | Pass (Chromium) — default URL `https://tulala.digital` |
| 2026-05-09 | `npm run typecheck` + `npm run test:tenant-isolation` + `npm run test:builder-capabilities` + `npm run test:publish-preflight` + `test:e2e:browser-health` + `test:e2e:registered-host` (single batch) | Pass (local) |
| 2026-05-12 | `cd web && npm run test:e2e:impronta-directory-search-hero` (requires local Next on `:3000` + dev sign-in env) | Pass (Chromium) — Directory Search Hero insert; desktop canvas + mobile preview iframe |

## Sign-off

- [ ] Matrix completed on production-like registered host.
- [ ] Blockers logged or fixed before Phase 6 / Phase 7.
