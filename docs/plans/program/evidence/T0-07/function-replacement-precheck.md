# Pre-check: the four migrations that replace live production functions

Read-only against production (`pluhdapdnuiulvxmyspd`) on 2026-09-09, before any
push. A replacement whose argument list differs from the live one does not
replace anything: it creates a second overload and leaves callers resolving to
whichever Postgres prefers. That is what this check exists to catch.

| Function | Live on production | Migration | Verdict |
|---|---|---|---|
| `refund_admission(p_admission_id uuid)` | yes, security definer | 20261230000900 | same argument list, same security definer. True replacement. |
| `validate_booking_transaction_status_transition()` | yes, NOT security definer | 20261230001500 | no arguments either side, and the replacement does **not** add security definer, so the trigger keeps the caller's privileges. True replacement, no escalation. |
| `reserve_capacity_batch(p_requests jsonb, p_ttl_seconds int, p_order_line_id uuid, p_created_by uuid)` | yes, security definer | 20261230001800 | argument list matches exactly, in order and type. True replacement, no overload. |
| `reserve_resource_set(...)` | **absent** | 20261230001900 | nothing to replace. It is created fresh on production. |

Two of these run a self-test inside their own transaction against the first
agency and the first talent profile, which on production is Impronta rather
than a QA tenant. The rows they create are deleted in the same transaction, and
the hold they insert is dated 2099 so it cannot collide with a real booking.
Re-read those blocks immediately before the push rather than trusting this note.

Still to do before the push: `npm run db:check` to confirm the pending set is
exactly the expected files, and an object-existence check after it, because a
recorded migration version is not the same as an object that exists.
