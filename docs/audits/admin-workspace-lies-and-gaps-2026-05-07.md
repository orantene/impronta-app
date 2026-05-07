# Agency Admin Workspace: Complete Audit of Mock Data, Hardcoded Lies & Missing Features
**Date:** 2026-05-07  
**Scope:** Agency admin workspace (`web/src/app/(workspace)/[tenantSlug]/admin/**`) + prototype shell (`web/src/app/prototypes/admin-shell/**`)  
**Exclusions:** Platform HQ, talent self-surface, client portal, page-builder edit-chrome internals, marketing pages

---

## Executive Summary

The admin workspace prototype is a **hybrid system**: some surfaces (roster, messages, clients, calendar, team, billing) are wired to real data via `_data-bridge.ts`; others are **100% mock-driven**. The prototype's own chrome (topbar, chrome strings, activity feed, notifications) displays hardcoded tenant/talent names, fabricated metrics, and static mock lists. A real-identity banner was added to surface truth above the chrome, but the chrome itself remains a lie.

**Visible lie zones (S1/S2):**
- Workspace name & metrics in topbar (`€4,200 pending · 3 confirmed`) — hardcoded constant
- All activity feed entries — hardcoded array with mock timestamps
- All notifications in the bell — hardcoded array, unread counts are static
- Operations page — 100% drawer stubs; no real data wired
- Production page — 100% drawer stubs; no real data wired
- Website page — mixed: shows real pages/posts from `WEBSITE_STATE` mock; metrics hardcoded

**Already-real inventory (wired):**
- Workspace roster (via `loadWorkspaceRosterForCurrentTenant`)
- Messages / inquiries (via `loadInquiriesForMessages`)
- Calendar events (via `loadCalendarEvents`)
- Clients list (via `loadWorkspaceClients`)
- Overview metrics (via `loadWorkspaceOverviewMetrics`) — **partially**; some counters fallback to hardcoded thresholds
- Team members (via `loadWorkspaceTeamMembers`)
- Bookings (via `loadWorkspaceBookings`)
- Unread count (via `loadTotalUnreadMessages`)
- Website pages/posts/domain (via `loadWebsiteData`) — **mixed**: real pages + hardcoded analytics

---

## Audit Tables by Surface

### 1. TOP BAR / CHROME (Cross-Cutting)

| Element | Type | Evidence | Real source available? | Severity | Effort | Notes |
|---------|------|----------|----------------------|----------|--------|-------|
| Workspace/agency name "Atelier Roma" | mock-string | `_state.tsx:3141` (`TENANT.name`) | Y — should read from session/tenant DB | S1 | XS | User sees different tenant after switch, but topbar keeps showing "Atelier Roma" |
| Initials "A" | mock-string | `_state.tsx:3145` (`TENANT.initials`) | Y — derive from TENANT.name | XS | User identity is wrong in all contexts |
| Acting detail `€4,200 pending · 3 confirmed` | mock-string | `_pages.tsx:1172` hardcoded in actingDetail | Y — compute from live overviewMetrics | S2 | S | Counter is stale; no real pending/confirmed signal |
| User name "Marta Reyes" / name flips with surface | mock-string | `_pages.tsx:1160` (`MY_TALENT_PROFILE.name` for talent, session.user for workspace) | Y — use session.user.display_name for all surfaces | S1 | XS | Topbar shows wrong identity when switching surfaces; XS if session fix applied |
| User initials | mock-string | `_pages.tsx:1161` | Y — derive from session.user | XS | Same as above |
| Plan badge "Agency" | mock-string | `_state.tsx:state.plan` | Y — read from billing schema | S2 | S | Doesn't reflect actual plan; shown inline with badge |
| Unread count badge in notifications | half-wired | `_pages.tsx:1181` (`bridgeTotalUnread > 0 ? bridgeTotalUnread : WORKSPACE_UNREAD`) | Y — `loadTotalUnreadMessages` is live | S2 | XS | Fallback to hardcoded `WORKSPACE_UNREAD` when bridge is null |
| `WORKSPACE_UNREAD` hardcoded constant | mock-data-array | `_state.tsx` (search for export) | Y — live signal available via bridge | S3 | XS | Fallback value; should be removed once bridge is always live |
| Domain display in topbar | mock-string | `_state.tsx:3143` (`TENANT.domain`) | Y — from workspace/tenant DB | S2 | XS | Shows "atelier-roma.tulala.app" regardless of actual domain |

---

### 2. OVERVIEW PAGE (Home)

