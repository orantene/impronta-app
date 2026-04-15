# Dashboard UX / Design System Spec

This document defines the dashboard shell, layout, components, responsive behavior, state language, and cross-role consistency patterns that sit on top of the Inquiry Workflow Engine. Where workflow behavior is concerned, the engine spec is the source of truth.

This is a normative, enforceable UX architecture document. It documents what patterns already exist, standardizes them, resolves inconsistencies, sets rules for new screens, and becomes the reference used before building or redesigning any dashboard surface.

## Audience

- Developers building or modifying dashboard surfaces
- Product and design reviewing consistency and interaction quality
- QA validating dashboard behavior against a stable contract
- Future contributors onboarding into the system

## Relationship To The Engine Spec

The separation is deliberate:

- Engine spec = behavior truth
- Dashboard UX spec = presentation and interaction truth

This document does not redefine workflow rules, permissions, or database invariants. It defines how those rules are presented and interacted with in the product.

Current engine truth in this repo is represented by:

- [`docs/architecture-truth.md`](architecture-truth.md)
- [`web/src/lib/inquiry/inquiry-engine.ts`](../web/src/lib/inquiry/inquiry-engine.ts)
- [`web/src/lib/inquiry/inquiry-lifecycle.ts`](../web/src/lib/inquiry/inquiry-lifecycle.ts)

## What This Document Does Not Define

- Workflow engine rules
- Database schema rules
- Permission logic
- Pixel-perfect visual comps
- General product strategy

## Non-Negotiable Rules

These are the hard contract. Every dashboard surface must comply. No exceptions without a documented decision-log entry.

1. No custom UI patterns outside Section C allowed/forbidden rules.
2. All navigation must be URL-driven.
3. All workflow mutations must sync with server before UI finalizes.
4. No stale UI after mutations. Stale state is a bug.
5. Exactly one primary action may use the gold treatment per screen.
6. All drawers must use `DashboardEditPanel` with URL sync via `apanel` and `aid`.
7. No horizontal-scrolling tables on mobile.
8. No hover-dependent interactions.
9. No actions hidden only on hover.
10. The primary action must be visible without requiring hover, scrolling through multiple sections, or expanding secondary panels. Use a sticky action area if screen height constrains visibility.
11. Server is the single source of truth for all workflow-critical state.

## Implementation Priority

When building against this spec, implement in this order:

1. Sections A-H: structure and patterns
2. Sections K-L: interaction and navigation behavior
3. Sections M-N: forms and recovery
4. Section O: server synchronization
5. Sections I, J, P, R: invariants, AI, governance, QA
6. Sections Q, S: reference and enforcement tables

## A. Shell And Navigation

This section defines the dashboard frame itself: shell ownership, navigation structure, header composition, sticky offsets, and mobile navigation behavior.

### Primary source files

- [`web/src/app/(dashboard)/layout.tsx`](../web/src/app/(dashboard)/layout.tsx)
- [`web/src/app/(dashboard)/admin/layout.tsx`](../web/src/app/(dashboard)/admin/layout.tsx)
- [`web/src/app/(dashboard)/admin/admin-workspace-shell.tsx`](../web/src/app/(dashboard)/admin/admin-workspace-shell.tsx)
- [`web/src/app/(dashboard)/client/layout.tsx`](../web/src/app/(dashboard)/client/layout.tsx)
- [`web/src/app/(dashboard)/talent/layout.tsx`](../web/src/app/(dashboard)/talent/layout.tsx)
- [`web/src/components/prototype/admin-prototype-shell.tsx`](../web/src/components/prototype/admin-prototype-shell.tsx)
- [`web/src/components/dashboard/dashboard-nav-links.tsx`](../web/src/components/dashboard/dashboard-nav-links.tsx)
- [`web/src/components/dashboard/dashboard-mobile-menu.tsx`](../web/src/components/dashboard/dashboard-mobile-menu.tsx)
- [`web/src/components/dashboard/dashboard-page-header.tsx`](../web/src/components/dashboard/dashboard-page-header.tsx)
- [`web/src/components/admin/admin-page-header.tsx`](../web/src/components/admin/admin-page-header.tsx)
- [`web/src/components/dashboard/workspace-sticky-shell.tsx`](../web/src/components/dashboard/workspace-sticky-shell.tsx)
- [`web/src/lib/dashboard/architecture.ts`](../web/src/lib/dashboard/architecture.ts)
- [`web/src/lib/prototype/admin-prototype-nav.ts`](../web/src/lib/prototype/admin-prototype-nav.ts)
- [`web/src/lib/dashboard-shell-classes.ts`](../web/src/lib/dashboard-shell-classes.ts)

