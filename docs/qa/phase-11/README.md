# Phase 11 — Comments (QA acceptance matrix)

In-context, threaded comments on homepage sections inside the editor
chrome. Operators (and reviewers visiting via a share link with
`comment: 'rw'`) attach notes, reply, resolve, and delete — without
leaving the canvas.

## Shipped (M0)

- `cms_section_comments` table + RLS + Realtime publication
  (`supabase/migrations/20260702120000_cms_p11_m0_section_comments.sql`).
- Staff-side server actions:
  `web/src/lib/site-admin/edit-mode/comment-actions.ts`
  (`listCommentsAction`, `addCommentAction`, `editCommentAction`,
  `resolveCommentAction`, `deleteCommentAction`).
- Share-link JWT extended with `cmt` claim
  (`"none" | "r" | "rw"`, defaults to `"none"` for legacy tokens).
- EditContext drawer mutex + open/close API
  (`commentsOpen`, `commentsFocusSectionId`, `openComments`,
  `openCommentsForSection`, `closeComments`).
- `CommentsDrawer` component
  (`web/src/components/edit-chrome/comments-drawer.tsx`):
  list, reply, resolve / unresolve, soft-delete, inline edit
  (author-only), Realtime subscription on `(tenant_id, page_id)`.
- Topbar comment-bubble icon (badge slot reserved for unresolved
  count) + `⌘K` palette entry "Open Comments".
- Drawer added to the right-side mutex chain + Escape key dismissal.

## Acceptance checklist

| Surface | Behavior | Status |
| --- | --- | --- |
| Topbar comment icon | Opens the drawer | ✅ |
| `⌘K` → "Open Comments" | Opens the drawer | ✅ |
| Empty state | Shows "No comments yet. Start a thread below." | ✅ |
| Composer | Section picker (when no focus) + textarea + Post | ✅ |
| Post comment | Round-trips through `addCommentAction`; appears in list | ✅ |
| Reply | One level deep; deeper replies rejected by server | ✅ |
| Resolve / Reopen | Top-level only; staff only | ✅ |
| Soft-delete | Hides from list; replies stay on parent (server-side) | ✅ |
| Inline edit | Author-only (server enforces); other staff don't see "Edit" | ✅ |
| Realtime | Second tab sees inserts / updates / deletes without refresh | ✅ |
| Show resolved toggle | Resolved threads hidden by default; visible when toggled | ✅ |
| Drawer mutex | Opening Comments closes the other right-side drawers | ✅ |
| Escape | Closes the Comments drawer | ✅ |

## Deferred (M1 candidates)

- **Reviewer-side authoring.** Server-side glue (share-link JWT carries
  `cmt: 'rw'`) is in place. The reviewer-side write module (gated on
  the JWT, using the service-role client) and the `/share/<token>`
  rendering of the drawer are not yet shipped — staff comments work
  end-to-end in the editor today.
- **Canvas pin overlay.** Each section with at least one open thread
  should render a small pin in `SelectionLayer`/`CompositionInserters`
  that opens the drawer pre-scoped via `openCommentsForSection`. The
  open/close API supports it; the visual pin is the next surface.
- **Profile resolver for staff author labels.** Today staff comments
  render as `Staff · <id>[0..6]`. A profile-id → display name lookup
  (already exists for `cms_page_revisions.changedBy`) wires through
  for parity.
- **@mentions.** `mentions UUID[]` column reserved on the table for the
  picker UI.
- **Notification fan-out.** Out of scope for v1 by intent; revisit when
  the platform notification surface lands.

## QA prerequisites

1. Apply migration `20260702120000_cms_p11_m0_section_comments.sql` to
   the target environment.
2. Refresh the supabase Realtime publication (`ALTER PUBLICATION
   supabase_realtime ADD TABLE public.cms_section_comments`) — the
   migration handles this idempotently, but local dev environments
   without the publication will simply skip.
3. Open the editor on `/` with at least one section in the canvas, then
   click the comment-bubble icon in the topbar.

## Out-of-scope notes

- Multi-page (Phase 24): the `page_id` FK already does the right thing;
  no schema change needed when multi-page lights up.
- Attachments: use linked media via the existing assets library — the
  comment body is plain text in v1 by intent.