| Element | Type | Evidence | Real source available? | Severity | Effort | Notes |
|---------|------|----------|----------------------|----------|--------|-------|
| Metrics card title row "27 talent · 3 awaiting approval · 2 coordinators" | half-wired | `_pages.tsx:2530–2565` | Y — `loadWorkspaceOverviewMetrics` + `effectiveRoster` | S2 | M | Mixes live roster with hardcoded overviewMetrics; pending counts are from bridge OR fallback to `RICH_INQUIRIES` |
| "€4,200 pending · 3 confirmed" summary | mock-string | `_pages.tsx:2579–2580` (hardcoded in metrics card) | Y — bridge metrics include openInquiries count; computation needed | S2 | M | Should read from overviewMetrics; no live revenue signal yet |
| "Views 7d: 284" storefront stat | mock-data-array | `_pages.tsx:471` (`MOCK_STOREFRONT_STATS`) | N — no analytics wired yet | S2 | L | Hardcoded; Operations/Analytics page owns the real signal |
| "+18% growth" badge | mock-string | Same as above | N | S2 | L | Paired with mock views |
| Recent activity section — 4 hardcoded entries (Oran, Marta, Kai, System) | mock-data-array | `_pages.tsx:2914–2920` (inline .map array with hardcoded actors/actions) | N — no activity log table yet | S2 | L | Timestamps are mock (`Date.now() - relativeTime`); names hardcoded |
| "View all" activity link | mock-action | `_pages.tsx:2902` (opens "team-activity" drawer) | Partial — drawer exists but shows RICH_INQUIRIES-derived activity | S3 | M | Drawer is also hardcoded; needs real activity log table |
| "Weekly digest" AI button | mock-action | `_pages.tsx:2880–2886` (opens "ai-weekly-digest" drawer) | N — AI module not wired | S3 | XL | Drawer is a stub |
| Activation checklist (5 tasks) | mock-data-array | `_pages.tsx:2955–2960` (loops over `ACTIVATION_TASKS`) | Y — can be wired to workspace flags (e.g., roster published, domain set, team invited) | S2 | M | Tasks are hardcoded; completion state is in proto state, not DB |
| Checklist progress bar (e.g., "3 of 5") | half-wired | Computed from hardcoded ACTIVATION_TASKS | Y — should compute from real setup flags | S2 | M | Matches hardcoded task count; reset on every page load |
| Free plan empty state | mock-action | `_pages.tsx:2952–3000` (different component for free plan) | Y — conditional on state.plan | S3 | M | Upgrade modals and CTAs are wired to openUpgrade; behavior is correct |
| Next booking label "X starts soon" | half-wired | `_pages.tsx:2566` (reads confirmedThisWeek array) | Y — bridge bookings available; should compute from real data | S2 | S | Falls back to RICH_INQUIRIES if bridge is null |

---

### 3. MESSAGES / INBOX / INQUIRY DETAIL

| Element | Type | Evidence | Real source available? | Severity | Effort | Notes |
|---------|------|----------|----------------------|----------|--------|-------|
| Inquiry list — all 5 RICH_INQUIRIES hardcoded | mock-data-array | `_state.tsx:1352–2910` (~1500 lines of mock inquiry data) | Y — `loadInquiriesForMessages` is live; bridge returns real rows | S2 | M | Fallback to RICH_INQUIRIES when bridge is null; real data overrides when available |
| Inquiry messages (client/talent/coordinator threads) | mock-data-array | `_state.tsx:1380–1430` (hardcoded message text inside each inquiry) | Y — messages table exists; needs bridge fetch | S2 | M | Each RICH_INQUIRY has a `messages` array with hardcoded bodies |
| Unread badges on inquiries | half-wired | `_state.tsx` (unreadPrivate, unreadGroup) | Y — messages table has read status | S2 | S | Hardcoded in mock; bridge should provide real counts |
| Coordinator assignment (e.g., "Sara Bianchi") | mock-string | `_state.tsx:1390–1396` (hardcoded coordinator object inside inquiry) | Y — coordinator assignments table exists | S2 | S | Should be fetched from inquiry detail; falls back to mock |
| Offer detail ("€2,500/day each", line items) | mock-data-array | `_state.tsx:1450–1500` (hardcoded offer object) | Y — bookings/offers table exists | S2 | M | Each inquiry has a mock offer with fabricated rates + line items |
| Requirement groups ("talent" role, 3 needed, 1 approved) | mock-data-array | `_state.tsx:1365–1375` (hardcoded requirementGroups array) | Y — inquiry_requirement_roles + related tables exist | S2 | M | Shows talent status (pending/accepted) from mock; should be real |
| Talent status icons (✓ accepted, ◯ pending) | mock-string | `_state.tsx:1368–1372` | Y | S2 | S | Hardcoded status values |
| Stage filters ("Open", "Closed", "Booked") | half-wired | `_pages.tsx:3549` (filters RICH_INQUIRIES by stage) | Y — bridge provides real inquiries with stage field | S2 | S | Logic is correct; falls back to mock when bridge is null |
| "Awaiting: 2 inquiries" counter | half-wired | `_pages.tsx:2530–2533` | Y — computed from real inquiries | S2 | XS | Same as metrics — fallback to RICH_INQUIRIES |

---

### 4. CALENDAR PAGE (Events / Shoots)

| Element | Type | Evidence | Real source available? | Severity | Effort | Notes |
|---------|------|----------|----------------------|----------|--------|-------|
| Calendar events (Mango shoot, Bvlgari campaign, etc.) | mock-data-array | `_pages.tsx:3928–3947` (parsed from RICH_INQUIRIES.date strings) | Y — `loadCalendarEvents` is live; bridge provides real rows | S2 | S | Mock fallback: parses human-readable date strings from RICH_INQUIRIES |
| Event day counts ("3 events on May 6") | half-wired | `_pages.tsx:4089` | Y — computed from real calendar events | S2 | XS | Fallback to mock event counts |
| Event detail (client name, location, talent count) | mock-data-array | Derived from RICH_INQUIRIES | Y | S2 | S | All event metadata comes from inquiry detail |
| Shoot status icons (submitted, coordination, confirmed) | mock-string | Hardcoded in event rendering | Y | S2 | XS | Status values from inquiry stage field |

---

### 5. ROSTER PAGE (Talent List + Detail)