### Rules

- `/admin/*` must use the admin shell and must not render the shared client/talent shell.
- Client and talent routes must use the shared `(dashboard)` shell.
- Desktop sidebar must remain `w-72`, sticky, and persistent for long-scroll pages.
- The top bar must remain sticky at the top of the viewport and must own global controls, not page-specific actions.
- Admin top bar may include command palette, theme, inspector, and shortcuts. Client and talent top bars must stay lighter.
- Admin pages must use [`web/src/components/admin/admin-page-header.tsx`](../web/src/components/admin/admin-page-header.tsx).
- Client and talent pages must use [`web/src/components/dashboard/dashboard-page-header.tsx`](../web/src/components/dashboard/dashboard-page-header.tsx).
- Mobile navigation must use the documented sheet/bottom-bar patterns. It must not invent route-local nav systems.
- Sticky action strips must use `DASHBOARD_STICKY_SHELL` or `DASHBOARD_STICKY_SHELL_COMPACT`.

### Allowed variation

- Admin may use a denser shell and additional contextual chrome.
- Client may simplify data density and expose fewer tools.
- Talent may use the status banner and mobile bottom tab bar.

### Forbidden

- Duplicating a second dashboard shell for a route family
- Replacing URL-backed navigation with local-only nav state
- Route-local sticky headers that compete with the global shell

## B. Layout System

This section defines dashboard geometry: width tiers, spacing rhythm, padding, card cadence, and responsive stacking behavior.

### Primary source files

- [`web/src/lib/dashboard-shell-classes.ts`](../web/src/lib/dashboard-shell-classes.ts)
- [`web/src/app/(dashboard)/layout.tsx`](../web/src/app/(dashboard)/layout.tsx)
- [`web/src/app/globals.css`](../web/src/app/globals.css)

### Width tiers

- Admin hub/list/detail default: `ADMIN_PAGE_WIDTH` and `ADMIN_PAGE_STACK`
- Client wide: `CLIENT_PAGE_STACK_WIDE`
- Client medium: `CLIENT_PAGE_STACK_MEDIUM`
- Client narrow: `CLIENT_PAGE_STACK_NARROW`
- Client detail: `CLIENT_PAGE_STACK_DETAIL`
- Talent: fluid main column inside the shared shell

### Rhythm and spacing

- Page-level vertical rhythm must use `space-y-8`.
- Grouped admin sections must use `space-y-3`.
- Form grids must use `gap-4`.
- Standard card padding is `p-4`.
- Embedded or inset surfaces use `p-3`.

### Radius rules

- Standard cards: `rounded-2xl`
- Group stages: `rounded-3xl`
- Pills and chips: `rounded-full`
- Form controls and secondary buttons: `rounded-xl`

### Mobile constraints

- No horizontal scrolling tables. Tables must collapse into cards using [`web/src/components/admin/admin-responsive-table.tsx`](../web/src/components/admin/admin-responsive-table.tsx).
- All interactive elements must be at least `44px` high on mobile.
- No multi-column layouts below `md`.
- Sticky elements must not overlap bottom navigation.
- Bottom padding must account for bottom nav height and safe area inset.
- No hover-dependent interactions.
- No actions hidden only on hover.
- Primary action must be visible without requiring deep scrolling when practical. If layout constraints prevent that, use a sticky action area.

## C. Reusable Interaction Patterns

This section defines the approved building blocks. If a new screen invents a different pattern, it is non-compliant unless explicitly approved in the decision log.

