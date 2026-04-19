# Transitional Debt Tracker

Every transitional fallback, compatibility shim, or legacy code path introduced during the SaaS build has a removal ticket here. **Rule (Plan §22.8, Charter §10):** no transitional fallback is retired until 7+ days of green validation in the state it guards against.

---

## Post-M8 freeze queue (must land before Phase 1 starts)

Per charter §9. Phase 0 can run in parallel with these (docs only). Phase 1 cannot start until A/B/C merged.

### A — Delete `AdminInquiryWorkspaceV2`

- **Target:** `web/src/app/(dashboard)/admin/inquiries/[id]/` — remove V2 component + the flag branch in `page.tsx`.
- **Precondition:** V3 canonical (met — M8 cutover complete; `ff_admin_workspace_v3` flipped global).
- **Status:** Pending.

### B — `addTalentToRoster` app-level `requirement_group` fallback

- **Target:** `web/src/lib/.../inquiry-engine-roster.ts:117-127` (NULL-fallback).
- **Charter recommendation:** **KEEP** (Plan §22.8 rule 2 — engine is authoritative; DB trigger is the net, not the other way around).
- **Status:** No action planned; revisit if Plan §22.8 rule 2 changes.

### C — Remove `uses_new_engine` stub column + `warnLegacyInquiryV2Render()` helper

- **Target:** `inquiries.uses_new_engine` (added by commit `f75262a`, stubbed by `3fa779e`), and the `warnLegacyInquiryV2Render()` helper.
- **Precondition:** A completed; no V2 render paths possible.
- **Status:** Pending.

---

## SaaS-era transitional fallbacks (introduced during Phases 1–3)

Each row below is filled in *as* the fallback is introduced. Template — do not delete; copy it.

### Template

```
### <fallback short name>
Introduced by: <branch / PR>
Location: <file:line>
Guards: <what failure mode this catches>
Removal ticket: <Linear / GH issue ref>
Removal precondition: <explicit green-signal criteria>
Validation source: <query / log / audit entry>
Status: active | retired (YYYY-MM-DD)
```

### rls_tenant_missing audit line (will be introduced in Phase 1–2)

- **Introduced by:** Phase 1 `withTenantScope()` wrapper (Plan §22.7).
- **Guards:** Silent writes landing on tenant #1 when a code path forgets to resolve tenant context. Shadow-mode RLS + tenant #1 backfill interaction (Charter §10).
- **Removal precondition:** Zero `platform_audit_log.action = 'rls_tenant_missing'` entries for 7+ consecutive days after Phase 2 "done."
- **Validation source:** Daily `platform_audit_log` scan.
- **Status:** Not yet introduced.

---

## Removal governance

1. Every fallback PR description names the removal precondition and the ticket.
2. Removal PR description cites the validation evidence (log query + 7-day window).
3. Retired rows stay in this file with `Status: retired (YYYY-MM-DD)` — history is part of the record.
