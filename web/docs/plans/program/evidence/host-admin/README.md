# host-admin: workspace admin (Settings + a POS-mode round trip) on the deployed QA host

Proved by agent `host-b`, 2026-09-11, against `https://staging-qa-journeys.tulala.digital`
(Vercel deployment `tulala-5e3o227vw`), confirmed serving commit `867e0ecc2`
(`sentry-release=867e0ecc2582990c2054aceb63ba55910f4f18c7` — same check as
`docs/plans/program/evidence/host-classes/README.md`). Database: Supabase
branch `fxlankepwnvelxjrahwk` (qa-journeys). Production `pluhdapdnuiulvxmyspd`
was never read from or written to.

## Spec reused

`e2e/cases/POS-platform-switch.spec.ts` (`docs/plans/program/evidence/pos-enable/`),
chosen because it already IS the "Settings pages open and one harmless
setting round-trips" proof this item asks for: it opens
`/platform/admin/settings`, flips the platform POS kill switch off then back
on through the real save action and a page reload (`loadPlatformWorkspaceUi`,
the real reader), then opens the workspace owner's own `/admin/settings` →
Point of sale panel and turns the Counter mode on through `setPosModes`,
reloading and reading it back through `getPosModes` (the real reader) — not
just the optimistic UI a click already shows. It also proves the top-bar
Workspace switch is visible for an owner and absent for a viewer.

This spec writes its screenshots to the shared, already-committed
`docs/plans/program/evidence/pos-enable/screenshots/` directory (hardcoded
relative paths in the spec, not `testInfo.outputPath`). To avoid touching
another proof's committed evidence, the run's output files were copied here
immediately after the run and the originals restored with
`git checkout -- docs/plans/program/evidence/pos-enable/screenshots/`
(verified clean with `git status --short` before and after — see command log
below). The spec file itself was not modified.

## Command and exit code

```
PLAYWRIGHT_BASE_URL=https://staging-qa-journeys.tulala.digital \
JOURNEYS_B_ORIGIN=https://staging-qa-journeys-b.tulala.digital \
PLAYWRIGHT_SKIP_WEBSERVER=1 PLAYWRIGHT_USE_DEV_SIGNIN=1 \
npx playwright test e2e/cases/POS-platform-switch.spec.ts --project=chromium --workers=1 --reporter=line --trace=on
```
Exit 0 — **1 passed (22.5s)**, run 1, no fix needed. Full log: `run1.log`.

## What was proven

1. Platform super-admin (`qa-journeys-platform-admin@impronta.test`) turns
   the platform-wide POS kill switch OFF on `/platform/admin/settings`, saves,
   reloads — the real reader agrees (`1-platform-switch-off.png`).
2. With the platform switch off, the workspace owner's `/admin/settings` →
   Point of sale panel shows no toggles and explains the platform is off
   (`2-workspace-panel-platform-off.png`).
3. Platform admin turns the switch back ON.
4. The owner's panel now offers real toggles; Counter is turned on through
   `setPosModes`, "Saved" confirmed, the page reloaded, and the switch reads
   checked through `getPosModes`, the server's own reader — not the
   optimistic client state (`3-workspace-panel-counter-on.png`).
5. The top-bar "Workspace ▾" switch is visible for the owner
   (`4-topbar-switch-owner.png`) and absent for the viewer role
   (`5-topbar-switch-absent-viewer.png`), proving `lib/pos/modes.ts` gives a
   viewer rank no POS modes at all.

Screenshots (`screenshots/`, 5 files, copied out of the shared evidence
directory as described above): `1-platform-switch-off.png`,
`2-workspace-panel-platform-off.png`, `3-workspace-panel-counter-on.png`,
`4-topbar-switch-owner.png`, `5-topbar-switch-absent-viewer.png`.

SQL ground truth (`sql-after-journey.json`, service role, never printed):
`platform_settings.workspace_pos_enabled = true` (the spec's final state,
turned back on), and `agencies.settings->pos.locations.default.modes`
includes `counter` (`floor`, `counter`, `door`, `classes`, `projects` all
present on the fixture tenant), confirming the toggle-on round trip landed
in the same row `getPosModes` reads.

## Difference between local and host

None found. No fix was needed.

## Not done, and known

- The spec proves the platform switch and one workspace POS-mode toggle; it
  does not walk every Settings card (fields, taxonomy, billing, etc.) — those
  are out of scope for "one harmless setting round-trips".
- Spanish/French settings screens were not opened in a browser (not part of
  this spec).