### Primary source files

- [`web/src/components/ui/card.tsx`](../web/src/components/ui/card.tsx)
- [`web/src/components/ui/drawer.tsx`](../web/src/components/ui/drawer.tsx)
- [`web/src/components/ui/action-bar.tsx`](../web/src/components/ui/action-bar.tsx)
- [`web/src/components/ui/filter-chips.tsx`](../web/src/components/ui/filter-chips.tsx)
- [`web/src/components/admin/admin-page-tabs.tsx`](../web/src/components/admin/admin-page-tabs.tsx)
- [`web/src/components/admin/admin-status-tabs.tsx`](../web/src/components/admin/admin-status-tabs.tsx)
- [`web/src/components/admin/admin-filter-bar.tsx`](../web/src/components/admin/admin-filter-bar.tsx)
- [`web/src/components/admin/admin-responsive-table.tsx`](../web/src/components/admin/admin-responsive-table.tsx)
- [`web/src/components/dashboard/dashboard-edit-panel.tsx`](../web/src/components/dashboard/dashboard-edit-panel.tsx)
- [`web/src/lib/dashboard-shell-classes.ts`](../web/src/lib/dashboard-shell-classes.ts)
- [`web/docs/admin-ux-architecture.md`](../web/docs/admin-ux-architecture.md)

### Tabs

Allowed:

- `ADMIN_TAB_BAR`
- `ADMIN_TAB_ITEM`
- [`web/src/components/admin/admin-page-tabs.tsx`](../web/src/components/admin/admin-page-tabs.tsx)
- [`web/src/components/admin/admin-status-tabs.tsx`](../web/src/components/admin/admin-status-tabs.tsx)

Forbidden:

- Custom tab UIs that do not use `ADMIN_TAB_*` tokens
- Inline tab bars with one-off border/background styling
- Hover-only tab affordances

Rules:

- Mobile tabs must support horizontal snap scrolling.
- Active state must use the gold border/background treatment.
- Tap target must stay at least `44px` tall on mobile.

### Cards

Allowed:

- `Card` for generic surfaces
- `ADMIN_EXPANDABLE_GROUP_CARD` for expandable config groups
- `ADMIN_LIST_TILE_HOVER` for clickable list rows
- `ADMIN_GROUP_LIST_STAGE` for grouped admin stages

Forbidden:

- Ad-hoc card wrappers with one-off border, shadow, and radius styles
- Mixing radius tiers without intent

Rules:

- Content cards are `rounded-2xl`.
- Stage/background containers are `rounded-3xl`.
- Cards must not become layout containers for unrelated navigation behavior.

### Drawers

Allowed:

- `DashboardEditPanel`
- The `Drawer`/`Sheet` primitives that compose into that system

Forbidden:

- A second drawer system
- Stacked drawers on the same view
- Slide-overs without URL sync

Rules:

- Drawers must sync to `apanel` and `aid`.
- Closing a drawer must clear drawer URL params.
- Drawer width must use the documented width tiers in [`web/docs/admin-ux-architecture.md`](../web/docs/admin-ux-architecture.md).

### Tables

Allowed:

- [`web/src/components/admin/admin-responsive-table.tsx`](../web/src/components/admin/admin-responsive-table.tsx)

Forbidden:

- Desktop-only tables with no mobile fallback
- Horizontal-scrolling tables on mobile
- Tables that hide key data behind hover-only row actions

Rules:

- Columns must declare `priority: "high" | "low"`.
- High-priority cells must always render in mobile cards.
- Low-priority cells may move behind "Show more".

### Filter bars and chips

Allowed:

- [`web/src/components/admin/admin-filter-bar.tsx`](../web/src/components/admin/admin-filter-bar.tsx)
- [`web/src/components/ui/filter-chips.tsx`](../web/src/components/ui/filter-chips.tsx)
- URL-backed filter state

Forbidden:

- Ad-hoc filter toolbars
- Non-URL-synced filters
- Custom chip implementations for the same role

Rules:

