# Defects

One log. Blocking / high-risk also get a GitHub issue. Normal and cosmetic stay here.

| ID | Severity | Disposition | Area | Finding | Evidence |
|---|---|---|---|---|---|
| D-001 | high-risk | implementing — P1-02 | orders | Paid order can end with no seat. Compensation now writes `ticket_refund_intents` for capacity-backed lines. Browser/cron execution still awaiting. | `capacity-lost-compensation.ts` |
| D-002 | high-risk | implementing — P1-03 | orders | `sweepExpiredOrders` now exists with cron + heartbeat. Remote run awaiting. | `expire-orders.ts`, `/api/cron/expire-orders` |
| D-003 | normal | implementing — P1-04 | events | Promo field added to guest picker. Browser proof awaiting fixture. | `ticket-picker-island.tsx` |
| D-004 | normal | implementing — P0-05 | docs | Instruction docs updated (`proxy.ts`, OPERATING.md note, migration-auto-apply, twenty presets). `db:check` still awaiting credentials. | CLAUDE.md, OPERATING.md |
| D-005 | high-risk | awaiting external verification — P1-01 | capacity | Concurrency proof now refuses unless `CAPACITY_PROOF_ISOLATED=1`. Isolated target still required. Never production. | `verify-capacity-concurrency.mjs` |
| D-006 | normal | open — P0-01 | product | Source product documents not in this workspace. | `docs/product/README.md` |
| D-007 | cosmetic | logged | events | Ticket picker file header still says CARD ONLY; pay-at-door is implemented. | `ticket-picker-island.tsx` |
| D-008 | high-risk | implementing — W-AUDIT | capacity | `reserve_capacity*` is service-role SECURITY DEFINER and keys on `pool_id` only. `reserveResourceSet` now refuses `wrong_tenant` / `pool_not_found` before the RPC. | `reserve-set.ts` |

Classification: blocking / high-risk / normal / cosmetic. Fix blocking and high-risk in the active workstream. Do not stop unrelated work for cosmetic issues.