| Element | Type | Evidence | Real source available? | Severity | Effort | Notes |
|---------|------|----------|----------------------|----------|--------|-------|
| Roster list (per-plan mock arrays fallback) | mock-data-array | `_state.tsx:6597–6627` (per-plan getRoster() arrays) | Y — `loadWorkspaceRosterForCurrentTenant` is live | S2 | XS | Properly wired; falls back to mock when bridge is null |
| Talent card (name, type, city, height, thumb, state) | half-wired | `_pages.tsx:4820–4900` (renders TalentProfile from effectiveRoster) | Y — bridge provides real rows; photos not yet wired | S2 | M | Thumbnail field is undefined in bridge output; renders fallback avatar+tint |
| "Published" / "Draft" / "Awaiting approval" state badges | half-wired | `_pages.tsx:4860–4880` | Y — bridge provides state field | S2 | XS | State is correctly mapped from DB; UI is live |
| Pending talent queue (amber badge on Roster tab) | half-wired | `_pages.tsx:558–615` | Y — `pendingTalent` array in proto state | S2 | S | Reads from SEED_PENDING_TALENT mock; should query DB |
| Roster filter buttons ("All", "Published", "Draft") | half-wired | `_pages.tsx:4842–4900` | Y — filter logic is correct | S2 | XS | Works on real data when available |
| Add talent button | mock-action | Opens "new-talent" drawer | Y — drawer exists | S3 | — | Drawer wiring is separate audit |
| Talent detail modal — measurements, specialties, languages, credits, reviews | half-wired | `_talent.tsx` & `_drawers.tsx` | Y — profile fields exist; photos not wired | S2 | M | All text fields wired correctly; photo URLs are undefined |
| "Marta Reyes" profile detail (demo talent) | mock-string | `_state.tsx:3809–4200` (`MY_TALENT_PROFILE`) | Y — read from DB | S1 | M | Hardcoded demo profile; should read from actual talent record |

---

### 6. CLIENTS PAGE (List + Detail)

| Element | Type | Evidence | Real source available? | Severity | Effort | Notes |
|---------|------|----------|----------------------|----------|--------|-------|
| Client list | half-wired | `_pages.tsx:6574–6600` | Y — `loadWorkspaceClients` is live | S2 | XS | Falls back to mock when bridge is null |
| Client card (name, industry, contact, logo, trust tier) | half-wired | `_pages.tsx` | Y — bridge provides rows | S2 | M | Logo/avatar thumbs not yet wired |
| Client detail drawer | half-wired | `_drawers.tsx` | Y — drawer exists; needs data binding | S2 | M | Drawer shows account history, bookings, trust state |
| "Martina Beach Club" / "The Gringo" hardcoded clients | mock-string | `_pages.tsx:1150–1155` (QA constants) | N — for testing only | S3 | XS | These are in topbar switcher for client surface testing; should be in test fixtures, not code |

---

### 7. OPERATIONS PAGE

| Element | Type | Evidence | Real source available? | Severity | Effort | Notes |
|---------|------|----------|----------------------|----------|--------|-------|
| **Entire page is a menu of drawer stubs** | empty-shell | `_pages.tsx:7045–7092` | N — no real data for any Operations surface | S1 | XL | 4 sections (Analytics, Workflow, Comms, Admin); 17 tool cards, all click → drawer stubs |
| Revenue analytics drawer | empty-shell | `_drawers.tsx:731` → `<WorkspaceRevenueDrawer />` | N — no revenue data source yet | S1 | L | Needs transaction table + aggregate queries |
| Conversion funnel drawer | empty-shell | `_drawers.tsx:733` → `<ConversionFunnelDrawer />` | N — no funnel data source | S1 | L | Needs inquiry stage distribution + time-in-stage metrics |
| Top performers drawer | empty-shell | `_drawers.tsx:734` → `<TopPerformersDrawer />` | N — no performer ranking data | S1 | L | Needs booking count + revenue aggregate per talent/client |
| Team workload drawer | empty-shell | `_drawers.tsx:735` → `<CoordinatorWorkloadDrawer />` | N — no queue/SLA data | S1 | L | Needs assignment table + response-time tracking |
| My queue drawer | empty-shell | `_drawers.tsx:740` → `<MyQueueDrawer />` | N | S1 | L | Same as above; coordinator-scoped |
| SLA timers drawer | empty-shell | `_drawers.tsx:741` → `<SlaTimersDrawer />` | N — no SLA rules or timer state | S1 | L | Needs SLA config table + timer triggers |
| Automation rules builder | empty-shell | `_drawers.tsx:742` → `<RulesBuilderDrawer />` | N — no rule engine yet | S1 | XL | Complex; needs rule schema + condition builder |
| Saved replies drawer | empty-shell | `_drawers.tsx:743` → `<SavedRepliesDrawer />` | N — no reply template table | S1 | M | Schema exists; just needs CRUD UI |
| Vacation handover drawer | empty-shell | `_drawers.tsx:744` → `<VacationHandoverDrawer />` | N — no absence/delegation table | S1 | M | Needs schedule + queue delegation logic |
| On-call rotation drawer | empty-shell | `_drawers.tsx:745` → `<OnCallRotationDrawer />` | N — no rotation schedule | S1 | L | Needs weekly schedule + escalation paths |
| Email templates, sequences, invite flow, referrals | empty-shell | `_drawers.tsx:748–751` (4 more drawers) | N — no email infrastructure | S1 | XL | Cross-module; needs email service integration |
| CSV import, migration assistant, AI workspace, feature controls | empty-shell | `_drawers.tsx:754–757` (4 more drawers) | N — no bulk ops or feature flag service | S1 | XL | Admin tools; high complexity |

---

### 8. PRODUCTION PAGE

