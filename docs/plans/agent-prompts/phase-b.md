# Phase B — Identity + switcher cleanup

**Scope:** 2 days. Remove agency-context switcher for pure talent. Repurpose
identity-bar "Acting as …" to workspace-only. Replace hardcoded YTD copy with a
neutral placeholder until Phase D wires real data.

## Tasks (in order)

1. **Stop rendering the top "Agency context" dropdown for pure talent.**
   - `web/src/app/(workspace)/talent/layout.tsx` (~line 156–169).
   - Wrap the `TalentAgencyContextSwitcher` block in `if (isHybrid) { ... }`.
   - Keep the import (Phase F deletes it).
   - Keep the cookie helpers (`ACTIVE_TALENT_TENANT_COOKIE`); they remain useful
     for deep-link filtering in Phase C.

2. **Gate identity-bar "Acting as …" affordance.**
   - `web/src/components/admin/shell/internal/page-modules/IdentityBar-1.tsx`
     (lines ~95–127).
   - For the **talent surface** (`inWorkspace === false && inClient === false`),
     show profile display name + an inline "N agencies" chip that opens
     `state.talentPage = 'agencies'` (still the live tab; Phase E renames).
   - Do NOT show the agency tenant-switcher drawer when the user is pure talent
     (no `bridgeSessionIdentity.role` other than `viewer`).

3. **Gate `TalentAgencySwitcherDrawer` to hybrid.**
   - `web/src/components/admin/shell/internal/wave2.tsx`
     (`TalentAgencySwitcherDrawer`, around line 1334).
   - Add early-return `if (!isHybrid) return null;` (derive `isHybrid` from
     shell context; this drawer should never open for pure talent).

4. **Replace hardcoded YTD copy with a neutral placeholder.**
   - `IdentityBar-1.tsx` line ~122 (the `3 confirmed · €4,200 YTD` string).
   - For talent surface, replace with:
     `${bridgeTalentAgencies?.length ?? 0} agencies` (or i18n equivalent).
   - Phase D replaces this with real YTD.

5. **Tests:**
   - `web/src/lib/talent/platform-talent-shell.test.ts` — add a test asserting
     the switcher is omitted when `agencyOptions.length > 1` but `isHybrid` is
     false. Use a small wrapper or string-grep over the layout source.
   - Update `web/e2e/talent-platform-ia.spec.ts`:
     - On the QA audit talent (now on Impronta + Morena), confirm the **"Agency
       context"** combobox is NOT in the DOM.
     - Confirm the "View roster profile" link still resolves to
       `/morena-studio/t/TAL-AUDIT-0512` on localhost / `/impronta` host
       respectively.

6. **Commit (one commit):**
   ```
   talent/: hide agency switcher for pure talent
   ```

## Acceptance

- `cd web && npm run typecheck` passes.
- `cd web && npm run lint` passes.
- `cd web && npm run test:tenant-isolation` passes.
- New unit test passes.
- QA audit talent + `more@impronta.test` see no "Agency context" dropdown when
  visiting `/talent/site` on localhost (manual verification noted in output
  contract; do not start a browser in this phase).

## Reference index

- Master plan §5 (Phase B).
- `web/src/app/(workspace)/talent/layout.tsx`
- `web/src/components/admin/shell/internal/page-modules/IdentityBar-1.tsx`
- `web/src/components/admin/shell/internal/wave2.tsx` (TalentAgencySwitcherDrawer)
- `web/src/lib/talent/active-agency-context.ts`
- `web/e2e/talent-platform-ia.spec.ts`
