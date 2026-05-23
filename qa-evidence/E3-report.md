# E3 - Inquiry -> Messages live test
**Date:** 2026-05-23
**Branch:** qa/e3-inquiry-messages
**Final gate:** `npx tsc --noEmit` clean / `npm run lint` clean ✅

## Tests
| Test | Persona | Status | Evidence |
|------|---------|--------|----------|
| T1 | client (`qa-client-1`) - 2 talent | PASS | `qa-evidence/T1/` |
| T2 | guest - fresh email `qa-guest-1779506614@impronta.test` | PASS | `qa-evidence/T2/` |
| T3 | client (`qa-client-2`) - 3 talent | PASS | `qa-evidence/T3/` |
| T4 | client - `agency_recommends` / 0 talent | PASS | `qa-evidence/T4/` |

## Findings
1. Directory submissions lost selected `talent_ids` in `source_context` - `intentToSubmitInquiryInput` forwarded the caller context but did not merge selected talent ids - fixed in commit `e3b4ae4a8`.
2. Client messages hid the workspace auto-ack - Step 13 writes `workspace_auto_ack` to the private agency-client thread, while the client surface loaded/sent/read the group thread - fixed in commit `e3b4ae4a8`.
3. Talent messages showed the thread but not the submitted brief - the talent data bridge did not select `inquiries.message`, so the adapter fell back to generic copy - fixed in commit `e3b4ae4a8`.
4. `qa-client-2` could submit but could not open tenant client messages - the account had no `agency_client_relationships` row, and submit did not create one for authenticated clients - fixed in commit `e3b4ae4a8`.
5. Repo lint was blocked by stale `eslint-suppressions.json` counts for existing admin-shell ratchet entries - pruned with ESLint so `npm run lint` exits clean - fixed in commit `e3b4ae4a8`.

## Commits on qa/e3-inquiry-messages
- `e3b4ae4a8` `fix(inquiry-e3): messages link — persist client access and private threads`

## Notes
- The prompt's Tulum talent account (`tulum-talent-sofia@impronta.test`) is linked to a removed Impronta roster row, so the signed-in talent checks used active Impronta roster accounts `more@impronta.test` and `qa-talent-dashboard-audit@impronta.test`.
- T2 used Anto (`TAL-00036`) as requested; Anto has no auth user, so fan-out was verified through `inquiry_participants` DB evidence.
- `npm run lint` still prints existing warnings, but exits 0 after the suppression prune.

## Outstanding (deferred / out-of-scope)
- None for E3.
