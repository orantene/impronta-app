# pos-enable: the platform kill switch, proven end to end

**Task.** `platform_settings.workspace_pos_enabled` shipped `false` with no
control anywhere — the only way to flip it was raw SQL. This slice (1) adds a
row to the super-admin Workspace UI card at `/platform/admin/settings` that
reads and writes the real column, following the exact shape of the FAB/
tour/quick-bar/support switches already on that card, (2) confirms the
workspace-level Settings > Point of sale panel round-trips a mode change
through the real reader (`getPosModes`) and survives a refresh, and (3)
confirms that with the platform switch off, that panel says so in a plain
sentence instead of offering toggles that cannot work.

**Branch.** `work/pos-enable` off `program/journeys-2026-09`. Resumed from a
killed prior run whose 8 modified files + 2 new files were kept as-is after
review — they were already correct (see "What the previous run had already
built" below). This run's own contribution is the actual proof and one
evidence gap it found and closed.

**Database.** Supabase branch `qa-journeys` (`fxlankepwnvelxjrahwk`) only.
Production (`pluhdapdnuiulvxmyspd`) was never touched, `npm run db:push` was
never run. No migration was needed — `workspace_pos_enabled` already existed
as a column; this slice only adds a screen for it.

---

## What the previous run had already built (reviewed, kept whole)

1. `web/src/lib/platform/workspace-ui.ts` — `writePlatformWorkspaceUi` now
   takes `posEnabled` as a normal field of `PlatformWorkspaceUi` instead of
   `Omit<..., "posEnabled">`, and writes `workspace_pos_enabled`. The reader
   (`loadPlatformWorkspaceUi`) already read this column before this slice —
   only the write side and the default (`false`) needed adding.
2. `web/src/lib/server-actions/admin-platform-workspace-ui.ts` — the `"use
   server"` action's zod schema gained `posEnabled: z.boolean()`, mirroring
   the other four switches exactly (super-admin gated, `revalidatePath` on
   success).
3. `web/src/app/(workspace)/platform/admin/settings/PlatformWorkspaceUiCard.tsx`
   — a fifth row, "The point of sale", added to the same `rows` array the
   other four switches build from. Same checkbox, same save button, same
   dirty-check. `data-testid="platform-workspace-ui-card"` added to the root
   div so a journey can find the card without relying on visible text.
4. `web/src/components/admin/settings/pos-modes-card.tsx` — takes a new
   `platformEnabled` prop (`workspacePosEnabled` off the shell bridge). When
   `false`, renders the title + description + a `platformOffHint` sentence
   and NO switches (`data-testid="pos-modes-platform-off"`), instead of a
   bank of toggles wired to a `setPosModes` that would still write but that
   nothing downstream reads while the platform is off.
5. `web/src/components/admin/shell/internal/page-modules/WorkspacePageView.tsx`
   — passes `platformEnabled={workspacePosEnabled}` into the card.
   `workspacePosEnabled` itself already existed on the shell bridge
   (`context.tsx`) before this slice and was already read by `PosModeSwitch`
   and `MobileBottomNav` to gate the top-bar switch — this slice's only wiring
   job was getting the same value to the settings card.
6. `web/messages/{en,es,fr}.json` — `workspaceUiPosLabel` / `workspaceUiPosHint`
   (the platform card's row) and `posModes.platformOffHint` (the workspace
   card's off-state sentence), in all three languages.
7. `web/e2e/cases/POS-platform-switch.spec.ts` — the one journey spec proving
   all of the above through the real screens, written but never run to a
   passing state before the previous run was killed (evidence dir held only
   3 of the spec's 5 screenshots, no README, no confirmation the spec ever
   passed).

None of this needed correcting. The ES/FR strings added
(`workspaceUiPosHint`, `platformOffHint`) match the sibling `workspaceUiSupport*`
entries in not carrying accents — checked against the rest of
`dashboard.platform.settings`, which mostly does use them (`está`, `descripción`,
etc.); the two Support/POS rows are the outliers, pre-existing before this
slice. Left as-is to match the immediate neighbor rather than partially
re-accenting one card.

## What this run proved, and the gap it found

**The gap (rule 2, "a success line is not a verification").** Screenshot 3
left by the killed run showed Counter "On" with a "Saved just now" badge —
but `agencies.settings.pos` was `null` in the database at that point, meaning
`enabledPosModesFromSettings` was returning `["counter"]` from its own
built-in default for a *missing* path, not from any write the screen made.
The badge text belonged to an unrelated autosave indicator elsewhere in the
Settings shell, not to `PosModesSettingsCard`. Nothing had actually round-
tripped a write yet.

**Closed by driving a real state change.** Signed in as
`qa-journeys-owner@impronta.test` on a local dev server of this branch
(`next dev -p 3214`, env from `.env.capacity-isolated.local`,
`NEXT_PUBLIC_SUPABASE_URL` = `fxlankepwnvelxjrahwk`) against the host
`qa-journeys.localhost:3214` (already a registered non-primary
`agency_domains` row, no proxy needed). Manually:

1. Toggled Counter OFF from `/qa-journeys/admin/settings` → Point of sale.
   `agencies.settings.pos.locations.default.modes` written to `["floor"]`
   (`floor` was already present from a different, concurrently-running
   agent's fixture writes on the SAME shared `qa-journeys` row — see "Shared
   fixture" below; it was left untouched throughout).
2. **Reloaded the page.** Top bar switch changed from "Workspace / Counter"
   to "Workspace / Floor" — the real reader (`loadPlatformWorkspaceUi` via
   the shell bridge) picked up the write, not an optimistic client cache.
3. Toggled Counter back ON. `modes` became `["floor", "counter"]`.
4. Reloaded again — Counter showed "On".

This is the manual proof behind why the automated spec's assertions are
trustworthy; the automated run below is the recorded one.

**The automated journey**, run against the same local dev server + database:

```
PLAYWRIGHT_BASE_URL=http://qa-journeys.localhost:3214 PLAYWRIGHT_SKIP_WEBSERVER=1 PLAYWRIGHT_USE_DEV_SIGNIN=1 \
  npx playwright test e2e/cases/POS-platform-switch.spec.ts --project=chromium --workers=1 --reporter=line --trace=on --timeout=90000
```

| Run | Result | Note |
|---|---|---|
| 1 (`runs/local-run1.txt`) | FAIL, `EXIT=1` | Timed out waiting for "Saved. Applies to every workspace." after the platform-switch save — first-compile latency on a cold dev server (Turbopack compiling the server action + card on first hit), compounded by a second agent's concurrent dev server/Playwright run sharing this machine's CPU (`ps aux` showed `wt-pos-floor`'s `next dev -p 3120` and a live `playwright test e2e/cases/POS-floor-mode.spec.ts` at the same moment). Not a product defect. |
| 2 (`runs/local-run2.txt`) | FAIL, `EXIT=1` | Got further (platform switch off/on both round-tripped); timed out on the *workspace* card's "Saved" text after clicking the Counter switch — same class of cold-compile latency, now for `/qa-journeys/admin/settings`'s Point-of-sale sub-route, which hadn't been hit yet this run. |
| 3 (`runs/local-run3.txt`) | **PASS**, `EXIT=0`, 1 passed (1.4m) | Every route was warm. Full journey: platform off → workspace panel says so → platform on → Counter on via `setPosModes` → reload confirms `getPosModes` agrees → top-bar switch shown to the owner, absent for the viewer. |

Screenshots (`screenshots/`), in journey order:

1. `1-platform-switch-off.png` — `/platform/admin/settings`, "The point of
   sale" row unchecked, after a save + reload.
2. `2-workspace-panel-platform-off.png` — `/qa-journeys/admin/settings` →
   Point of sale, platform off: the plain sentence, zero `role="switch"`
   elements on the card.
3. `3-workspace-panel-counter-on.png` — same panel, platform back on,
   Counter switched on, "Saved just now" from a real write this time.
4. `4-topbar-switch-owner.png` — `qa-journeys-owner@impronta.test` on
   `/qa-journeys/admin`: the "Workspace / Counter" top-bar switch is visible.
5. `5-topbar-switch-absent-viewer.png` — `qa-journeys-viewer@impronta.test`
   on the same route: no such switch (the mode vocabulary gives a `viewer`
   rank no POS modes at all, per `lib/pos/modes.ts`).

`sql/01-final-state.sql` — the two rows read back directly (pooler
connection, `DATABASE_URL` from `.env.capacity-isolated.local`) right after
the passing run:

- `platform_settings.workspace_pos_enabled = true`
- `agencies.settings.pos.locations.default.modes = ["floor", "counter"]`
  for `qa-journeys`

## Shared fixture — a genuine cross-agent race, not a defect

While proving this manually, a concurrently-running agent building the
`floor` mode (worktree `wt-pos-floor`, branch presumably `work/pos-floor`)
was also writing to the SAME `agencies.settings.pos` JSON path for the same
`qa-journeys` fixture tenant, via its own dev server (`next dev -p 3120`) and
its own Playwright run (`POS-floor-mode.spec.ts`). One of my own DB checks
mid-session showed `modes: ["floor"]` moments after a click I expected to
produce `[]` — not a bug in this slice's code, but the other agent's
concurrent write landing in the same read-modify-write window. Confirmed by
`ps aux` showing both worktrees' dev servers and Playwright processes live
at the same timestamps. No file in `lib/pos/pos-modes-store.ts` or
`server-actions/pos-modes.ts` does anything wrong here — the JSON merge is a
plain read-then-write with no per-mode locking, and two different modes
being toggled by two different agents on the same tenant is exactly the
shape that exposes it. Not fixed here (out of scope for a platform-switch
task, and the fix belongs to whoever owns the fixture-sharing contract
across parallel mode-building agents) but worth naming so nobody reads
`modes: ["floor", "counter"]` in the final state and assumes this slice
enabled floor — it did not; that value is `pos-floor`'s own proof, left
alone on purpose.

## What is not proven

- **Not proven on a deployed host.** Proven against a local dev server of
  this branch on the isolated QA database, same pattern as `prove-counter`
  and `prove-people-projects` (see their READMEs) — no attempt was made to
  reach `staging-qa-journeys.tulala.digital` since it was not required for
  this slice and re-aliasing it is a shared, disruptive action across
  parallel agents.
- **Only English strings were exercised in the browser.** `workspaceUiPosLabel`
  / `workspaceUiPosHint` / `posModes.platformOffHint` exist in all three
  message catalogues (checked by reading the JSON directly) but the journey
  itself only signs in with English-locale fixture accounts; no screenshot
  shows the Spanish or French rendering of the new copy.
- **The `posEnabled` unit-level round trip on `workspace-ui.ts` has no
  dedicated test file.** No `workspace-ui.test.ts` existed before this slice
  and none was added; the only proof is the live e2e journey above (steps 1
  and 3, which pass through `writePlatformWorkspaceUi` /
  `loadPlatformWorkspaceUi` for real).
