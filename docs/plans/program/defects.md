# Defects

One log. Blocking / high-risk also get a GitHub issue. Normal and cosmetic stay here.

| ID | Severity | Disposition | Area | Finding | Evidence |
|---|---|---|---|---|---|
| D-001 | high-risk | implementing — P1-02 | orders | Paid order can end with no seat. Compensation now writes `ticket_refund_intents` for capacity-backed lines. Browser/cron execution still awaiting. | `capacity-lost-compensation.ts` |
| D-002 | high-risk | implementing — P1-03 | orders | `sweepExpiredOrders` now exists with cron + heartbeat. Remote run awaiting. | `expire-orders.ts`, `/api/cron/expire-orders` |
| D-003 | normal | implementing — P1-04 | events | Promo field added to guest picker. Browser proof awaiting fixture. | `ticket-picker-island.tsx` |
| D-004 | normal | closed — P0-05 | docs | Instruction docs updated. Remote `20261230000200`–`00600` applied to `pluhdapdnuiulvxmyspd` (visits, shifts, deliverables, visit slug, remaining holes). | CLAUDE.md, OPERATING.md |
| D-007 | cosmetic | closed | events | Ticket picker file headers now say card or pay-at-door. | `ticket-picker-island.tsx` |
| D-005 | high-risk | verified in test environment — P1-01 | capacity | 200 concurrent HTTP `reserve_capacity` on qa-journeys: 12 ok, 188 sold_out, 12 live units, 0 remaining. Throwaway pool cleaned up. Never production. | `qa-evidence/P1-01/capacity-concurrency.md` |
| D-006 | normal | closed — P0-01 | product | Source product documents now in `docs/product/`. | `Tulala-Business-Journeys-POS.md`, `Business-specific-labels-Workspace-Theme.md` |
| D-008 | high-risk | implementing — W-AUDIT | capacity | `reserve_capacity*` is service-role SECURITY DEFINER and keys on `pool_id` only. `reserveResourceSet` now refuses `wrong_tenant` / `pool_not_found` before the RPC. | `reserve-set.ts` |
| D-009 | high-risk | implementing — W-AUDIT | pos | Collect holds class places; cancel now releases this tenant's live allocations for the sale's lines. | `collection.ts` finalizeOrCancel |
| D-010 | high-risk | implementing — W-AUDIT | pos | Walk-in collect was holding `talent_offerings.capacity_pool_id`. It now holds the session `session_tier` / `default` pool via `tierReserveRequest`, same as the guest picker. | `hold-capacity.ts` |
| D-011 | normal | open | fixture | Workspace B on qa-journeys is identity-only: `agencies` row, active host and owner membership, but zero spaces, offerings, sessions, pools, customers and orders. Enough to prove A's operator sees none of B; not enough for any case where B must transact. START-HERE had listed A's fixture contents directly after "two workspaces", which read as both being seeded. | `seed_journeys_program.sql`, `qa-evidence/schema-drift/isolated-branch-repair.md` |
| D-012 | high-risk | closed — schema drift | migrations | `schema_migrations` on qa-journeys recorded 763 versions up to `20261230000700` while objects *inside* that range did not exist — the historical replay recorded versions whose bodies never ran, so a ledger diff reported "in sync" over a schema missing `refund_admission`, `cancel_event_cascade`, `extend_capacity_hold` and 13 more. `check:migrations-applied` was independently blind because `list_applied_migrations` was never replayed either. Twelve migration files replayed from source; `journeys:probe` and `journeys:smoke` now cover it, and the ledger is no longer treated as evidence. | `qa-evidence/schema-drift/isolated-branch-repair.md` |
| D-013 | normal | closed — docs | docs | `web/AGENTS.md` said "Agents do not browser-QA" while this program's own evidence trail is ~20 agent-run browser passes on qa-journeys. The rule now scopes to production and real tenant data, and names the isolated branch as the place agent browser QA belongs. | `web/AGENTS.md` |

Classification: blocking / high-risk / normal / cosmetic. Fix blocking and high-risk in the active workstream. Do not stop unrelated work for cosmetic issues.