| Element | Type | Evidence | Real source available? | Severity | Effort | Notes |
|---------|------|----------|----------------------|----------|--------|-------|
| **Entire page is a menu of drawer stubs** | empty-shell | `_pages.tsx:7094–7170` | N — no real data for any Production surface | S1 | XL | 4 sections (Casting, Crew, Rights, Lifecycle); 16 tool cards, all stubs |
| Casting flow, callback tracker, discovery feed, avail search | empty-shell | `_drawers.tsx:804–807` | N — no casting/callback data | S1 | XL | Requires casting round schema + talent availability |
| Crew booking, production timeline, call sheet, on-set check-in | empty-shell | `_drawers.tsx:823–826` | N — no crew/scheduling data | S1 | XL | Requires multi-discipline booking + real-time on-set status |
| Locations, brief builder, brand assets | empty-shell | `_drawers.tsx:828–830` | N — no location/brief/asset tables | S1 | L | Admin setup tables; medium priority |
| Usage tracker, relicense flow | empty-shell | `_drawers.tsx:839–840` | N — no rights-tracking schema | S1 | L | Requires media_usage_licenses table + expiry logic |
| Incident reports, disputes | empty-shell | `_drawers.tsx:843–844` | N — no incident/dispute tables | S1 | L | Legal/safety module; needed for safety compliance |
| Ownership transfer, minor account, approval flow | empty-shell | `_drawers.tsx:846–848` | N — no transfer/guardian/approval flows | S1 | L | Account lifecycle; needed for minors + workspace changes |

---

### 9. WEBSITE PAGE

| Element | Type | Evidence | Real source available? | Severity | Effort | Notes |
|---------|------|----------|----------------------|----------|--------|-------|
| Live URL display | half-wired | `_pages.tsx:7169` (reads from `WEBSITE_STATE.domain.primaryDomain`) | Y — `loadWebsiteData` provides real domain; WEBSITE_STATE is mock-only | S2 | M | Should read from real workspace domain settings; currently hardcoded in _state |
| Pages list (published, draft, scheduled counts) | half-wired | `_pages.tsx:7184–7185` (counts WEBSITE_STATE.pages by status) | Y — real pages available via bridge; mocked for display | S2 | M | WEBSITE_STATE is a hardcoded mock; bridge provides real pages |
| Website analytics KPI tiles (page views, conversion, bounce rate) | mock-data-array | `_pages.tsx:7192–7194` (reads from `w.analytics` mock object) | N — no analytics service yet | S2 | L | Website performance metrics require analytics platform integration |
| "Views 7d: 284, +18% growth" | mock-string | `_pages.tsx:471` (`MOCK_STOREFRONT_STATS`) | N | S2 | L | Same hardcoded mock as Overview page |
| Pages performance funnel ("4.2K → 1.8K → 890") | mock-data-array | `_pages.tsx` in `WebsitePerformance` component | N — derived from mock analytics | S2 | L | Should read from real analytics; needs integration |
| Maintenance mode banner + bypass token | mock-string | `_pages.tsx:7213–7216` (reads from `w.maintenance.enabled` and `w.maintenance.bypassToken`) | Y — maintenance mode schema exists; currently mocked | S2 | M | Should read from real workspace settings |
| Announcement banner | mock-string | `_pages.tsx:7220–7225` (reads from `w.announcement` mock) | Y — schema exists | S2 | M | Should read from real announcement/broadcast table |
| Pages grid (visual cards with title, thumbnail, status) | mock-data-array | `_pages.tsx:7236+` (renders `w.pages` array) | Y — real pages available from bridge | S2 | M | Thumbnails and all metadata use WEBSITE_STATE mock; should use bridge data |
| "Open page builder" button | mock-action | `_pages.tsx:7179` (toast "Opening page builder…") | Y — page builder route exists | S3 | S | Should navigate to real page builder, not toast |

---

### 10. SETTINGS PAGE (Team, Branding, Billing, Plan, Domain, Integrations, Notifications)

| Element | Type | Evidence | Real source available? | Severity | Effort | Notes |
|---------|------|----------|----------------------|----------|--------|-------|
| Team members list | half-wired | `_pages.tsx` tab | Y — `loadWorkspaceTeamMembers` is live | S2 | XS | Falls back to mock when bridge is null |
| Team member card (name, role, email, status) | half-wired | | Y — bridge provides real rows | S2 | XS | All data is wired; works correctly |
| Add team member button | mock-action | Opens "new-team-member" drawer | Y — drawer exists | S3 | S | Drawer wiring is separate |
| Billing section | half-wired | `_pages.tsx` billing tab | Y — `loadWorkspaceBillingState` is live | S2 | M | Shows plan, next invoice, usage; all wired correctly |
| Domain settings | half-wired | Shows custom domain from workspace | Y — `loadWorkspaceDomainSummary` is live | S2 | S | Domain is wired; DNS check buttons may be stubs |
| Integrations (Slack, Zapier, etc.) | empty-shell | `_pages.tsx` | N — no integration service yet | S1 | XL | Just shows available integrations; no real wiring |
| Notification preferences | empty-shell | Opens "notification-prefs" drawer | N — no user notification settings table | S1 | M | Should save user's per-event notification state |
| Branding / theme settings | empty-shell | `_pages.tsx` | N — no brand customization yet | S1 | L | Should allow logo upload, color picker, etc. |
| API keys / webhooks | empty-shell | Opens "api-keys" drawer | N — no API key service yet | S1 | L | Needs API key generation + webhook mgmt UI |

---

### 11. NOTIFICATIONS / ACTIVITY FEED / RIGHT SIDEBAR

