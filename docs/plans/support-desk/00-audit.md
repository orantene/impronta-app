# Support Desk — Phase 0 audit + architecture decision memo

**Date:** 2026-10-02  
**Branch audited:** `origin/main` @ `25c64199a` (post-fetch)  
**SPEC:** [`SPEC.md`](./SPEC.md) · repo PR [#2472](https://github.com/orantene/impronta-app/pull/2472)  
**Context extras (agent store):** `internal/support-desk-phase0-reuse.md`, `internal/support-desk-phase0-audit.md`, `internal/support-desk-phase1a-flag-host-patterns.md`.

**Verdict:** The platform support **engine is largely shipped** (tickets, messages, events, HQ at `/platform/admin/support`, requester launcher, guest marketing chat, AI auto-send, 5 crons, RLS). There is **no Support Desk product shell**, **no support-agent role**, **no email→ticket ingestion**, and **no `SUPPORT_DESK_ENABLED` kill-switch**. Phase 1 must reuse the engine; it must not invent a second ticket system.

**Oran must approve** (§18 defaults + domain) before any Phase 1 Desk UI merges. Phase 1a (flag/host/404 only) may proceed in parallel.

**No Desk UI in this deliverable.** Screenshots of live HQ deferred — see §8.

---

## Architecture decision memo (Oran)

| # | Decision | Recommended default | Blocks |
|---|---|---|---|
| D1 | Desk host | `support.tulala.digital` (`kind=app`, `tenant_id NULL` in `agency_domains`); alias `desk.tulala.digital` later | DNS + seed + Phase 1a |
| D2 | Flag | `SUPPORT_DESK_ENABLED` — ON in `development` when unset; OFF in production when unset; explicit `0`/`1` override. Mirror `talentStudioV2Enabled`. | Phase 1a |
| D3 | Flag-off behavior | Registered support host → rewrite `/_page-not-found` **404** (not unregistered). Local QA `/platform/admin/support/desk` also 404 when off. Existing HQ `/platform/admin/support` stays up. | Phase 1a |
| D4 | Auth cookies on Desk host | **Host-scoped only.** Exclude `support.tulala.digital` / `desk.tulala.digital` from `cookieDomainForHost` so cookies are **never** `.tulala.digital`. Desk login must not leak a shared parent-domain session to marketing/app. | Phase 1a / login |
| D5 | Email interim | Merge [#2470](https://github.com/orantene/impronta-app/pull/2470) as **Gmail forward + `hello@` constant** only. Desk is **not** email SoT until Phase 3. Do not finish Gmail-as-SoT. | Merge lane |
| D6 | AI in Desk v1 | Drafts requiring human approve-before-send. Today’s engine **auto-sends** AI — Desk must not expose that as “draft” without a new draft path (Phase 5). | Phase 5 (note in Phase 1 copy) |
| D7 | Agents | Oran = first agent via existing `super_admin`. Human-agent seats = **Phase 2**. | Phase 2 |
| D8 | Journey 7 (Phase 1) | Presence UI OK to surface; **server-auth the presence channel** before claiming multi-agent safety. Full collision/draft locks = Phase 4. | Phase 1c |
| D9 | DESK-QA | Seeded test tickets + cleanup scripts required before any HQ/Desk screenshots or browser QA against prod DB. | All visual QA |
| D10 | Status model | Keep DB enum `open\|resolved\|closed` + `waiting_on` in Phase 1; map richer SPEC statuses in UI; additive columns/flags later. | Phase 1 / 4 |

**Open for Oran (defaults above apply if silent):** confirm D1 host name; confirm D4 cookie exclusion list; confirm #2470 merge before Desk email work.

---

## 1. Support architecture

### What exists

| Layer | Location | Role |
|---|---|---|
| Engine | `web/src/lib/support/` (~85 files) | Create/append/status/escalate/claim; **all writes via service role** |
| HQ UI | `web/src/app/(workspace)/platform/admin/support/` | Queue, drawer, insights, ideas, canned, diagnostics, replay, propose-fix |
| Requester UI | `web/src/components/support/` | In-app launcher/panel (workspace / talent / client) |
| Guest / marketing | `web/src/components/marketing/support/` | Marketing launcher, `/contact`, guest chat |
| AI APIs | `api/ai/support-chat`, `api/ai/guest-support-chat` | Auto-persist AI messages |
| Crons | `support-lifecycle`, `support-insights`, `support-weekly-digest`, `reap-guest-support`, `reap-support-replays` | Lifecycle + learning + retention |
| Emails / notifs | `web/emails/support/*`, `catalog-entries-support.ts` | Ticket lifecycle mail |
| Contact constant | `web/src/lib/platform/support-contact.ts` | `hello@tulala.digital`; `SUPPORT_EMAIL_CAN_RECEIVE=false` on main |

### One engine, two UIs today

- **HQ** = Platform Admin Support (super_admin only). Soft-claims on first reply (`claimIfUnassigned`).
- **Requester** = launcher gated by `platform_settings.workspace_support_enabled`.
- **Guest** = marketing surface=`guest`; signed cookie session; claim-on-auth by verified email.

**There is no agency-owned helpdesk.** Agency inbox / website forms are separate products. Desk v1 = Tulala platform only.

### Reuse rule

Desk shell (Phase 1) must call existing `hq-actions` / loaders / engine. Do not duplicate ticket or message write paths.

---

## 2. Ticket and message lifecycle

### Current status enum (code wins)

DB + types: **`open` | `resolved` | `closed`**.  
`waiting_on` ∈ `{support, requester}` only when `status=open`.  
`handled_by` ∈ `{ai, human}`. Priority `low|normal|high|urgent`.

### Transitions

| Event | Behavior |
|---|---|
| Create | `open`, `waiting_on=support` |
| Resolve | `resolved`, `resolved_at`, clear waiting_on; notify |
| Close | Lifecycle cron: resolved >72h → `closed`; or HQ close |
| Reopen | Explicit reopen, or auto on requester message when `resolved` |
| Escalate | `handled_by=human`, reason, default assignee = earliest super_admin |
| Idle | 5d warning / 7d auto-resolve when waiting on requester |

### Messages

- `author_kind`: `requester` \| `agent` \| `ai` \| `system`
- `message_kind`: `text` \| `card` \| `system` \| `note` (internal; RLS hides from non–platform-admin)

### SPEC gap

SPEC wants new / waiting-on-agent / waiting-on-customer / snoozed / escalated / reopened as first-class statuses. **Recommendation:** keep enum; express richer states via `waiting_on` + flags (`spam`, `merged`) + UI mapping until Phase 4 migration is approved.

---

## 3. Database + RLS map

### Migration chain (support)

`20261213000000_support_tickets_core` → `…000008_support_realtime_private` → round2 / canned / attachments / digests → `20261216000000` feature requests → `20261219000000` guest → `20261227000004` escalation reasons.

### Core tables

`support_tickets`, `support_messages`, `support_message_reads`, `support_ticket_events`, `support_attachments`, `support_ticket_diagnostics`, `support_replay_sessions`, `support_proposed_actions`, `support_ticket_insights`, `support_ticket_fix_links`, `support_feature_requests` (+ votes), `support_weekly_digests`, `support_insights_rollup`.

### RLS pattern

ENABLE RLS; **SELECT** for authenticated with ticket predicates; **REVOKE writes** from `authenticated`/`anon`. Writes = service role after server asserts.

| Table | SELECT |
|---|---|
| tickets / messages / events | requester; workspace staff (`surface=workspace`); `is_platform_admin()` |
| notes | platform admin only |
| diagnostics / insights / digests | platform admin |
| guest-only tickets | **not** via anon RLS — guest UI uses service role after ownership check |

Newest unrelated migrations sit at `20261231310000_*`. Desk migrations must sort **after** the newest file at build time (`date -u +%Y%m%d%H%M%S`).

---

## 4. Auth and permission map

| Actor | Today | Desk target |
|---|---|---|
| Owner / super_admin | Full HQ via `assertHqAccess` → `requireAdmin` (`app_role === super_admin`) | Same + Desk host |
| Human support agent | **Does not exist** (`PLATFORM_ROLE_KEYS = ["super_admin"]` only) | Phase 2 |
| Specialist / engineer | Escalation lands on super_admin | Phase 2+ |
| AI identity | `author_kind=ai` messages; not a login | Keep; draft path Phase 5 |
| Workspace staff / talent / client | Create/list own tickets | Unchanged |
| Guest | Signed cookie + abuse guards | Unchanged |
| Unauthorized / other tenant | Blocked by RLS + asserts | Phase 2 journey 20 |

**Phase 2 preview (agent roles):** add platform role(s) e.g. `support_agent` / `support_specialist` with Desk-only capabilities (no automatic Platform Admin). Seed Oran as owner; invite seats later. RLS + `assertHqAccess` must expand beyond `super_admin` before any non-owner agent logs in.

---

## 5. Routes + host routing

| Route | Host kind | Notes |
|---|---|---|
| `/platform/admin/support` | app | Existing HQ — keep |
| `/platform/admin/support/desk` | app (local QA) | Phase 1; flag-gated |
| Desk root on `support.tulala.digital` | app (new row) | Prefer `/` or `/desk` — avoid clash with marketing `/support` |
| `/api/platform/support/...` | agency + app | Already allow-listed |
| `/api/ai/support-chat` | agency + app | Not marketing |
| `/api/ai/guest-support-chat` | marketing | Guest only |
| `/support`, `/help`, `/contact` | marketing | Positioning / contact — not Desk |

**Host admission:** `proxy.ts` → `agency_domains` only → unregistered = 404. Label `support` is already reserved (workspace slug + talent-site subdomain list in QA pool migration).

**Phase 1a kill-switch (recommended insert):** after `not_found` handling in `proxy.ts`, if hostname is support Desk host and `!isSupportDeskEnabled()` → rewrite `/_page-not-found` status 404.

---

## 6. AI flows and safety limits

- Auth chat: session + ticket access; skip if `handled_by=human`; human-prefilter; corpus grounding; 20s timeout; sanitize (no refund/legal invention; URL allow-list; 1200 chars).
- Guest chat: abuse floor + IP limit; turn ceiling **6**.
- Confidence &lt;0.4 / escalate signal / fail-open → human handoff.
- **Critical SPEC mismatch:** AI **auto-sends** today. SPEC v1 requires human approval. Desk must not label auto-sent AI as “draft”. Real draft/approve UI = Phase 5; until then HQ continues direct human replies.

---

## 7. Cron + notification behavior

| Cron | Job |
|---|---|
| `support-lifecycle` | close / idle warn / auto-resolve / re-alert / expire proposed |
| `support-insights` | insights on closed tickets |
| `support-weekly-digest` | Monday digest → platform admins |
| `reap-guest-support` | delete unconverted guest tickets |
| `reap-support-replays` | expire replay storage |

Notifications kind `ticket`: created, escalated, resolved, reply, autoclose, agent message, guest confirm, proposed expiry, weekly digest, feature request. Deep links must continue to open the correct conversation when Desk ships.

---

## 8. UI screenshots

**Status: deferred (intentional).**

- No DESK-QA seed yet (§ Oran: DESK-QA).
- Agents must not open real customer tickets unblurred (AGENTS.md / work order).
- Existing HQ lives at `/platform/admin/support` on app host — capture after DESK-QA seed on a QA host (`qa-N.tulala.digital`) with bypass header.

**Required set (when unblocked):** desktop wide + narrow, 390px, light + dark, empty queue, active seeded ticket, error state, existing Platform Admin Support. Store under `docs/plans/support-desk/screenshots/` (or Context `media/support-desk/`).

---

## 9. Mobile problems (existing HQ)

HQ is a **desktop queue + drawer** pattern (`SupportQueueClient` + `SupportTicketHqDrawer`). It is not a three-step mobile stack (list → thread → context sheet). Expected Phase 1 Desk mobile issues to design for (Phase 0.5 mockups own the target):

- Drawer-on-list squeezes on &lt;768px
- Composer vs on-screen keyboard
- Context panel not a bottom sheet today
- Long threads / attachments / notes need full-screen conversation

SPEC Phase 1 mobile: queue → conversation → full-screen thread → context sheet. **Do not squeeze three panes.**

---

## 10. Tests + coverage

Strong unit/static coverage around AI guardrails, guest claim/abuse, corpus, HQ presentation, deep links, surface allow-list for guest-chat.

**Gaps for Desk:**

- No `SUPPORT_DESK_ENABLED` / support-host 404 tests (add beside `suspended-workspace-gate.test.ts`)
- No cookie-domain exclusion test for support host
- Little engine integration coverage for status transitions
- No RLS policy tests dedicated to support tables
- No e2e Desk journeys (2, 7, 23–28)
- Journey 7 presence lacks **server authorization** tests

---

## 11. Duplicate or dead code

| Item | Note |
|---|---|
| `supportPresenceKey()` | Defined in `support-types.ts`, unused; UI hardcodes `` `support.${ticketId}` `` |
| Address drift | Product `hello@`; some historical `support@` / `impronta.group` — #2470 cleans |
| Migration comments “guest unused in v1” | Stale — guest live since `20261219` |
| Agency “support email” settings placeholder | Not platform support — leave alone |

---

## 12. Missing functionality (vs SPEC)

| Capability | Phase |
|---|---|
| Desk three-pane shell + mobile stack + keyboard | 1 |
| `SUPPORT_DESK_ENABLED` + support host 404 | 1a |
| Host-scoped Desk cookies | 1a |
| Server-auth presence (journey 7) | 1c |
| Support agent / specialist roles | **2** |
| Resend inbound → ticket create/reply (Desk SoT) | **3** |
| Full collision, merge, SLA timers, snooze locks | 4 |
| AI draft approve-before-send | 5 |
| Rich booking/payment context sidebar | 6 |
| DESK-QA seed/cleanup | 0→1 (ops) |

---

## 13. Security risks

| Risk | Severity | Mitigation |
|---|---|---|
| Shared `.tulala.digital` auth cookie on Desk host | High if Desk agents are non-owners | **Exclude support/desk hosts from `cookieDomainForHost`** (D4) |
| Flag-off host still serves if only UI-hidden | High | Proxy 404 when flag off (D3) |
| Presence channel `tulala.presence.support.{id}` is **public broadcast** — no ticket ACL | Medium | Server-auth / private channel before multi-agent (D8) |
| Soft claim ≠ lock — two admins can both reply | Medium | Phase 4 collision; Phase 1 show presence only |
| AI auto-send + cost/abuse | Medium | Flags + guest ceiling; Desk draft path later |
| Investigation bundle tokens | Medium | Treat as secret; don’t log |
| Guest claim by email | Low if verified-only | Keep confirmed-email match |
| Cross-tenant via wrong host | Low if gate holds | Keep agency_domains + RLS |

Never rely on frontend hiding for Desk security.

---

## 14. Retention and privacy risks

- Guest reaper deletes unconverted guest tickets after retention days — good.
- Replay reap behind `REAP_SUPPORT_REPLAYS_ENABLED`.
- localhost / QA hosts write to **production DB** — DESK-QA seed + cleanup mandatory; blur real PII.
- Internal notes must never render as customer-visible (RLS helps; Desk UI must also distinguish).
- Export / audit history for Desk still thin — Phase 4+.

---

## 15. Email architecture options

| Option | Pros | Cons | Recommendation |
|---|---|---|---|
| **A. #2470 interim: Resend `email.received` → Gmail forward** | Unblocks mailbox + `hello@` now | HQ never sees email | **Do now** (Track C) |
| **B. Gmail as SoT + manual paste into HQ** | Familiar | Disconnected records; violates SPEC | Reject |
| **C. Resend inbound → Desk tickets (Message-ID / In-Reply-To + reply-token)** | One conversation, one record | Needs schema + ingest + spam/bounce | **Phase 3 SoT** |
| **D. Dual-write Gmail + Desk** | Safety net | Drift / duplicates | Optional copy only after C |

Addresses: `hello@`, `help@`, `support@tulala.digital` — product constant today is `hello@`. Receiving switch `NEXT_PUBLIC_SUPPORT_EMAIL_CAN_RECEIVE` stays off until Oran proves MX.

**Phase 2–3 email preview:** after agent roles (Phase 2), Phase 3 implements inbound ingest into `support_tickets` / `support_messages`, thread matching, outbound Reply-To, attachments, bounce/suppression wiring to existing Resend delivery webhook. Until then, #2470 stores/forwards only.

---

## 16. Phase plan with PR breakdown

| Phase | PRs (max) | Scope | Gate |
|---|---|---|---|
| **0** | docs | SPEC (#2472) + this audit | Oran memo OK for merge of 1b+ |
| **0.5** | design | `01-design.md` + :3099 mockups | Oran design OK before 1b/1c |
| **1a** | 1 | Flag + host seed + 404 test + cookie exclude + mockup infra only | No prod Desk UI |
| **1b** | 1 | Desk shell 1:1 mockups; reply / note / resolve / reopen | After design OK |
| **1c** | 1 | Keyboard + HQ “Open Support Desk ↗” + journey 7 presence **server-auth** | After design OK |
| **1d** | 1 | Journeys 2, 7, 23–28; truthful failed-send | Memo OK |
| **2** | 2–3 | Agent roles, Desk-only auth, journey 20 | Oran |
| **3** | 2–3 | Resend inbound → tickets; journeys 1,3,4,14–16,30 | After #2470 + MX proof |
| **4** | 3–4 | Collision, merge, SLA, snooze, escalate UX | |
| **5** | 2–3 | AI drafts + approval | |
| **6** | 2–3 | Rich customer context | |

Work-order cap: Phase 1 ≤ 3–4 PRs behind flag.

---

## 17. Migration plan

| When | Change | Notes |
|---|---|---|
| 1a | `agency_domains` row for `support.tulala.digital` (`kind=app`) | Additive seed; may be SQL migration or ops script — prefer migration for prod parity |
| 1a | No schema for flag (env only) | |
| 1c | Optional: private realtime policies for `support.{ticketId}` presence topics | Mirror replay private channel pattern |
| 2 | `platform_roles` / capabilities for `support_agent` | Expand beyond `PLATFORM_ROLE_KEYS` |
| 3 | Inbound email metadata columns (Message-ID, In-Reply-To, reply token, channel=`email`) | Additive |
| 4 | Flags `is_spam`, `merged_into_id`; optional snooze_until; richer status only if UI mapping fails | Additive unless Oran approves destructive |

Always: version after newest migration; `npm run db:push` before merge; `deploy:smoke` after prod.

---

## 18. Risks + open decisions (defaults)

See memo table at top. Additional risks:

- Parallel Phase 0.5 / 1a / #2470 / gallery tracks — merge lane discipline.
- AI auto-send vs SPEC draft language — documentation debt if Phase 1 copy overclaims.
- Cookie change on support host must not break intentional marketing↔app session share for other hosts.

---

## 19. Acceptance criteria per phase

### Phase 0 (this doc)
- [x] SPEC landed (repo + Context); PR opened
- [x] Audit sections 1–20 + Oran additions
- [ ] Oran architecture/domain approval
- [ ] Screenshots after DESK-QA

### Phase 1a
- Flag off → support host 404 (test)
- Cookie host-scoped on support host (test)
- DNS/Vercel alias ready; no Desk UI in production

### Phase 1b–1d
- Journeys **2, 7, 23, 24, 25, 26, 27, 28** pass with evidence
- HQ link opens Desk without second ticket system
- Mobile 390/360 acceptable; keyboard shortcuts ignore inputs
- Failed send truthful; retry no duplicate

### Phase 2
- Non-owner agent can use Desk only; journey 20 denied cross-tenant

### Phase 3
- Inbound email creates/attaches tickets; Gmail optional copy only

---

## 20. Journey-to-phase map (§20)

| # | Journey | Phase | Notes |
|---|---|---|---|
| 1 | Guest contact-form → ticket | 3 | Form exists; email channel polish in 3 |
| 2 | In-app chat → ticket | **1** | Engine live; Desk surfaces it |
| 3 | Email creates ticket | **3** | After #2470 interim |
| 4 | Email reply attaches | **3** | |
| 5 | Reply after resolution | 4 | Auto-reopen exists; Desk UX in 4 |
| 6 | Duplicate messages | 4 | |
| 7 | Two agents same conversation | **1** presence (+ **server-auth**) / **4** full collision | |
| 8 | Draft left, other replies | 4 | |
| 9–10 | AI draft / handoff | 5 | Auto-send today ≠ draft |
| 11 | Escalate payment | 4 | Reasons exist |
| 12 | Booking + payment context | 6 | |
| 13 | Merge duplicates | 4 | |
| 14–16 | Attachments / email fail | 3 | |
| 17 | Language change | 5 | |
| 18–19 | Talent / agency customer | 6 | |
| 20 | Unauthorized other tenant | **2** | |
| 21–22 | SLA / snooze | 4 | |
| 23 | Resolve + reopen | **1** | |
| 24 | Search | **1** | |
| 25 | Mobile keyboard reply | **1** | |
| 26–27 | Network fail / retry idempotent | **1** | |
| 28 | Realtime while viewing | **1** | |
| 29 | AI suggestion rejected | 5 | |
| 30 | Honest final response | 3–5 | |

---

## Oran additions (explicit)

### A. Host-scoped login cookie (never `.tulala.digital` on Desk)

Today `cookieDomainForHost` returns `.tulala.digital` for **any** `*.tulala.digital` (`web/src/lib/supabase/cookie-domain.ts`). A session on `support.tulala.digital` would therefore be visible on `app.` / apex / tenants.

**Required:** return `undefined` (host-only) when host is `support.tulala.digital` or `desk.tulala.digital`. Do not add parents to `SHARED_COOKIE_PARENTS`. Guest cookie pattern is already host-only — mirror that for Desk auth cookies.

### B. Flag-off = 404

`SUPPORT_DESK_ENABLED` off (production default) must 404 the Desk host at proxy, not render a soft “coming soon”. Local `/platform/admin/support/desk` likewise. Existing Support HQ remains available to super_admin.

### C. DESK-QA seed / cleanup

No `DESK-QA` scripts found. Need:

1. Seed N synthetic tickets (test accounts TAL-93900 / TAL-93901 / test guests only)
2. Mark metadata `desk_qa=true` (or dedicated subject prefix)
3. Cleanup script that deletes only seeded rows + messages/events/attachments
4. Document: never screenshot real customer tickets unblurred

### D. #2470 interim email

Merge [#2470](https://github.com/orantene/impronta-app/pull/2470) for `hello@` + Resend inbound **forward to Gmail**. Inbound stored/logged there; **Desk SoT deferred to Phase 3**. Do not block Phase 0/1a on MX proof.

### E. Phase 2–3 preview

- **Phase 2:** agent roles (`support_agent` etc.), Desk-only login, permission matrix, journey 20.
- **Phase 3:** Resend inbound → engine (`support-engine` / contact path), thread matching, outbound, spam/bounce; retire Gmail-as-primary.

### F. Journey 7 — presence server-auth

`useThreadPresence` opens `tulala.presence.${channelKey}` as a **public** Supabase channel (`web/src/lib/realtime/presence.ts`). HQ/requester use `` `support.${ticketId}` ``. Private RLS today covers **`support.replay.%` only**, not presence.

**Phase 1c must** authorize presence joins (private channel + RLS or signed token) so only ticket-visible actors appear as peers. Until then, treat presence as best-effort UX, not a security boundary. Full draft collision remains Phase 4.

---

## Evidence anchors

- Engine: `web/src/lib/support/support-engine.ts`
- Access / HQ gate: `web/src/lib/support/support-access.ts`, `hq-actions.ts`
- Types: `web/src/lib/support/support-types.ts`
- Core migration: `supabase/migrations/20261213000000_support_tickets_core.sql`
- HQ: `web/src/app/(workspace)/platform/admin/support/`
- Cookies: `web/src/lib/supabase/cookie-domain.ts`
- Proxy / host: `web/src/proxy.ts`, `web/src/lib/saas/host-context.ts`, `gate.ts`
- Presence: `web/src/lib/realtime/presence.ts`
- Platform roles: `web/src/lib/access/platform-role.ts`
- Support contact: `web/src/lib/platform/support-contact.ts`
- Resend webhook: `web/src/app/api/webhooks/resend/route.ts`
- Track C PR: https://github.com/orantene/impronta-app/pull/2470
- SPEC PR: https://github.com/orantene/impronta-app/pull/2472

---

## End-of-phase report (Phase 0)

1. **Discovered** — Full engine/HQ/guest/AI/cron stack; no Desk shell; no agent role; no email→ticket; shared cookie hazard; public presence.
2. **Implemented** — SPEC.md (repo + Context); this audit/memo. No Desk UI.
3. **Reused** — Documented reuse of `lib/support` + HQ actions for Phase 1.
4. **Data-model changes** — None yet; plan in §17.
5. **Tested** — Read-only code audit; CI pending on #2472.
6. **Incomplete** — Screenshots; Oran approval; DESK-QA scripts; SPEC merge.
7. **Risks** — §13–14; cookie + presence + AI auto-send mismatches.
8. **Decisions needed from Oran** — D1–D10 (defaults stated).
9. **Evidence links** — this file; internal dumps; #2472; #2470.
10. **Recommended next** — Merge SPEC → finish DESK-QA design in 0.5 → Phase 1a flag/host/cookie/404 → wait design OK for 1b/1c.
