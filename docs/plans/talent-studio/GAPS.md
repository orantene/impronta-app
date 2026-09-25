# Talent Studio · engine gaps

Patterns and flows that have a prototype screen but no engine in this checkout. The UI lists them and says they are not available. Nothing is faked.

| Screen | Engine | Status |
|---|---|---|
| `offer_cut` haircut / time-block | sessions in `src/lib/sessions/` | Partial. No per-item selling pattern stored. |
| `offer_dinner` seated event | seats / sessions | Missing as a talent pattern. |
| `offer_logo` deliverable | deliverables | Missing as a talent pattern. |
| `multi` several services in one visit | packages / `offering_components` | Exists for packages only. |
| `flow_consult` | request-to-book | Exists via `booking_mode=request`. |
| `flow_scope` scoped project | quote versions | Partial. |
| `flow_credits` | `src/lib/catalog/entitlement-credits.ts` | Exists, not wired to an item pattern. |
| `flow_recur` recurring | none | Missing. |
| `flow_overtime` overtime | none | Missing. |
| `flow_class` class with seats | sessions | Partial. |
| `flow_project` | quote v1 superseded / v2 awaiting | Partial (`quote-versions.ts`). |
| `flow_goods` product pickup | product + stock | Exists on the product form. |
| `flow_conflict2` second client | conflict resolve | Partial. No talent resolve screen. |

Tap-to-pay: not available.
Per-placement stats: not shared until an entitlement exists.
Working hours slice of eligibility: unknown until a loader exists; percent stays Not available.
