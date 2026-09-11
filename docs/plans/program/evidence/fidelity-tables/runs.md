# fidelity-tables: gates and journeys, with their real exit codes

Branch `work/fid-tables` off `program/fidelity`, 2026-09-11. Every command
below was run in the worktree's `web/` directory; the exit code is the
command's own (`echo $?` right after), never a wrapper's summary.

## Structural gates (private lane)

| Gate | Command | Exit |
|---|---|---|
| Typecheck | `TSC_QUEUE_LOCK=/tmp/tulala-tsc.fid-tables.lock TSC_QUEUE_TICKETS=/tmp/tulala-tsc.fid-tables.tickets npm run typecheck` | 0 (`scratchpad/fid-tables-tsc7.log`, 0 `error TS`) |
| Lint | `npm run lint` | 0 (`fid-tables-lint4.log`) |
| Design system | `npm run test:design-system` | 0 |
| Size ratchet + hex ratchet | `npm run test:size-ratchet` | 0 |
| Phase-1 i18n (key usage both ways) | `npm run test:phase1-i18n` | 0 |
| Tenant isolation | `npm run test:tenant-isolation` | 0 |
| Floor / kitchen / QR unit + render tests | `tsx --test src/lib/visits/commands.test.ts src/lib/visits/floor.test.ts src/lib/visits/page-wire.static.test.ts src/lib/pos/modes.test.ts src/lib/pos/pos-page-wire.static.test.ts 'src/app/(workspace)/[tenantSlug]/admin/pos/floor-client.render.test.tsx' src/lib/visits/restaurant-screens.render.test.ts src/lib/preparation/tickets.test.ts src/lib/reservations/book.test.ts` | 0 (100 pass, 0 fail) |
| Production build | `npm run build` (isolated env) | 0 (`fid-tables-build4.log`) |

Every gate above was run on the final source (after the last edit, the
walk-in writer accepting an empty name); the production build the last
journeys ran against is that source.

## Playwright journeys

The dev server was too slow and too flaky for the long venue journeys (a
7 to 11 s RSC refresh per write, an occasional 502 from the local proxy on
a server-action POST, a click that lands before hydration), so every
journey was proven against a LOCAL PRODUCTION BUILD of this branch:
`next build` + `next start -p 3200` with the isolated env and
`VERCEL_ENV=preview` (which is what lets `/api/dev/signin` answer), behind
the repo's `scripts/local-host-proxy.mjs` on 3201 presenting
`qa-journeys.local`. Run command per spec:

```
PLAYWRIGHT_BASE_URL=http://localhost:3201 PLAYWRIGHT_SKIP_WEBSERVER=1 PLAYWRIGHT_USE_DEV_SIGNIN=1 \
  npx playwright test e2e/cases/<spec>.spec.ts --project=chromium --workers=1 --reporter=line --trace=on
```

Final runs on the final build (`scratchpad/fid-tables-pw-summary9.log` for
the five specs, then `fid-tables-pw-summary10.log` for the two floor specs
after the walk-in writer's last edit; per-spec logs `fid-tables-pw9-<spec>.log`
/ `fid-tables-pw10-<spec>.log`, traces and frames beside them):

| Spec | Exit | Note |
|---|---|---|
| `e2e/cases/POS-floor-mode.spec.ts` | **0** (1 passed, 2.1 min) | the whole Tables-mode journey through the board's doors |
| `e2e/cases/VENUE-table-service.spec.ts` | **0** (1 passed, 2.7 min) | Live Floor walk-in → waiting list → seat; floor; counter; kitchen (T26 + K09); hand back |
| `e2e/cases/VENUE-refusals-in-words.spec.ts` | **0** (2 passed) | the floor's and the kitchen's refusals in every served language |
| `e2e/cases/C26-jesus-frozen-pizza-from-home.spec.ts` | **0** (1 passed) | pickup: Start → Mark ready → Confirm handoff across the tabs |
| `e2e/cases/C07-bar.spec.ts` | **1** (2 passed, 2 failed) | the two failing tests are the Spaces page's (`/admin/tables`, untouched by this group): they assert `/tab\s*·\s*occupied/` on the table card, and the card has drawn `Occupied` and `Bar tab` as two badges since commit `675d575f1` (2026-09-10, on `main`). Pre-existing; the guest-page assertion this group changed (`Welcome to table`) is reached only after that line. |

Earlier runs against the dev server (`fid-tables-pw-*`, `fid-tables-pw2-*`)
failed on environment, not on facts: a Fast Refresh reload from a source
edit during the run, the settings page compiling past a 30 s timeout, a 502
on the move's POST, the counter's collect timing out. Run 4 on the first
production build found one real defect (a table's earlier, departed party
still matched as the seated one) and one spec typo (`2 guests` for a party
of three); both fixed and the build repeated.