| Element | Type | Evidence | Real source available? | Severity | Effort | Notes |
|---------|------|----------|----------------------|----------|--------|-------|
| **Entire notifications drawer is hardcoded mocks** | mock-data-array | `_state.tsx:2945–3080` (`NOTIFICATIONS` export) | N — no real notification table yet | S1 | L | ~50 hardcoded notification items with mock timestamps + payloads |
| Notification batching (3 "Vogue Italia" messages grouped) | mock-data-array | `_state.tsx:2945–2980` (Vogue messages wn1, wn1b, wn1c) | N — batching logic works; data is mock | S2 | L | Batching algorithm is correct; just needs live data source |
| Unread dot on notification items | half-wired | `_drawers.tsx:13473` (reads `n.read` from mock) | Y — messages have read status | S2 | S | Falls back to hardcoded `NOTIFICATIONS.read` field |
| "Vogue Italia replied to the offer" title | mock-string | `_state.tsx:2949` | N — titles should be computed from message metadata | S2 | M | Should read from actual message thread |
| Notification action buttons ("View", "Reply", "Mark read") | half-wired | `_drawers.tsx:13484–13510` | Y — onClick handlers call openDrawer with correct payload | S2 | M | Correct structure; just triggered by mock data |
| Recent activity section (4 items: Oran, Marta, Kai, System) | mock-data-array | `_pages.tsx:2914–2920` (inline .map with hardcoded names/actions) | N — no activity log table | S2 | L | Same 4 items every page load; timestamps computed from mock offsets |
| Activity feed timestamps (relativeTime) | mock-string | Computed with `relativeTime(Date.now() - offset)` | Y — timeline logic is correct; data is mock | S2 | XS | Timestamps update live; just need real events |
| "Team activity" drawer (full activity history) | half-wired | `_drawers.tsx:386` → `<ActivityFeedDrawer kind="team" />` | Partial — drawer exists; shows RICH_INQUIRIES-derived activity | S2 | M | Drawer renders inquiry stages as activity; should render real audit log |

---

### 12. SEARCH / COMMAND PALETTE (⌘K)

| Element | Type | Evidence | Real source available? | Severity | Effort | Notes |
|---------|------|----------|----------------------|----------|--------|-------|
| Search command palette | empty-shell | Referenced in proto but not shown in audit scope | N — search index not built | S3 | L | Needs fuzzy search over talent, clients, inquiries, pages |

---

### 13. ONBOARDING / ACTIVATION ARC

| Element | Type | Evidence | Real source available? | Severity | Effort | Notes |
|---------|------|----------|----------------------|----------|--------|-------|
| "You're already live" banner / card | mock-string | `_pages.tsx` (shown on first visit?) | Y — can be wired to workspace.published flag | S2 | M | Hardcoded messaging; should key off workspace state |
| 5-step activation checklist | mock-data-array | `_pages.tsx:2940–2960` (`ACTIVATION_TASKS` export) | Y — can be wired to setup flags | S2 | M | Tasks are hardcoded; completion state is proto-local, not persisted |
| Checklist item labels ("Add your first talent", "Invite your team", etc.) | mock-string | `_state.tsx` (search ACTIVATION_TASKS) | Y | S2 | XS | Task label is hardcoded; should be dynamic |
| "Complete this step" CTA buttons | mock-action | Each task card has a button | Y — buttons navigate correctly | S3 | S | Button targets are correct; actions are no-ops (no state mutation) |
| Progress bar ("3 of 5 complete") | half-wired | Computed from completed tasks | Y — completion flags are in proto state | S2 | M | Should persist to DB; currently resets on refresh |

---

### 14. DRAWERS (Modal/Sidebar Surfaces)

| Element | Type | Evidence | Real source available? | Severity | Effort | Notes |
|---------|------|----------|----------------------|----------|--------|-------|
| Inquiry workspace (messages, offers, talent status, requirements) | half-wired | `_drawers.tsx:442` → `<InquiryWorkspaceDrawer />` | Y — real inquiry + messages + offers wired | S2 | M | Mostly live; some edge cases (contract docs, e-signatures) not wired |
| Talent profile shell (identity, photos, measurements, credits, etc.) | half-wired | `_talent.tsx` & `_drawers.tsx` | Y — profile fields mostly wired; photos not yet | S2 | M | All text fields are live; image URLs are undefined (fallback to initials) |
| New talent drawer (create form) | half-wired | `_drawers.tsx:549` → `<NewTalentDrawer />` | Y — form submission exists | S2 | M | Form wiring is correct; validation/submission TBD |
| Client detail drawer | half-wired | `_drawers.tsx` | Y — drawer exists; some sections mock | S2 | M | Account history + bookings show real data when available |
| New client drawer | half-wired | | Y — form submission exists | S2 | M | Same as new talent |
| Booking/offer detail drawer | half-wired | `_drawers.tsx` | Y — real bookings available; some fields mock | S2 | M | Contract templates, e-signature, payment terms not wired |
| Confirmed bookings list drawer | mock-data-array | Shows filtered RICH_INQUIRIES with stage='confirmed' | Y — real bookings available | S2 | S | Filtering logic is correct; just uses mock data |
| SimpleStubDrawer ("Coming up next") | empty-shell | `_drawers.tsx:437–439` | N — appears for 8+ drawers | S2 | M | Used as placeholder for incomplete features (relationship history, client data, etc.) |
| Team activity drawer | half-wired | `_drawers.tsx:386–388` | Partial — shows inquiry stages as activity | N — real activity log not available | S2 | L | Should show workspace audit log (user actions + system events) |
| Confirmed bookings drawer | mock-data-array | Shows RICH_INQUIRIES filtered by stage='confirmed' | Y — real data available | S2 | M | Logic is correct; just sourced from mock |

---

## Top 20 Highest-Severity Lies

**Ranked by visibility × blocking impact. S1/S2 weighted higher.**