- Filter state must survive refresh and deep linking.
- Mobile filter bars must collapse rather than overflow.
- Chips must keep the documented selected/idle semantics and focus treatment.

### Action bars

Allowed:

- [`web/src/components/ui/action-bar.tsx`](../web/src/components/ui/action-bar.tsx)

Forbidden:

- One-off action-bar layouts for standard list or header flows

Rules:

- On mobile, action bars stack vertically.
- On desktop, primary action aligns consistently and stays obvious.

### Search

Rules:

- Search state must be URL-driven.
- AI-backed search should use `250-400ms` debounce.
- Client-side local filtering may update immediately.

## D. State Language

This section defines how product state is visually communicated. Workflow meaning comes from the engine; appearance comes from this spec.

### Primary source files

- [`web/src/lib/admin/status-badge-classes.ts`](../web/src/lib/admin/status-badge-classes.ts)
- [`web/src/components/admin/admin-commercial-status-badge.tsx`](../web/src/components/admin/admin-commercial-status-badge.tsx)
- [`web/src/components/ui/badge.tsx`](../web/src/components/ui/badge.tsx)
- [`web/src/lib/dashboard-shell-classes.ts`](../web/src/lib/dashboard-shell-classes.ts)

### Badge semantics

| Meaning | Visual family | Examples |
|---|---|---|
| New / default / unclassified | Gray | `new`, `registered` |
| Active / in-progress / waiting | Blue | `reviewing`, `waiting_for_client`, `in_progress`, `coordination` |
| Qualified / escalated | Purple | `qualified` |
| Confirmed / completed / booked | Green | `approved`, `booked`, `confirmed`, `completed` |
| Rejected / failed / cancelled | Red | `rejected`, `expired`, `cancelled`, `closed_lost` |
| Draft / archived / dormant | Muted | `draft`, `archived`, `closed` |

### Rules

- Statuses must use the documented badge system, not ad-hoc label colors.
- `TagBadge` is informational. It is not a workflow state.
- `StatusBadge` is semantic and must map to state meaning.
- `booked` must read as confident resolution, not as neutral metadata.
- `waiting_on_client` must remain visually distinct from failed or rejected states.
- Error surfaces must use `ADMIN_ERROR_CARD`.
- Success surfaces must use `ADMIN_ALERT_SUCCESS`.
- Color must not be light-theme only; dark-mode parity is required.

## E. View-State Standards

This section defines empty, loading, error, partial-data, and permission-limited states.

### Primary source files

- [`web/src/components/ui/empty-state.tsx`](../web/src/components/ui/empty-state.tsx)
- [`web/src/components/ui/skeleton.tsx`](../web/src/components/ui/skeleton.tsx)
- [`web/src/components/admin/admin-error-state.tsx`](../web/src/components/admin/admin-error-state.tsx)
- [`docs/ui-interaction-standards.md`](ui-interaction-standards.md)

### Rules

- Empty states must use [`web/src/components/ui/empty-state.tsx`](../web/src/components/ui/empty-state.tsx).
- Empty copy must explain why the area is empty.
- Zero-results filters must be distinguished from true no-data states.
- Skeletons are preferred over blank regions.
- AI-only surfaces use a skeleton threshold of roughly `150ms`.
- Above-the-fold content must render immediately.
- Secondary data must load in isolated boundaries such as Suspense.
- A single failed section must not block the entire page.
- Errors must offer recovery, not just explanation.
- Permission-limited states must keep layout structure visible and remove or disable disallowed actions.

## F. Inquiry List, Queue, And Workspace Patterns

Inquiry is the product core. This section defines how inquiry state appears in queue views and detail workspaces without duplicating engine semantics.

### Primary source files

