# Phase 11 — In-context comments (charter)

**Status:** Deferred from the autonomous run on 2026-04-25. The schema + UX surface area is too large to land in a single autonomous block; this charter freezes the design so a follow-up session can pick it up cleanly.

## Goal

Operators (and reviewers visiting via a share link) can attach threaded comments to specific sections of the homepage from within the editor chrome. Comments resolve, mention, and notify; they round-trip via Supabase Realtime so two operators see each other's threads live.

## Scope

### Schema (one migration)
- `cms_section_comments`
  - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
  - `tenant_id UUID NOT NULL REFERENCES tenants`
  - `page_id UUID NOT NULL REFERENCES cms_pages`
  - `section_id UUID NOT NULL` (free-form — sections live in JSONB so no FK)
  - `parent_comment_id UUID REFERENCES cms_section_comments` — null for top-level threads
  - `body TEXT NOT NULL` — markdown-lite, rendered safely
  - `author_id UUID NOT NULL REFERENCES auth.users`
  - `author_kind TEXT CHECK (author_kind IN ('staff', 'reviewer'))` — share-link reviewers don't have an `auth.users` row, so reviewers store their JWT-claim display name in a sibling table
  - `resolved_at TIMESTAMPTZ` / `resolved_by UUID`
  - `mentions UUID[] DEFAULT '{}'`
  - `created_at`, `updated_at`
- `cms_share_link_reviewers` — display-name + JWT id mapping for non-staff authors
- RLS: tenant isolation on staff side; reviewers gated by share-link JWT claim (extend `ShareClaims` with `comment: 'rw' | 'r' | 'none'`)
- Realtime: enable on `cms_section_comments`, scoped per-page channel

### Server actions
- `addCommentAction({ pageId, sectionId, body, parentCommentId? })` — staff or reviewer
- `editCommentAction({ commentId, body })` — author-only
- `resolveCommentAction({ commentId })` — staff-only
- `deleteCommentAction({ commentId })` — author or staff (soft delete)
- `listCommentsAction({ pageId })` — initial paint; thereafter Realtime

### UI
- `CommentsDrawer` — right-side drawer like the others; lists all open threads, filterable by section
- `CommentPin` — floating pin on the canvas next to each section that has comments; opens the drawer scoped to that section
- `MentionsPicker` — `@` autocomplete from staff list (skip for v1 if scope-creep)
- Topbar pill — count of unresolved comments, opens drawer
- Realtime channel — single subscription per page; optimistic adds with rollback

### JWT extension
- `ShareClaims.comment` claim: `'none' | 'r' | 'rw'`
- Existing share-link mint flow needs a "Allow comments" checkbox in `share-popover.tsx`
- Reviewer sees a streamlined version of the drawer (read-only or read-write)

## Why deferred from this run

- **Schema pivot risk** — comment threading + share-link reviewer identity is not a 30-line migration; it needs deliberate review of RLS policies before committing to a shape.
- **Realtime is async-flavored** — the existing editor flow is request/response. Adding a live-channel subscription for a single feature warrants a small infra pass (channel naming, cleanup on unmount, leaderless reconnect).
- **JWT reviewer flow has security implications** — letting a share-link holder write comments means the JWT becomes a credential that lasts for its TTL. Want a clean audit row for every reviewer-authored comment, separate from staff actions.

## Acceptance criteria (when the follow-up runs)

- Migration applied; RLS policies tested with both staff and reviewer JWT flows
- Add/edit/resolve/delete server actions guarded with `requireStaff` (staff side) and `requireShareLinkClaim('comment', 'rw')` (reviewer side — new helper)
- Drawer + canvas pins render only inside `?edit=1` chrome
- Realtime: opening the drawer in two browser tabs shows new comments without refresh
- TypeScript clean
- Documented in `docs/qa/phase-11/README.md` with the same acceptance-matrix style as phases 9, 10, 12
- Decision-log entry with the chosen author-kind / RLS shape

## Estimated size

- Migration: ~120 lines
- Server actions: ~250 lines
- UI components: ~600 lines (drawer + pin + popover)
- JWT + share-link wiring: ~80 lines
- Tests/QA scaffolding: ~150 lines

Roughly a full session block, plus a follow-up for Realtime polish.