| Rank | Lie | Location | Impact | Why it matters |
|------|-----|----------|--------|----------------|
| 1 | Agency name always "Atelier Roma" in topbar | `_state.tsx:3141` | User switched to different tenant but chrome still shows first tenant's name | S1 — user can't confirm they're in the right workspace |
| 2 | "€4,200 pending · 3 confirmed" hardcoded in topbar acting detail | `_pages.tsx:1172` | User sees stale financial summary that doesn't reflect real state | S1 — misleading financial info |
| 3 | User name "Marta Reyes" persists in topbar when switching to workspace surface | `_pages.tsx:1160` | User identity is wrong in navbar | S1 — wrong person displayed when context switches |
| 4 | All activity feed entries (Oran, Marta, Kai, System) are hardcoded static strings with mock timestamps | `_pages.tsx:2914–2920` | User sees same 4 events every page load; timestamps don't advance | S2 — gives false impression of system activity |
| 5 | All notifications (50 items) are hardcoded; unread count is static | `_state.tsx:2945–3080` | Bell badge is lie; notifications drawer shows fake items | S2 — user can't trust the notification system |
| 6 | Operations page is 100% drawer stubs (Analytics, Workflow, Comms, Admin — 17 cards) | `_pages.tsx:7045–7092` | User clicks Revenue or Conversion Funnel → sees "Coming up next" stub | S1 — entire page is non-functional |
| 7 | Production page is 100% drawer stubs (Casting, Crew, Rights, Lifecycle — 16 cards) | `_pages.tsx:7094–7170` | User clicks Call Sheet or On-set Check-in → sees "Coming up next" stub | S1 — entire page is non-functional |
| 8 | Website analytics (page views, conversion, funnel) are hardcoded mock KPIs | `_pages.tsx:7192–7194` & `MOCK_STOREFRONT_STATS` | User sees "Views 7d: 284, +18%" without any real analytics backing | S2 — analytics are fabricated |
| 9 | RICH_INQUIRIES hardcoded array (5 inquiries with all mock data: messages, offers, talent status) | `_state.tsx:1352–2910` | All inquiry workflows rely on same 5 hardcoded examples | S2 — doesn't reflect real inquiry volume or states |
| 10 | Roster thumbnail URLs are undefined; renders fallback avatar instead of real headshots | `_data-bridge.ts:337–340` | User sees initials + tint; can't visually identify talent | S2 — reduces UX efficiency; photos are critical for talent ID |
| 11 | WEBSITE_STATE is 100% hardcoded mock; pages/posts/domain are static objects | `_state.tsx:8692+` | Website page metrics and content don't reflect real site state | S2 — website data is completely fake |
| 12 | Activation checklist tasks are hardcoded; completion is proto-local, not persisted to DB | `_pages.tsx:2940–2960` | User checks off "Add your first talent" → page refreshes → task is unchecked | S2 — user can't trust progress tracking |
| 13 | Unread badge on Messages falls back to hardcoded `WORKSPACE_UNREAD` when bridge is null | `_pages.tsx:1181` | Nav badge shows fake count; user dismisses unread but count persists | S2 — nav feedback is misleading |
| 14 | Pending talent queue reads from hardcoded `SEED_PENDING_TALENT` mock array, not DB | `_state.tsx:6075–6100` | Roster badge shows "2 pending" even if no actual pending talent exists | S2 — queue is static mock |
| 15 | Team activity drawer shows RICH_INQUIRIES stages as activity (not real audit log) | `_drawers.tsx:386–388` | User opens Team Activity → sees inquiry stage changes, not actual user actions | S2 — activity log is inquiry-derived hack |
| 16 | Mine account feature (guardian co-pilot setup) is empty-shell drawer | `_drawers.tsx:846` | Minor talent can't set up guardian consent flow | S1 — blocks minor accounts (legal requirement) |
| 17 | All SLA / queue / automation rules surfaces are empty-shell drawers (6 drawers in Workflow section) | `_drawers.tsx:740–745` | Coordinators can't set up queue automation or SLA timers | S1 — blocks coordinator UX |
| 18 | Email templates, sequences, invite flow are empty-shell drawers (3 more) | `_drawers.tsx:748–750` | Can't set up outbound email campaigns or talent invites | S1 — blocks marketing/growth features |
| 19 | Incident reports and dispute resolution are empty-shell drawers | `_drawers.tsx:843–844` | Can't file safety incidents or resolve disputes | S1 — blocks safety/legal workflows |
| 20 | Storefront stats "Views 7d: 284, Growth: +18%" appears in Overview but is hardcoded constant | `_pages.tsx:471` & `_pages.tsx:2580` | Same fake metrics appear in 2 places; no analytics backend | S2 — hardcoded in multiple surfaces |

---

## Cross-Cutting Patterns

### Pattern 1: Hardcoded Tenant / Agency Context
**Symptom:** Topbar displays "Atelier Roma", initials "A", domain "atelier-roma.tulala.app" everywhere.  
**Root:** `_state.tsx:3133–3148` exports `TENANT` as a hardcoded constant.  
**Fix:** Read from session + workspace DB (tenant_workspaces table). Replace all `TENANT.X` with `session.workspace.X` or bridge call.  
**Scope:** Affects topbar, switchers, all chrome. ~15 references.

### Pattern 2: Hardcoded User Identity ("Marta Reyes") Persisting Across Surfaces
**Symptom:** Topbar shows "Marta Reyes" even when user switches to workspace mode; should show actual user name.  
**Root:** `_pages.tsx:1160` uses `MY_TALENT_PROFILE.name` for talent surfaces, but also falls back for workspace.  
**Fix:** Always read from `session.user.display_name` for topbar. Use surface-specific identity only in detail sections.  
**Scope:** Topbar identity bar (~50 lines).