- [`web/src/app/(dashboard)/admin/inquiries/page.tsx`](../web/src/app/(dashboard)/admin/inquiries/page.tsx)
- [`web/src/app/(dashboard)/admin/inquiries/admin-inquiry-queue.tsx`](../web/src/app/(dashboard)/admin/inquiries/admin-inquiry-queue.tsx)
- [`web/src/app/(dashboard)/client/client-inquiry-list.tsx`](../web/src/app/(dashboard)/client/client-inquiry-list.tsx)
- [`web/src/app/(dashboard)/talent/inquiries/page.tsx`](../web/src/app/(dashboard)/talent/inquiries/page.tsx)
- [`web/src/components/inquiry/inquiry-message-thread.tsx`](../web/src/components/inquiry/inquiry-message-thread.tsx)
- [`web/src/components/admin/admin-inquiry-peek-sheet.tsx`](../web/src/components/admin/admin-inquiry-peek-sheet.tsx)
- [`web/src/lib/inquiries.ts`](../web/src/lib/inquiries.ts)
- [`web/src/lib/inquiry/inquiry-lifecycle.ts`](../web/src/lib/inquiry/inquiry-lifecycle.ts)
- [`web/src/lib/inquiry/inquiry-engine-submit.ts`](../web/src/lib/inquiry/inquiry-engine-submit.ts)

### Rules

- Admin inquiry queues must use the tab-filtered table pattern.
- Client inquiry lists may use a calmer timeline layout.
- Talent inquiry lists must use cards, not tables.
- `next_action_by` must render as a clear role cue when available.
- Unread state must be visible in the list row, not hidden in the detail view only.
- Priority must be visible and distinct from status.
- Mobile inquiry lists must remain card-based.
- Inquiry detail order should prioritize status/actions, then messages, then roster, then offers, then booking conversion.
- Secondary preview actions may use the peek drawer pattern via `apanel=peek`.

## G. Cross-Role Consistency

This section prevents the admin, client, and talent experiences from drifting into separate products.

### Primary source files

- [`web/src/lib/dashboard/architecture.ts`](../web/src/lib/dashboard/architecture.ts)
- [`web/src/app/(dashboard)/layout.tsx`](../web/src/app/(dashboard)/layout.tsx)
- [`web/src/components/prototype/admin-prototype-shell.tsx`](../web/src/components/prototype/admin-prototype-shell.tsx)

### Shared across roles

- Brand token family from [`web/src/app/globals.css`](../web/src/app/globals.css)
- `Card`, `Badge`, `StatusBadge`, `TagBadge`, `ActionBar`, `FilterChips`, `EmptyState`
- Shared spacing rhythm and radius system
- Shared state language semantics

### Role-specific variation

- Admin may be denser and more operational.
- Client must stay calmer and more guided.
- Talent must stay profile- and status-centric.

### Rules

- Only workflow complexity, permissions, and information density should vary by role.
- Page headers should feel related across roles.
- Badges must mean the same thing across roles even if copy is simplified.
- Drawers and tabs must behave consistently if they exist in multiple roles.
- Shared logic belongs in `ui/*` or `components/dashboard/*`, not in role-specific wrappers.

## H. Visual Hierarchy, Action Strategy, And Attention Rules

This section defines how attention is prioritized inside dense dashboard surfaces.

### Primary source files

- [`web/src/lib/dashboard-shell-classes.ts`](../web/src/lib/dashboard-shell-classes.ts)
- [`web/src/app/globals.css`](../web/src/app/globals.css)

### Typography hierarchy

- Display font: page and section titles
- Sans font: body copy, forms, labels
- Mono font: technical values, IDs, machine-like strings
- Table headers and dense metadata should stay smaller than action labels

### Primary action strategy

- Each screen must have exactly one primary action using the gold treatment.
- Secondary actions use outline styling.
- Tertiary actions use muted/ghost styling.
- Two gold buttons on the same screen are forbidden.

### Attention hierarchy

1. Blocking states and required actions
2. Primary workflow action
3. Status indicators
4. Supporting data
5. Metadata

### Rules

- Metadata must not visually compete with the primary action.
- Gold signals action and selection, not decoration.
- KPI strips should highlight essential metrics only.
- Admin surfaces may be denser, but primary workflow cues must still win visually.

## I. UX Invariants

This section states what must be true everywhere. It does not restate how those rules are implemented; authoritative detail lives in Sections E, K, M, and O.

### Invariants

