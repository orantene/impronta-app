# Phase A — Decision freeze & sweep

**Scope:** 0.5 day. Documentation + label changes only. No code surface changes.

## Tasks

1. Open `docs/decision-log.md`. Append three new entries with today's date and
   "shipped" status:
   - **L41 — Talent surface is Tulala-canonical.** Agency context is a filter,
     not a route prefix, for pure talent. Cite the master plan §2.
   - **L42 — Agency switcher is gated to hybrid users.** Pure talent never sees it.
   - **L43 — Talent earnings source.** `talent_bookings` joined to
     `booking_commission_snapshot.talent_net_cents`. `EARNINGS_ROWS` fixture
     is deprecated.

2. Confirm the chosen page label in fixtures. The label is **Money**.
   - `web/src/components/admin/shell/internal/state/fixtures.ts` —
     `TALENT_PAGE_META["public-page"]` already shows "My pages"; we are NOT
     changing it. Phase E adds a new `money` page later.
   - Do **not** rename `agencies` to `money` yet — Phase E does that.

3. Verify the Phase 2.1 follow-up cleanup is complete in this branch:
   - `web/src/components/talent/site/TalentSiteDashboardRedirect.tsx` — deleted.
   - `web/src/components/talent-dashboard/my-site-page.tsx` — deleted.
   - `web/src/components/talent/site/TalentSiteDashboard.tsx` — deleted.
   - `web/src/components/talent/site/TalentSiteAppearancesPanel.tsx` — present.
   - `web/src/lib/talent/agency-roster-profile-url.ts` — present.

   If any of these are wrong, list them under Out-of-scope findings (Phase F
   handles broader retirement).

4. Commit (single commit, message exactly):

   ```
   talent/: lock Phase 2.2+ decisions in log
   ```

## Acceptance

- Decision-log entries L41–L43 present.
- `cd web && npm run typecheck` passes.
- Single commit on `stable-work`.

## Reference index

- Master plan §1, §2, §10 (decisions).
- `docs/decision-log.md`.
- `web/src/components/admin/shell/internal/state/fixtures.ts` (`TALENT_PAGE_META`).