### Pattern 3: Every Counter is Hardcoded or Falls Back to Mock
**Symptom:** "27 talent", "€4,200 pending", "3 confirmed", "2 coordinators" appear hardcoded or fallback to RICH_INQUIRIES counts.  
**Root:** `_pages.tsx:2530–2590` uses effectiveMetrics OR fallback to richInqs filters. Bridge fields exist but fallback is too aggressive.  
**Fix:** When bridge is null, render empty state, NOT mock fallback. Remove all mock counter fallbacks. Only render metrics when bridge provides data.  
**Scope:** Overview page (~100 lines), every card with a count.

### Pattern 4: Activity Feed & Notifications Are Entirely Hardcoded Arrays
**Symptom:** Activity feed shows same 4 events every page load. Notifications drawer shows 50 hardcoded items.  
**Root:** `_pages.tsx:2914–2920` and `_state.tsx:2945–3080` are inline arrays. No event log or notification table.  
**Fix:** Create audit_log table (user_id, action, target, timestamp, metadata). Create notifications table (user_id, kind, read, actor, ts). Wire drawers to real data.  
**Scope:** Huge — entire activity/notification system. ~200 lines of hardcoded data + 500 lines of UI code.

### Pattern 5: All Operations & Production Pages are Drawer Stub Menus
**Symptom:** OperationsPage and ProductionPage are just cards with openDrawer() calls; all drawers say "Coming up next".  
**Root:** `_pages.tsx:7045–7170` are menu pages. Drawers in `_drawers.tsx` are SimpleStubDrawer.  
**Fix:** Build the ~40 drawer UIs + their data sources. High effort; should be split into separate phases per subsystem (Analytics, Casting, Crew, Rights, etc.).  
**Scope:** 2+ months of work; blocked on multiple schema designs (analytics, casting, production).

### Pattern 6: Website Page Mixes Hardcoded WEBSITE_STATE Mock with Real Bridge Data
**Symptom:** Pages grid shows real pages from bridge, but analytics tiles show hardcoded metrics.  
**Root:** `_pages.tsx:7160+` reads `w = WEBSITE_STATE` (mock) but also calls bridge for real pages.  
**Fix:** Completely remove WEBSITE_STATE mock. Wire all website data (pages, posts, analytics, maintenance, announcements) to real bridge calls / schema.  
**Scope:** Website page (~200 lines) + data-bridge website section.

### Pattern 7: Photo/Thumbnail URLs Missing Throughout
**Symptom:** Roster cards show initials instead of headshots. Client cards show initials instead of logos. Talent profile shows no profile photo.  
**Root:** `_data-bridge.ts:337–340` — bridge output doesn't include photo URLs (comment says "Phase 3 work").  
**Fix:** Extend roster query to join media_assets table for profile/cover photos. Same for client logos.  
**Scope:** ~50 lines in bridge + UI updates to all avatar/thumbnail renders.

### Pattern 8: All Drawer Actions Are Stubs or Open Other Stubs
**Symptom:** "Save team member" → no API call. "Send invite" → toast("Preparing…"). "Approve profile changes" → no mutation.  
**Root:** Drawers in `_drawers.tsx` have open UI but no submit handlers or they toast instead of mutating.  
**Fix:** Wire form submissions to server actions (_actions.ts). Create missing server actions (create_team_member, invite_talent, approve_profile_changes, etc.).  
**Scope:** 30+ drawer submit handlers across all surfaces.

### Pattern 9: Activation Checklist Completion is Ephemeral (Not Persisted)
**Symptom:** User clicks "Mark complete" on a task → task shows as done. Page refresh → back to incomplete.  
**Root:** `_pages.tsx:2952–2960` — completion state is in proto useState, not DB.  
**Fix:** Create workspace_activation_progress table. Wire completeTask() to server action that mutates DB.  
**Scope:** ~30 lines in _state.tsx + new server action + schema migration.

### Pattern 10: "Real Data + Mock Fallback" Strategy is Too Loose
**Symptom:** When bridge returns empty array, UI shows empty state. When bridge is null, UI shows mock data. These look different to the user.  
**Root:** `_pages.tsx:2530` — `richInqs = effectiveMessagesInquiries.length > 0 ? effectiveMessagesInquiries : RICH_INQUIRIES`  
**Fix:** Establish a strict rule: **no mock fallback**. When bridge is null, always render empty state or "Loading…". Only use mock in dev/storybook mode (with feature flag).  
**Scope:** ~20 locations in _pages.tsx where this pattern appears.

---

## "Already Real" Inventory

### Fully Wired (Live Data)
- **Roster** — `loadWorkspaceRosterForCurrentTenant()` returns real TalentProfile[]; filters by status correctly; ~15 fields wired. Photo URLs missing.
- **Messages / Inquiries** — `loadInquiriesForMessages()` returns real inquiries; shows real stages, client names, coordinator assignments; unread counts wired. Offer details partially wired.
- **Calendar** — `loadCalendarEvents()` returns real events; renders dates + client names correctly.
- **Clients** — `loadWorkspaceClients()` returns real client rows; logo URLs missing.
- **Overview metrics** — `loadWorkspaceOverviewMetrics()` returns rosterTotal, rosterPublished, openInquiries, teamMembers, pendingTalent. All wired.
- **Bookings** — `loadWorkspaceBookings()` returns recent bookings; renders correctly.
- **Team members** — `loadWorkspaceTeamMembers()` returns roster of workspace members.
- **Unread count** — `loadTotalUnreadMessages()` provides badge count for nav.
- **Domain** — `loadWorkspaceDomainSummary()` returns primary domain + custom domain; renders in Website page.
- **Billing** — `loadWorkspaceBillingState()` provides plan, invoice, usage; renders in Settings.
- **Website pages/posts** — `loadWebsiteData()` returns real pages/posts/domain; renders in Website page (but analytics are mock).