- Every list view has loading, empty, and error states.
- Every page uses the correct shell and approved header.
- Every page respects width tiers and mobile constraints.
- Every page defines above-the-fold content and deferred content.
- Every actionable workflow screen shows status and a clear primary action.
- Every form complies with Section M.
- Every drawer complies with Section C.

## J. AI Surface Rules

AI is progressive enhancement. It must not degrade clarity or workflow trust.

### Primary source files

- [`web/src/components/ai/ai-error-boundary.tsx`](../web/src/components/ai/ai-error-boundary.tsx)
- [`docs/ai-fallback-ux.md`](ai-fallback-ux.md)
- [`docs/ai-component-system.md`](ai-component-system.md)

### Rules

- AI is advisory only.
- AI must not modify workflow state automatically.
- AI must not override system data.
- AI must not replace primary actions.
- AI must not introduce ambiguity into workflow state.
- AI must not alter or reinterpret system-derived values without explicit user confirmation.
- AI output must be visually separated from system data.
- AI subtrees must be wrapped in `AIErrorBoundary`.
- AI loading uses skeletons, not blocking spinners.
- AI failure must leave the core manual path intact.

## K. Interaction Contracts

This is the authoritative section for async behavior lifecycle, blocking explanations, confirmations, and concurrency behavior. It does not define form-specific rules or server sync strategy.

### Async action contract

Every async action must follow this sequence:

1. User triggers action.
2. UI shows immediate feedback on the trigger.
3. UI enters optimistic or locked state depending on eligibility.
4. Server result resolves to success or rollback.

### Mutation feedback contract

- Success must produce immediate visible confirmation.
- Error must produce an inline error or toast with retry affordance.

### Optimistic update rules

Optimistic updates are permitted only for non-critical UI state:

- Read/unread flags
- Local sorting/filtering
- UI preferences

Optimistic updates are forbidden for:

- Inquiry lifecycle state
- Offer state
- Approval state
- Booking state
- Roster changes
- Staff assignment

All workflow mutations must confirm with server before UI reflects final state.

### Blocking state contract

- Disabled workflow actions must explain why.
- Explanation may be a tooltip, inline message, or blocker card.
- Silent disabling is forbidden.

### Critical action visibility rule

Critical actions such as submit, approve, send, and convert must never be:

- Hidden behind hover-only interactions
- Buried inside secondary menus without clear access
- Dependent on non-obvious UI affordances

If screen height prevents visible access to the primary action, a sticky action area must be used.

### Confirmation contract

- Destructive or irreversible actions require confirmation.
- Confirmation must name the action and consequence.
- Confirmation must provide an explicit cancel path.

### Concurrency conflict contract

If a mutation fails due to version mismatch or concurrent update:

- UI must notify the user.
- UI must refresh or refetch.
- UI must not silently overwrite newer server state.
- User must re-apply the action against the refreshed state if still needed.

## L. Navigation Behavior Rules

This section defines how navigation behaves, not just where nav components sit.

### Rules

- In-dashboard navigation must be instant and client-side when possible.
- Back navigation must restore prior screen state where possible.
- Tabs, filters, drawers, search, and sort must be URL-driven.
- Sharing a URL must reproduce the same state except for auth-protected data.
- Closing a drawer clears its URL params.
- Clearing a filter clears its URL param.
- Pages must not leave orphan query params behind.

## M. Form Behavior System

This is the authoritative section for form-specific behavior only. It does not define async lifecycle or server authority.

### Rules

- Save must be explicit unless a feature explicitly documents autosave.
- Submit must disable while processing and show loading state.
- Validation errors must be inline, not toast-only.
- Required fields must be identifiable before submit.
- Server validation errors must map to fields where possible.
- Failed submit must preserve user input.
- Success must produce inline feedback, toast, redirect, or other explicit completion signal.
- Draft and committed state must be visually distinct where both exist.

### Form tokens

- `ADMIN_FORM_CONTROL`
- `ADMIN_FORM_FIELD_STACK`
- `ADMIN_FORM_GRID_GAP`

## N. Error Recovery Rules

