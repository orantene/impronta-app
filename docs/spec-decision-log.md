# Spec decision log

Short-lived decisions made during implementation when the written spec leaves room for interpretation. Each entry should help future readers understand **why** something is the way it is.

| Date | Surface | Issue | Decision | Spec update |
|------|---------|-------|----------|-------------|
| _Template_ | _e.g. Admin inquiry workspace_ | _Ambiguous empty state_ | _Chose copy X over Y_ | _Link PR / doc if spec text changed_ |

| 2026-04-15 | Inquiry workspace V2 | Full `WORKSPACE_STATE_MATRIX` object vs composable helpers | Implemented `statusAllowsAction` / `roleMayPerform` + `getWorkspacePermissions` instead of a single giant matrix object to ship faster while keeping SC-3 intersection semantics. | None |
| 2026-04-15 | Admin inquiry queue | SC-25 exact SQL vs batched client merge | Used one `inquiry_messages` query for listed inquiry IDs and merged max `created_at` in JS; compared to `inquiry_message_reads` without per-thread split for the unread dot. | None |
| 2026-04-15 | Client `/client/inquiries/[id]` | Coexists with `/client/requests/[id]` | Non–new-engine inquiries still redirect to `/client/requests/[id]`; v2 inquiries stay on the tabbed workspace route. | None |

---

_Add new rows above this line (newest first)._
