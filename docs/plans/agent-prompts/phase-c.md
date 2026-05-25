# Phase C — Unified Today / Messages / Calendar across agencies

**Scope:** 3–4 days. Drop the per-tenant filter on talent inbox. Show all work
across every agency the talent is on. Add a per-agency filter chip row when
the user has more than one agency.

**This phase touches RLS-adjacent paths.** Run `npm run test:tenant-isolation`
at the end. **Do not weaken any policy.**

## Tasks (in order)

### C.1 — Data layer (must come first, gates all UI)

1. Add `loadTalentInquiriesAllAgencies(talentProfileId)` to
   `web/src/app/(workspace)/[tenantSlug]/_data-bridge/talent.ts`.
   - Mirror `loadTalentInquiries` but:
     - Remove `.eq("inquiries.tenant_id", tenantId)`.
     - Add `inquiries.tenant_id, agencies!tenant_id(slug, display_name)` to
       the select.
   - Return type extends `TalentInquiryRow` with
     `{ agencySlug: string; agencyName: string | null }`.
   - Keep `loadTalentInquiries` untouched (still used by admin pipeline).

2. RLS verification (no migration unless required):
   - Confirm `inquiry_participants_talent_select` policy gates on
     `talent_profiles.user_id = auth.uid()`. It does — no changes needed.
   - Add an explicit cross-talent test: Talent A cannot see Talent B's threads
     even on the same agency.
     - `web/src/lib/inquiry/inquiry-rls.cross-talent.test.ts` (new) — use
       service-role client to seed, then a user-scoped client to assert.

3. Update `web/src/app/(workspace)/talent/layout.tsx`:
   - Call `loadTalentInquiriesAllAgencies(talentSelfProfile.id)` regardless of
     `activeAgency`.
   - Stop passing `tenantId` to `loadTalentInquiries`.
   - The active-tenant cookie becomes a **filter hint** (read on client) not
     a data-load gate.

### C.2 — Client state

4. Add `talentAgencyFilter` to `AdminShellState`:
   - Default `"all"`.
   - Persist via URL `?agency=<slug>` (route syncer extension).
   - When the cookie has a value AND the URL has no `?agency`, prefer the
     cookie for first-load only (then drop into client state).

5. Add `TalentAgencyFilterChips` component under
   `web/src/components/admin/shell/internal/talent/shared/TalentAgencyFilterChips.tsx`:
   - Renders only when `bridgeTalentAgencies.length > 1`.
   - Chips: "All" + one per agency.
   - Selecting a chip updates state + URL.

### C.3 — UI — Today, Messages, Calendar

6. Today (`talent/shared/today-*.tsx`): show agency chip on each card.
7. Messages: same; filter the conversation list by selected agency.
8. Calendar: filter holds + bookings by agency.
9. Unread count math: sum across agencies; per-agency unread on chip.

### C.4 — Tests

10. Extend `web/e2e/talent-platform-ia.spec.ts`:
    - `qa-talent-dashboard-audit@impronta.test` (2 agencies after Phase 2.1
      migration) sees threads from both agencies in `/talent/messages`.
    - Filter chip row is visible.
    - Clicking "Impronta" narrows the list; URL becomes
      `/talent/messages?agency=impronta`.
11. Run `cd web && npm run test:tenant-isolation`.

### C.5 — Commit

One commit:
```
talent/: unify inbox across agencies with per-agency filter
```

## Acceptance

- typecheck, lint, tenant-isolation green.
- New `inquiry-rls.cross-talent.test.ts` passes.
- E2e updates ready for prod run (don't run yourself).

## Reference index

- Master plan §6 (Phase C).
- `web/src/app/(workspace)/[tenantSlug]/_data-bridge/talent.ts` (`loadTalentInquiries`)
- `web/src/app/(workspace)/talent/layout.tsx`
- `web/src/components/admin/shell/internal/talent/shared/today-*.tsx`
- `web/src/components/admin/shell/internal/messages/*`
- `web/src/lib/talent/active-agency-context.ts`
- `supabase/migrations/*_inquiry_participants_*.sql` (do not modify)