This section defines recovery behavior rather than visual error appearance.

### Rules

- Every error must offer retry, fallback, or alternative path.
- The UI must never dead-end the user.
- Failed action flows must preserve input and support retry.
- Failed page loads must render an error surface with recovery.
- Failed drawer saves must keep the drawer open with state preserved.
- Background failures should expose a manual path where one exists.
- Offline and server errors should be distinguished where practical.

### Edge cases requiring explicit behavior

- Empty roster
- Partial approval
- Failed booking conversion
- Slow network

## O. State Synchronization Rules

This is the authoritative section for how the UI obtains and maintains server truth. It does not define feedback lifecycle or optimistic eligibility.

### Server authority rule

For all workflow-critical state, including inquiry status, offers, approvals, booking, roster, and staff assignment:

- Server is the single source of truth.
- Client must never finalize or persist workflow state without server confirmation.
- Any client/server divergence must be resolved by reconciling to server state.

### Sync rules

- No hidden client-only state for critical workflow data.
- UI must not present workflow state as final until server confirmation is received.
- After workflow mutations, the UI must refresh or revalidate from server truth.
- `router.refresh()` or `revalidatePath()` are the default sync mechanisms for server-rendered parents.
- Concurrency conflicts follow the Section K conflict contract.

## P. Governance Rules

This section keeps the spec alive without overcomplicating it.

### Rules

- New dashboard screens must use documented patterns unless a justified exception is approved.
- Exceptions must be documented in [`docs/decision-log.md`](decision-log.md) before shipping.
- One-off patterns used on three or more surfaces should be extracted and added to this spec.
- New primitives should be adopted on real surfaces before being treated as standard.
- Conflicts between new work and the spec must be resolved in the spec before divergent patterns ship.

## Q. Source File Mapping

This section maps the main spec areas to the files and tokens that currently define truth.

| Area | Authoritative files | Status |
|---|---|---|
| Shell and navigation | [`web/src/app/(dashboard)/layout.tsx`](../web/src/app/(dashboard)/layout.tsx), [`web/src/components/prototype/admin-prototype-shell.tsx`](../web/src/components/prototype/admin-prototype-shell.tsx), [`web/src/lib/dashboard/architecture.ts`](../web/src/lib/dashboard/architecture.ts) | Codifying existing |
| Layout system | [`web/src/lib/dashboard-shell-classes.ts`](../web/src/lib/dashboard-shell-classes.ts), [`web/src/app/globals.css`](../web/src/app/globals.css) | Codifying existing |
| Reusable patterns | [`web/src/components/ui/`](../web/src/components/ui), [`web/src/components/admin/admin-responsive-table.tsx`](../web/src/components/admin/admin-responsive-table.tsx), [`web/src/components/admin/admin-filter-bar.tsx`](../web/src/components/admin/admin-filter-bar.tsx), [`web/src/components/dashboard/dashboard-edit-panel.tsx`](../web/src/components/dashboard/dashboard-edit-panel.tsx) | Codifying existing and resolving drift |
| State language | [`web/src/lib/admin/status-badge-classes.ts`](../web/src/lib/admin/status-badge-classes.ts), [`web/src/components/ui/badge.tsx`](../web/src/components/ui/badge.tsx) | Codifying existing |
| View states | [`web/src/components/ui/empty-state.tsx`](../web/src/components/ui/empty-state.tsx), [`web/src/components/ui/skeleton.tsx`](../web/src/components/ui/skeleton.tsx), [`web/src/components/admin/admin-error-state.tsx`](../web/src/components/admin/admin-error-state.tsx) | Codifying existing |
| Inquiry surfaces | [`web/src/app/(dashboard)/admin/inquiries/page.tsx`](../web/src/app/(dashboard)/admin/inquiries/page.tsx), [`web/src/app/(dashboard)/client/client-inquiry-list.tsx`](../web/src/app/(dashboard)/client/client-inquiry-list.tsx), [`web/src/app/(dashboard)/talent/inquiries/page.tsx`](../web/src/app/(dashboard)/talent/inquiries/page.tsx) | Standardizing inconsistency |
| Visual hierarchy | [`web/src/lib/dashboard-shell-classes.ts`](../web/src/lib/dashboard-shell-classes.ts), [`web/src/app/globals.css`](../web/src/app/globals.css) | Standardizing inconsistency |
| Interaction contracts | [`web/docs/admin-ux-architecture.md`](../web/docs/admin-ux-architecture.md), server action flows in dashboard routes | Resolving gap |
| Navigation behavior | URL-backed dashboard routes and `apanel` contract in [`web/docs/admin-ux-architecture.md`](../web/docs/admin-ux-architecture.md) | Resolving gap |
| Forms, recovery, sync | [`web/src/lib/dashboard-shell-classes.ts`](../web/src/lib/dashboard-shell-classes.ts), dashboard server actions, inquiry engine flows | Resolving gap |