### Partially Wired (Real Data + Mocks)
- **Activation checklist** — Completion state is in proto useState (ephemeral), not DB. Tasks are hardcoded; could be dynamic.
- **Pending talent queue** — Data exists (SEED_PENDING_TALENT); could be wired to real verification_requests table.
- **Activity feed** — Concept exists; currently hardcoded 4 items. Could be wired to audit_log table (doesn't exist yet).
- **Notifications** — System supports read/unread; currently pulls from hardcoded NOTIFICATIONS array. Could be wired to notifications table (doesn't exist yet).

### Not Wired (No Bridge, No Data)
- **Operations page** — All 17 cards are drawers; no analytics data source.
- **Production page** — All 16 cards are drawers; no casting/crew/rights data sources.
- **Website analytics** — Hardcoded KPIs; no analytics backend.
- **Search/command palette** — Not implemented.
- **Activity log** — No audit_log table; currently faked with inquiry stage changes.
- **SLA timers / Queue / Automation rules** — No rule engine, no queue state, no timer service.
- **Email templates / sequences** — No email service integration.
- **Incident reports / Disputes** — No incident or dispute tables.
- **Integrations** — No integration service.
- **API keys / Webhooks** — No API service.

---

## Data Bridge Functions & Their Consumers

| Function | Exports | Status | Consumer |
|----------|---------|--------|----------|
| `loadWorkspaceRosterForCurrentTenant()` | `TalentProfile[]` | ✅ Live | RosterPage, Overview (effectiveRoster) |
| `loadInquiriesForMessages()` | `WorkspaceInquiryForMessages[]` | ✅ Live | MessagesPage, Overview (effectiveMessagesInquiries) |
| `loadCalendarEvents()` | `CalendarEvent[]` | ✅ Live | CalendarPage |
| `loadWorkspaceClients()` | `WorkspaceClientRow[]` | ✅ Live | ClientsPage |
| `loadWorkspaceOverviewMetrics()` | `WorkspaceOverviewMetrics` | ✅ Live | OverviewPage |
| `loadWorkspaceBookings()` | `WorkspaceBookingRow[]` | ✅ Live | (not yet shown; Operations page) |
| `loadWorkspaceTeamMembers()` | `WorkspaceTeamMember[]` | ✅ Live | SettingsPage (Team tab) |
| `loadTotalUnreadMessages()` | `number` | ✅ Live | Topbar (notifications badge) |
| `loadWorkspaceDomainSummary()` | `WorkspaceDomainSummary` | ✅ Live | WebsitePage, SettingsPage (Domain tab) |
| `loadWorkspaceBillingState()` | `WorkspaceSubscriptionState` | ✅ Live | SettingsPage (Billing tab) |
| `loadWebsiteData()` | `WebsiteData` | ✅ Live | WebsitePage (pages/posts; analytics are mock) |
| `loadTalentSelfProfile()` | `TalentSelfProfile` | ✅ Live | (Talent surface; not workspace scope) |
| `loadTalentInquiries()` | `TalentInquiryRow[]` | ✅ Live | (Talent surface; not workspace scope) |

---

## Effort & Prioritization Notes

### Quick Wins (XS, can be done in parallel)
1. Remove hardcoded TENANT constant; read from session/workspace.
2. Remove hardcoded user name from topbar; always use session.user.display_name.
3. Remove all mock fallbacks; render empty state when bridge is null.
4. Update Activation checklist to persist completion to DB (new server action + schema column).
5. Wire photo URLs to media_assets table (extend bridge queries).

### Medium Effort (S, 1–3h each, blocks multiple surfaces)
1. Create audit_log table; wire Activity feed to real events.
2. Create notifications table; wire Notifications drawer to real notifications.
3. Remove WEBSITE_STATE mock; fully wire Website page to bridge data.
4. Implement ~30 drawer submit handlers (team member, talent, client CRUD).
5. Add SLA / queue / automation rule schema + basic UI (part of Operations).

### Large Effort (M, 1d each, strategic)
1. Build Analytics subsystem (revenue, conversion funnel, top performers, workload).
2. Build Workflow subsystem (queue, SLA timers, rules builder, saved replies, vacation handover, on-call).
3. Build Production subsystem (casting, crew booking, call sheet, on-set check-in, usage tracker, relicense, incident reports, disputes).
4. Build Comms subsystem (email templates, sequences, invite flow, referrals).
5. Build Admin tools (CSV import, migration assistant, AI workspace, feature controls).

### Very Large Effort (L/XL, 1+ weeks)
1. Analytics backend (requires metrics pipeline or third-party service integration).
2. Full Production system (requires complex schemas for casting rounds, crew assignments, on-set live status).
3. Email service integration (requires third-party provider + webhook handling).
4. Feature flag / rule engine (Workflow Automation).

---

## Recommendations for Execution Plan

1. **Phase 1 (This Sprint):** Quick wins (5 items, ~1 day). Remove hardcoded tenant/user strings. Wire photo URLs. Persist activation checklist.
2. **Phase 2 (Next Sprint):** Medium effort (5 items, ~1 week). Activity log. Notifications. Website data. Drawer handlers. Basic SLA.
3. **Phase 3 (Month 2–3):** Analytics subsystem. Workflow subsystem (queue + rules). Production subsystem (casting + crew + rights).
4. **Phase 4 (Month 3+):** Comms + email. Admin tools. Full integrations.

The master execution plan should encode these patterns and blocking dependencies.

