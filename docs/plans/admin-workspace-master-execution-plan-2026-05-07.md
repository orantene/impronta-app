# Master Execution Plan — Agency Admin Workspace to Top-Tier Product

**Owner:** Oran (orantene@gmail.com)
**Authored:** 2026-05-07
**Status:** Draft — awaiting sign-off
**Audit input:** [`docs/audits/admin-workspace-lies-and-gaps-2026-05-07.md`](../audits/admin-workspace-lies-and-gaps-2026-05-07.md)
**Product north star:** [`memory/project_product_vision.md`](~/.claude/projects/-Users-oranpersonal-Desktop-impronta-app/memory/project_product_vision.md) — Inquiry → Coordination → Offer → Approvals → Booking; replaces WhatsApp chaos.

---

## 0. What "Top-Tier Product" Means For This Product

Generic SaaS quality bars don't apply directly. For Impronta specifically:

| Pillar | Concrete bar |
|---|---|
| **Pipeline integrity** | Every inquiry ends in one of: `booked`, `closed-lost`, `archived`. Zero dead states. Every transition has a UI, an audit row, and a notification. |
| **Coordinator productivity** | A coordinator can run a full week of work (50+ inquiries) without leaving the app. No WhatsApp/Email fallback for status, approvals, or offers. |
| **Truth across roles** | Client, talent, coordinator see the same state at all times. State changes visible within 5s without refresh (Supabase realtime). |
| **Multi-tenant safety** | Cross-tenant RLS leak = launch blocker. Verified by automated test (Plan §22.9 gate). |
| **Mobile-first** | Coordinators are between shoots. Every primary action works one-handed on iPhone 13. |
| **10-min activation** | A new agency owner goes from signup → published profile → first inquiry sent in ≤10 minutes (current prototype's activation arc, but real). |
| **Operational excellence** | P0 incidents observable in <1 min, recoverable in <30 min. Audit log queryable. Backups proven restorable. |

**Definition of done** (top-level): all 10 phases below complete + zero S1 lies remain in catalog + all DoD checklists per phase signed off.

---

## 1. Current State (Honest Snapshot)

**Already real (13 surfaces wired):** Roster CRUD, Inquiries list+detail, Messages send, Calendar reads, Clients list, Overview metrics, Bookings list+detail, Team members, Unread count, Domain summary, Billing/Stripe, Website pages/posts. Auth + capability gates are real on every action.

**Hybrid (live data + mock fallback):** ~20 locations in `_pages.tsx` use the pattern `realData.length > 0 ? realData : MOCK`. When bridge returns empty, UI shows mock. **This is the single biggest source of lies.**

**Pure mock:** Top-bar identity (`TENANT.name`, `MY_TALENT_PROFILE.name`), KPI subline (`€4,200 pending · 3 confirmed` literal), Activity feed (4 hardcoded entries), Notifications (50 hardcoded items), Operations page (17 drawer stubs), Production page (16 drawer stubs), Website analytics (fabricated KPIs), Activation checklist (ephemeral useState).

**Schema gaps:** No `audit_log` table, no `notifications` table, no `workspace_activation_progress` table, no analytics aggregate tables, no callsheet/casting/rights tables.

**Visible to user today:** ~80–150 catalogued lies (from audit). ~20 are S1 (user-blocking misleading), ~60 are S2 (visible misleading), rest cosmetic.

---

## 2. Sequencing Logic (Why This Order)

The plan is sequenced by **dependency**, not by severity:

1. Truth in the chrome → unblocks everything else (otherwise every surface still lies).
2. Schema gaps → unblocks audit log, notifications, activation persistence, photos.
3. Drawer handlers → unblocks "every button does what it says" (the trust foundation).
4. Inquiry pipeline completion → the product's core promise.
5. Operations + Production → analytics + production tooling, sized realistically.
6. Settings completeness → owner self-serves the workspace.
7. Owner-adds-talent E2E → specific feature you flagged.
8. Quality (mobile/a11y/i18n/perf/realtime) → top-tier polish.
9. Launch readiness (observability, support tools, monitoring) → production-grade.
10. Continuous: parallel-agent coordination, DoD enforcement, weekly demos.

**Total estimate: 15–16 weeks of focused work.** The first 5 weeks (Phases 1–3) ship a workspace where every visible element is real and every button does what it says — this is the **MVP slice**. Phases 4–10 are completeness + quality.

---

## 3. The Phases

### Phase 1 — Truth in the Chrome (1.5 weeks)

**Goal:** Every header element, badge, counter, and chrome string reads from real session/tenant/bridge. Zero hardcoded constants in chrome rendering. The real-identity banner (already shipped) becomes redundant and is deleted.

**Slices:**
- **1a.** Extend `useProto()` to expose `tenantIdentity`, `sessionIdentity`, `planBadge` from `initialBridgeData`. Backward-compatible additions; no removals.
- **1b.** Update `_pages.tsx:1163` (acting-label) to read from `useProto()` instead of `TENANT.name`/`MY_TALENT_PROFILE.name`.
- **1c.** Replace `_pages.tsx:1172` hardcoded `${fmtMoney(4200)} pending · 3 confirmed` with `${fmtMoney(metrics.pendingRevenue)} pending · ${metrics.confirmedThisWeek} confirmed` from real `overviewMetrics`. Add `pendingRevenue` + `confirmedThisWeek` to `WorkspaceOverviewMetrics` type + loader query.
- **1d.** Remove `WORKSPACE_UNREAD` hardcoded fallback in `_pages.tsx:1181`. Always read `bridgeTotalUnread`.
- **1e.** Wire domain display in topbar from `loadWorkspaceDomainSummary` instead of `TENANT.domain`.
- **1f.** Remove the `realData.length > 0 ? realData : MOCK` fallback pattern in 20 known locations. When bridge is null/empty, render proper empty state. Add a single `EmptyShellState` component.
- **1g.** Delete `_real-identity-banner.tsx` (the truth banner) and the layout mount. Real chrome is now true.

**Parallel agent coordination:** Phase 1 touches `_state.tsx` and `_pages.tsx` — hot files. **Required before starting:** explicit handoff window from page-builder agent OR a coordination commit where their changes land first. **Suggested protocol:** Oran pings page-builder agent → they push their last changes → I rebase and start Phase 1.

**DoD:**
- [ ] Top-bar identity test: log in as `qa-admin@impronta.test`, switch to `app.tulala.digital/impronta/admin` and `app.tulala.digital/nova/admin` (different tenant) — top-bar workspace name + plan badge + user email all reflect the slug, not Marta Reyes / Atelier Roma.
- [ ] grep `_pages.tsx _state.tsx` for `Atelier Roma`, `Marta Reyes`, `4200` — zero matches outside test fixtures.
- [ ] grep for `: MOCK_` and `: RICH_` fallback patterns in render code — zero matches.
- [ ] `_real-identity-banner.tsx` deleted.

---

### Phase 2 — Schema Gaps + Real Data Everywhere (2 weeks)

**Goal:** Every prototype surface that *could* be real, *is* real. New tables for activity log, notifications, activation progress. Photos wired.

**Slices:**
- **2a.** Migration: `audit_log` table (`id, tenant_id, actor_user_id, action, target_kind, target_id, ts, metadata jsonb`). RLS scoped to tenant. Server middleware logs auto-on every server-action mutation.
- **2b.** Migration: `notifications` table (`id, tenant_id, recipient_user_id, kind, actor_user_id, target_kind, target_id, read_at, created_at, metadata`). Wire the bell icon + drawer to real rows.
- **2c.** Migration: `workspace_activation_progress` table (`tenant_id, step_id, completed_at, completed_by`). Wire the activation checklist to read/write here. Replace ephemeral useState.
- **2d.** Extend `loadWorkspaceRosterForCurrentTenant()` to join `media_assets` for `profile_photo_url` and `cover_photo_url`. Wire the avatar map (replace `_primitives.tsx:5501–5600` mock map).
- **2e.** Same for `loadWorkspaceClients()` — join logo media. Same for `loadInquiriesForMessages()` — join talent thumbs.
- **2f.** Wire pending-talent queue to `verification_requests` table (already exists from earlier phases). Replace `SEED_PENDING_TALENT` mock.
- **2g.** Remove `WEBSITE_STATE` mock entirely. Extend `loadWebsiteData()` to provide pages, posts, redirects, custom code, tracking, SEO snapshot, domain status.

**Parallel agent risk:** Lower — these are mostly bridge changes (mine) + new migrations. `_pages.tsx` edits limited to 5 specific lines.

**DoD:**
- [ ] Live: navigate to `/impronta/admin` as `qa-admin`. Avatars show real headshots, not initials.
- [ ] Click a roster card → action recorded in `audit_log` with correct `tenant_id` + `actor_user_id`.
- [ ] Click "Mark complete" on activation step → refresh page → step still complete.
- [ ] Bell icon shows real notification count from DB; drawer shows real notifications.
- [ ] No `WEBSITE_STATE` references in `_pages.tsx`.
- [ ] Cross-tenant RLS test: query `audit_log` as Nova Crew owner (`owner@novacrew.demo`) — zero rows from Impronta.

---

### Phase 3 — Drawer Actions Wired (1.5 weeks)

**Goal:** Every form/drawer/button performs the action it advertises, or is hidden behind a feature flag.

**Slices:**
- **3a.** Audit `_drawers.tsx` — list every submit handler. Categorize: live | stub | toast-only.
- **3b.** Wire 30+ stubs to real server actions in `lib/server-actions/`. Examples: `createTeamMember`, `inviteTalent`, `approveProfileChanges`, `cancelInquiry`, `markInquiryWon`, `acknowledgeDispute`, `requestVerification`.
- **3c.** Hide drawers without backend behind `process.env.PROTOTYPE_DRAWERS === "1"` — if not set, replace with `<EmptyDrawer message="Coming in v2">`.
- **3d.** Add E2E smoke for top-10 drawers: render → fill → submit → verify DB write + audit log row.
- **3e.** Resend/revoke + send-claim-invite UI (Phase 8 has the email work; this is just the UI button + server action wiring).

**DoD:**
- [ ] Top-10 drawer E2E suite passes (Playwright).
- [ ] grep for `toast(.*Coming up next)` — zero matches in production code paths.
- [ ] grep for `onSubmit.*toast` — zero matches; every submit calls a server action.

---

### Phase 4 — Inquiry → Booking Pipeline Completion (2 weeks)

**Goal:** The product's core promise. Every state transition has a UI, an audit entry, a notification, and is reflected in real-time across roles.

**Slices:**
- **4a.** Audit every inquiry stage transition (per `project_inquiry_flow_spec.md`). For each: verify UI button exists, verify server action exists, verify audit log row written, verify notifications fired to all relevant parties (client, each talent, coordinator).
- **4b.** Real-time: Supabase realtime channel per inquiry. Coordinator's inbox auto-updates when client sends a message or talent accepts. No manual refresh.
- **4c.** Real-time: same channel propagates to client's `/client/inquiries/[id]` and talent's `/talent/inquiries/[id]`.
- **4d.** Versioned offers: every offer revision creates a row in `inquiry_offers` with `version` integer. Client approval locks version; coordinator can supersede with new version.
- **4e.** Booking conversion: when last approval lands, server action atomically creates `bookings` row + locks all `requirement_groups` + writes `inquiry_events.kind='booked'`. Verified atomic via transaction.
- **4f.** SLA timers: cron job (Vercel cron) ages stale inquiries. Inquiries waiting > N hours on a side surface in "Awaiting" stack. No new schema; just a query + UI.
- **4g.** Dispute resolution UI in `/admin/work/[id]` (the gap from earlier audit). Add `markResolved`, `escalate`, `addNote`.

**DoD:**
- [ ] State machine test: scripted end-to-end inquiry from new submission → booked, every transition verified in DB + UI + notifications + audit log.
- [ ] Realtime test: open same inquiry in two browser windows (coordinator + client). Action in one window appears in other within 3s without refresh.
- [ ] Offer versioning: create offer v1, approve client side, create offer v2 superseding — DB rows correct, UI shows version history.

---

### Phase 5 — Operations Surface Ship (3 weeks)

**Goal:** Agency owners get a real analytics view of their workspace. Replaces the empty Operations page.

**Scope decision (v1 vs v2):**
- **v1 ships:** Revenue (last 30/90 days, by talent, by client), conversion funnel (inquiries → coordination → offer → booked), top performers (talent + clients), workload heatmap (inquiries by week, by coordinator).
- **v2 (deferred):** Workflow automation (queue, SLA rules), email sequences, on-call rotation, shared inboxes.

**Slices:**
- **5a.** Build analytics queries on existing `inquiries` + `bookings` tables. No new pipeline; just `SELECT … GROUP BY` queries with materialized views if perf needs.
- **5b.** Build chart components (Recharts or Chart.js — pick one and stick). Performance budget: <200KB JS for analytics page.
- **5c.** Date-range picker: 7d / 30d / 90d / custom.
- **5d.** Export to CSV.
- **5e.** Hide v2 drawers behind `PROTOTYPE_DRAWERS` flag.

**DoD:**
- [ ] `/impronta/admin/operations` renders 4 charts with real Impronta data.
- [ ] Date range filter works.
- [ ] Numbers match a hand-computed query against the DB.
- [ ] Lighthouse performance score ≥ 85 on this page.

---

### Phase 6 — Production Surface Decision (1 week define + 4 weeks if v1)

**Goal:** Decide what production tooling ships in v1. Cut the rest cleanly.

**Recommended scope decision:**
- **v1 ships:** Callsheets (per-booking PDF + share link with crew), Rights/usage tracker (which bookings have which rights, expiration alerts).
- **v2 (deferred):** Casting rounds, crew assignments, on-set live status, dispute resolution UI (overlap with Phase 4g).

**If user says "all v1":** add 4 weeks for casting + crew + on-set.
**If user says "v1 minimum":** 4 weeks for callsheets + rights only.
**If user says "defer all":** redirect `/admin/production` to `/admin/operations` with a banner; reclaim 4 weeks.

**DoD (v1 minimum):**
- [ ] Generate callsheet PDF for any booking. Share link works publicly with verification token.
- [ ] Rights tracker shows expiration timeline per booking. 30-day-expiring alerts in notifications.

---

### Phase 7 — Settings Completeness (1 week)

**Goal:** Agency owner self-serves the workspace. No engineering tickets for routine config.

**Slices:**
- **7a.** Team management: invite (email), accept invite flow, role change, remove. Audit each action.
- **7b.** Branding: logo upload, primary color, sender email, custom email signature.
- **7c.** Domain self-provisioning UI: form to add custom domain → DNS verification challenge → SSL provisioning. Blocks on Phase 5 of SaaS plan (Vercel Domains API, human-in-loop). Provide UI + status display + manual ops path until automated.
- **7d.** Notification preferences: email digest frequency, in-app vs email per category.
- **7e.** Billing/plan: already wired in `/admin/account`; surface in Settings tab too.

**DoD:**
- [ ] Owner invites teammate end-to-end: email arrives, click link, accept, appears in roster.
- [ ] Owner uploads logo → renders in topbar after refresh.
- [ ] Owner adds custom domain → verification page shows next steps; DNS verified path tested manually.

---

### Phase 8 — Owner-Adds-Talent E2E (1 week)

**Goal:** The specific feature flagged. Owner can add a talent record, edit it freely while unclaimed, lose elevated rights when talent confirms login. Per [`memory/project_agency_exclusivity_model.md`](~/.claude/projects/-Users-oranpersonal-Desktop-impronta-app/memory/project_agency_exclusivity_model.md).

**Slices:**
- **8a.** Send claim invite: server action `sendRosterTalentClaimInvite(tenantSlug, talentId)`. Generate signed token, write to `talent_invitations` table, send email (uses Phase 7's email service).
- **8b.** Claim endpoint: `/api/talent/claim?token=XXX`. Validates token + email match → sets `talent_profiles.user_id = auth.uid()` → clears `invitation_email` → audit logged.
- **8c.** Auto-downgrade on claim: `updateRosterTalentProfile` action checks `user_id`. When set: only allow agency to edit roster-scoped fields (status, notes, exclusivity). Identity fields (name, photos, bio) require talent's consent (capability `talent.profile.edit.delegated`).
- **8d.** RLS: add UPDATE policy on `talent_profiles` allowing agency staff write while `user_id IS NULL`, and talent self-write when `user_id = auth.uid()`. Service-role bypass remains for migrations.
- **8e.** UI: "Send invite" button on roster edit page. "Resend invite" + "Revoke invite" actions. "Awaiting claim" status visible.
- **8f.** Talent first-login experience: new talent signs up via invite link, lands on `/onboarding/talent-claim` showing pre-filled profile, confirms or rejects.

**DoD:**
- [ ] Owner adds talent (no account) → email sent → talent clicks link → signs up → profile is now owned by talent.
- [ ] Owner attempts to edit talent's bio after claim → blocked with explanatory message.
- [ ] Owner can still mark talent as inactive / change exclusivity.

---

### Phase 9 — Quality (continuous, 2 weeks dedicated)

**Goal:** Top-tier polish across all surfaces.

**Slices:**
- **9a.** Mobile responsive pass on every page. Real iPhone 13 testing. Coordinator workflows must work one-handed.
- **9b.** Accessibility audit (WCAG AA). Run axe on every route. Fix findings.
- **9c.** i18n complete (es/en parity). Find untranslated strings via lint rule. Translate.
- **9d.** Performance budget enforced: every route ≤ 200KB JS, Lighthouse ≥ 85, LCP < 2.5s on 3G.
- **9e.** Realtime: extend Phase 4's per-inquiry channels to roster, calendar, notifications. Coordinator's whole workspace updates without refresh.
- **9f.** Empty states: every list has a designed empty state with a clear next action. No blank screens.

**DoD:**
- [ ] Mobile audit checklist signed.
- [ ] axe report: zero serious/critical issues.
- [ ] i18n coverage: 100% of user-visible strings translated.
- [ ] Lighthouse perf score ≥ 85 on every primary route.

---

### Phase 10 — Launch Readiness (1.5 weeks)

**Goal:** Production-grade ops. The product can be sold and supported.

**Slices:**
- **10a.** Error tracking: Sentry/Datadog wired. P0 incidents page on-call. Alerts for: 5xx rate spike, RLS denial spike, Stripe webhook failures.
- **10b.** Audit log visible to owner: `/admin/settings/audit-log` page reads `audit_log` filtered by tenant.
- **10c.** Support tools: `/platform/admin/impersonate` (already exists?) verified working. View user session, view audit log, send password reset.
- **10d.** Custom-domain `/admin` redirect (the L2 fix from earlier audit): middleware rule rejects `/admin*` on `kind='custom'` hosts and 308-redirects to canonical app host.
- **10e.** Monitoring + alerting: uptime check on every major route. Synthetic test running every 5 min: log in as test account → load /admin → assert key elements present.
- **10f.** Status page: `status.tulala.digital` showing uptime + incident history.
- **10g.** Documentation: user-facing help pages in 8 categories. Ops runbook for deploy, rollback, incident response.
- **10h.** E2E smoke suite covering 20 critical flows.
- **10i.** Multi-tenant RLS verified zero-leak (Plan §22.9 gate). Run automated cross-tenant query test on every PR.
- **10j.** Backups verified: restore Impronta data to a staging Supabase instance and confirm full recovery.

**DoD:**
- [ ] All 10 sub-items checked.
- [ ] Pre-launch checklist (separate doc) signed off.
- [ ] Owner can self-onboard a new tenant from scratch in <10 min, verified by recorded screencast.

---

## 4. Cadence & Working Style

- **Phase length:** 1–3 weeks each. Hard cutoff. Anything not done becomes Phase X+1 backlog or v2.
- **Daily:** I push commits to `phase-1` branch. Vercel preview auto-builds. Manual `vercel promote` only when phase-end demo lands.
- **Weekly demo:** End of each phase. Live walk-through on `app.tulala.digital`. ≤30 min.
- **Phase entry criteria:** previous phase DoD signed. No "let's start phase N+1 while finishing phase N" — produces partial states.
- **Bug bar:** S1 found mid-phase = stop, fix, resume. S2 found = log to "follow-ups", fix in next quality window. S3+ = quarterly polish pass.
- **Parallel-agent protocol:** at start of each phase, identify which prototype files this phase will touch. Coordinate with page-builder agent before starting. If conflict, branch off + rebase post-handoff.

---

## 5. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Parallel page-builder agent merge conflicts on `_pages.tsx` / `_state.tsx` | High | Medium | Coordination protocol (§4); branch + rebase; if conflict every phase, isolate phase work to new files |
| Schema migrations break in production | Low | High | Run on staging Supabase first; reversible migrations only; backup before every prod migration |
| Stripe webhook flakiness in prod | Medium | High | Already partly hardened; add retry queue + alert on >1% failure rate (Phase 10a) |
| Custom domain DNS/SSL ops complexity (Phase 7c) | High | Medium | Per SaaS Plan §22, this requires human-in-loop. Build UI + status; ship manual ops path; automate later. |
| Realtime channel bloat (Phase 4b) | Medium | Medium | Per-inquiry channels scoped narrowly; monitor connection count; pool if needed |
| Mock fallback removal (Phase 1f) reveals broken empty states | Medium | Low | Build `EmptyShellState` component first; verify on every list before flipping the switch |
| Production scope decision (Phase 6) keeps sliding | Medium | High | Force decision in Week 7. Default if no decision: defer all production work, redirect page. |
| RLS regression slipped past tests (Phase 10i) | Low | Critical | Cross-tenant RLS test runs on every PR; deploy blocked if failing |
| 10-min activation arc fails for new agency | Medium | High | Phase 2c persists progress; Phase 7 wires self-service; full E2E test on every release |
| Top-tier polish work (Phase 9) creates regression in Phase 1–8 | Low | Medium | Full E2E suite (Phase 10h) gates the polish phase |

---

## 6. Parallel-Agent Coordination

The page-builder agent currently owns:
- `web/src/components/edit-chrome/**`
- `web/src/lib/site-admin/sections/**`
- `web/src/lib/site-admin/builder-node/**`
- Likely active in `_pages.tsx` (Website page section) and `_state.tsx` (WEBSITE_STATE)

**My territory (this plan):**
- `web/src/app/(workspace)/[tenantSlug]/admin/**` (layout, server-rendered banners, route handlers)
- `web/src/app/prototypes/admin-shell/_data-bridge.ts` (loader extensions)
- `web/src/app/prototypes/admin-shell/_pages.tsx` (chrome rendering only — top bar lines 1100–1330)
- `web/src/app/prototypes/admin-shell/_state.tsx` (additive types only — no removal of constants)
- New files: `lib/server-actions/admin-*`, new server components, new migrations

**Shared territory (requires explicit handoff):**
- `_pages.tsx` body (Operations, Production, Website page renders)
- `_state.tsx` constant definitions (TENANT, MY_TALENT_PROFILE, RICH_INQUIRIES)
- `_drawers.tsx` (page-builder may add drawers; I touch wired-action drawers)

**Protocol:**
1. Before starting any phase that touches shared territory: check `git log -- <file>` for parallel-agent commits in last 24h. If active, ping Oran for handoff.
2. Each commit message tags the territory: `feat(workspace-chrome): ...`, `feat(page-builder): ...`, `feat(workspace-admin/Schema): ...`. Reviewer can grep.
3. If conflict during merge: I rebase mine. Page-builder work has priority (their context window is fresh; mine is stable in the phase plan).

---

## 7. Open Questions Needing Your Decision

| # | Question | Why it matters | Default if no answer |
|---|---|---|---|
| Q1 | **Production page scope** (Phase 6): v1-min (callsheets+rights), v1-full (+casting+crew+on-set), or defer all? | 4-week swing | Defer all — redirect with "Coming Q3" banner |
| Q2 | **Email service**: SendGrid, Resend, or Supabase SMTP? | Phase 7 unblock | Resend (best DX, fits Vercel) |
| Q3 | **Charts library**: Recharts, Chart.js, Tremor, or build custom? | Phase 5 unblock | Recharts (mature, bundle-friendly) |
| Q4 | **Realtime budget** (Phase 4b): pay for Supabase realtime add-ons or DIY polling? | Cost vs latency | Supabase realtime — already on platform |
| Q5 | **Mobile-first commitment**: design system update needed or constrain to current components? | Phase 9a scope | Constrain to current; mobile responsive ≠ mobile redesign |
| Q6 | **Multi-tenant pricing** for `tulala.digital` itself (the platform): is the `/platform/admin` already complete or part of this plan? | Plan boundary | Out of scope — separate Plan |
| Q7 | **Talent + Client portals** quality: same plan or separate? | Plan boundary | Separate plan; this one is admin-only. |

---

## 8. Sign-off

This plan is a draft. Before I execute Phase 1, I need:
1. **Sign-off** that the phasing is right (or where it isn't).
2. **Answers to Q1–Q7** (or "defer to your default").
3. **Parallel-agent coordination window** for Phase 1 — the moment to start cleanly.

Once signed:
- Branch from `phase-1` HEAD as `saas/admin-master-plan`.
- Phase 1 starts. Daily commits. Weekly demos.
- Vercel previews on every push; production promotions only at phase-end demos.

**Estimated timeline if started Monday next week:**
- Phase 1 done: end of Week 1.5
- MVP slice (Phases 1–3) done: end of Week 5.
- Top-tier shipped (Phases 1–10): end of Week 16.

---

## Appendix: Quick-Reference Scoreboard

| Phase | Weeks | Status | Demo URL on completion |
|---|---:|---|---|
| 1 — Truth in chrome | 1.5 | Pending sign-off | Top-bar shows real Impronta data, banner deleted |
| 2 — Schema + real data | 2 | Pending Phase 1 | Real photos, audit log, persistent activation |
| 3 — Drawer actions | 1.5 | Pending Phase 2 | Every button mutates DB |
| 4 — Inquiry pipeline | 2 | Pending Phase 3 | Realtime state, versioned offers, atomic booking |
| 5 — Operations | 3 | Pending Phase 4 | 4 real charts + CSV export |
| 6 — Production | 1+4 | Decision pending | Callsheets PDF + rights tracker (v1 min) |
| 7 — Settings | 1 | Pending Phase 6 | Self-serve team, branding, domain |
| 8 — Owner-adds-talent | 1 | Pending Phase 7 | Invite → claim → auto-downgrade E2E |
| 9 — Quality | 2 | Pending Phase 8 | Mobile + a11y + i18n + perf passing |
| 10 — Launch readiness | 1.5 | Pending Phase 9 | Sentry, status page, audit UI, RLS gate green |
| **Total** | **~16 wk** | | Top-tier production-ready agency admin workspace |