## R. QA Checklist

Every new or modified dashboard surface should pass this checklist:

- [ ] Correct shell for route family
- [ ] Approved page header component
- [ ] Tab bars use `ADMIN_TAB_*` tokens where applicable
- [ ] Mobile uses stacked cards, `44px` targets, and no horizontal table scrolling
- [ ] Empty, loading, and error states are covered
- [ ] Status badges use documented semantics
- [ ] Lists, tables, and filters reuse approved components
- [ ] Drawer uses `DashboardEditPanel` with URL sync
- [ ] Exactly one primary gold action
- [ ] Action hierarchy is clear
- [ ] Width tiers and spacing tokens are respected
- [ ] Attention hierarchy keeps metadata subordinate
- [ ] Dark-mode parity exists
- [ ] AI surfaces are non-blocking and advisory only
- [ ] Async actions follow Section K
- [ ] Navigation is URL-driven
- [ ] Forms use inline validation and explicit save
- [ ] Workflow mutations sync to server truth
- [ ] Error recovery avoids dead ends
- [ ] Conflict handling shows message and refreshes

## S. Allowed Vs Forbidden Summary

| Pattern | Allowed | Forbidden |
|---|---|---|
| Tabs | `ADMIN_TAB_*`, `AdminPageTabs`, `AdminStatusTabs` | Custom ad-hoc tab bars |
| Cards | `Card`, `ADMIN_EXPANDABLE_GROUP_CARD`, `ADMIN_LIST_TILE_HOVER`, `ADMIN_GROUP_LIST_STAGE` | One-off card wrappers |
| Drawers | `DashboardEditPanel` with `apanel`/`aid` | Second drawer system, stacked drawers |
| Tables | `AdminResponsiveTable` | Mobile horizontal scroll tables |
| Filter bars | `AdminFilterBar`, `FilterChips` | Ad-hoc non-URL-backed filters |
| Action bars | `ActionBar` | One-off standard header toolbars |
| Page headers | `AdminPageHeader`, `DashboardPageHeader` | Route-local custom header systems |
| Mobile actions | Visible, touch-accessible actions | Hover-only or hidden critical actions |
| AI loading | Isolated skeletons, advisory output | Blocking full-page AI dependence |
| Workflow state | Server-confirmed state only | Client-finalized workflow state |

## Queued Backlog

These topics are important but intentionally remain outside the core A-S spec until the main document is adopted:

- Security UX
- Audit and trace UX
- Accessibility baseline
- Performance budgets
- Motion rules
- Debug/dev UX
- Future-proofing
- Design token authority
- Component ownership rules
- Consistency enforcement layer

## Related Docs

- [`docs/ui-interaction-standards.md`](ui-interaction-standards.md)
- [`docs/ui-component-system.md`](ui-component-system.md)
- [`web/docs/admin-ux-architecture.md`](../web/docs/admin-ux-architecture.md)
- [`docs/architecture-truth.md`](architecture-truth.md)
- [`docs/ai-fallback-ux.md`](ai-fallback-ux.md)
- [`docs/ai-component-system.md`](ai-component-system.md)

No existing document is replaced by this one. This spec is additive and should be updated alongside dashboard changes.
