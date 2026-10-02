# Support Desk — Phase 0 audit + architecture decision memo

**Date:** 2026-10-02  
**Branch audited:** `origin/main` @ post-#2472 tip; 1a facts from `feat/support-desk-flag-host` (#2473)  
**SPEC:** [`SPEC.md`](./SPEC.md) · [#2472](https://github.com/orantene/impronta-app/pull/2472) merged · **directive: skip mockups, ship live Desk**  
**Phase 0.5:** [#2477](https://github.com/orantene/impronta-app/pull/2477) — optional reference only; **not a gate**  
**1a:** [#2473](https://github.com/orantene/impronta-app/pull/2473) — flag / host / cookies / local QA stub  
**1b/1c:** **UNBLOCKED** — build real Desk product now  
**Context extras:** `internal/support-desk-phase0-reuse.md`, `internal/support-desk-phase0-audit.md`, `internal/support-desk-phase1a-flag-host-patterns.md`

**Verdict:** Platform support **engine is largely shipped** (tickets, messages, events, HQ, requester launcher, guest chat, AI auto-send, crons, RLS). Desk product shell is what 1b/1c build. No second ticket system. No agency helpdesk.

**Oran directive (binding):** Skip mockup path. Ship real Desk. Do not gate 1b/1c on design asks, `:3099`, or 1:1 mockup parity. Memo defaults D1–D10 apply if silent.

**This PR:** docs only — no Desk UI here.

---

## Architecture decision memo (defaults — live implementation)

| # | Decision | Live default / 1a contract | Owner |
|---|---|---|---|
| D1 | Desk host | `support.tulala.digital` (+ future `desk.tulala.digital`; local `support.local` / `desk.local`) as `kind=app` | 1a |
| D2 | Flag | `isSupportDeskEnabled()` — explicit `0/1`; unset → ON only local `development` without Vercel; **OFF** when `VERCEL_ENV` is production/preview | 1a |
| D3 | Flag-off | Proxy 404 `/_page-not-found` on Desk hosts; local `/platform/admin/support/desk` → `notFound()` | 1a |
| D4 | Cookies | `isHostScopedAuthHost` — Desk hosts **never** get `Domain=.tulala.digital` | 1a |
| D5 | Email interim | #2470 Gmail forward + `hello@`; Desk email SoT = Phase 3 | merge lane |
| D6 | AI | Engine auto-sends today; Desk v1 human replies; draft/approve = Phase 5 | 1b+ / 5 |
| D7 | Agents | Oran via `super_admin` first; agent seats = Phase 2 | 2 |
| D8 | Journey 7 | Show presence; **server-auth** presence channel in 1c; full collision = Phase 4 | 1c |
| D9 | DESK-QA | Seed + cleanup before unblurred screenshots | ops |
| D10 | Status | Keep `open\|resolved\|closed` + `waiting_on`; richer UI mapping OK | 1b |

**1b/1c GO checklist (owners):**

1. Reuse `hq-actions` / `load-hq` / engine — no parallel ticket writes.
2. Real three-pane Desk (SPEC §6) behind flag; replace 1a QA stub copy that still mentions mockup wait.
3. Wire existing queue + thread + resolve/reopen/reply/note.
4. HQ **"Open Support Desk ↗"** (new tab, same auth model as host-scoped cookies allow).
5. Keyboard per SPEC §6; ignore shortcuts in inputs.
6. Journey 7: presence + **server-auth** (public `tulala.presence.support.*` is not enough).
7. Journeys **2, 7, 23–28**; truthful failed-send; retry no duplicate.
8. Mobile stack (not three panes squeezed). Fix defects even if a design-reference HTML disagrees.

---

## 1. Support architecture

| Layer | Location | Role |
|---|---|---|
| Engine | `web/src/lib/support/` | Create/append/status/escalate/claim; writes via service role |
| HQ UI | `web/src/app/(workspace)/platform/admin/support/` | Queue, drawer, insights, ideas, canned, diagnostics, replay |
| Requester UI | `web/src/components/support/` | Launcher/panel (workspace / talent / client) |
| Guest / marketing | `web/src/components/marketing/support/` | Marketing launcher, `/contact`, guest chat |
| Desk flag/host (1a) | `desk-flag.ts`, `desk-hosts.ts`, `desk-host.ts`, `proxy.ts` | Kill-switch + host admission |
| Local Desk QA (1a) | `/platform/admin/support/desk` | Stub until 1b replaces with real shell |
| AI / crons / email | existing APIs + Resend delivery; #2470 inbound forward | See §6–7, §15 |

**Reuse rule:** Desk shell calls existing HQ/engine paths only.

---

## 2. Ticket and message lifecycle

DB statuses: **`open` | `resolved` | `closed`**. `waiting_on` ∈ `{support, requester}` when open. `handled_by` ∈ `{ai, human}`.

| Event | Behavior |
|---|---|
| Create | `open`, `waiting_on=support` |
| Resolve | `resolved` + `resolved_at` |
| Close | Cron resolved→closed ~72h; or HQ close |
| Reopen | Explicit, or auto on requester message when resolved |
| Escalate | `handled_by=human` + reason; default assignee earliest super_admin |

Messages: `author_kind` requester|agent|ai|system; `message_kind` text|card|system|**note** (internal). SPEC richer statuses = UI mapping first (D10).

---

## 3. Database + RLS map

Migrations `20261213000000` → guest / escalation reasons. Pattern: SELECT via RLS; writes service-role only. Guest tickets: service role after ownership check. 1a adds `agency_domains` seed for support host (`20261231320000_support_desk_host.sql` on #2473). Further Desk migrations sort after newest file at build time.

---

## 4. Auth and permission map

| Actor | Today | Target |
|---|---|---|
| super_admin | Full HQ | Desk + HQ |
| support_agent | **missing** | Phase 2 |
| Requester / guest | Existing access | Unchanged |

HQ gate: `assertHqAccess` → `app_role === super_admin` only (`PLATFORM_ROLE_KEYS`).

---

## 5. Routes + host routing

| Route / host | Notes |
|---|---|
| `/platform/admin/support` | Existing HQ — keep |
| `/platform/admin/support/desk` | Local QA; flag → `notFound()` when off; **1b replaces stub with real shell** |
| `support.tulala.digital` | Desk host; proxy 404 when flag off |
| Marketing `/support` | Unrelated positioning page |

---

## 6. AI flows

Auth + guest chat auto-persist AI messages. Guardrails + guest turn ceiling 6. **SPEC draft/approve ≠ current engine** — do not label auto-send as draft in Desk UI until Phase 5.

---

## 7. Cron + notifications

`support-lifecycle`, `support-insights`, `support-weekly-digest`, `reap-guest-support`, `reap-support-replays`. Kind `ticket` notifications — deep links must open Desk conversation when shell ships.

---

## 8. UI screenshots

Deferred until DESK-QA seed. Capture live Desk (not mockups) on QA host with seeded tickets only.

---

## 9. Mobile

HQ is queue+drawer. Desk must implement SPEC mobile stack (list → thread → context sheet). Verify 390/360, keyboard-open composer.

---

## 10. Tests + coverage

1a: `desk-flag.test.ts`, `desk-host.test.ts`, `cookie-domain.test.ts`. Still needed: presence server-auth, engine journey coverage, Desk e2e for §20 Phase 1 journeys.

---

## 11. Duplicate / dead

`supportPresenceKey()` unused; UI uses ``support.${ticketId}``. Address drift cleaned by #2470 path. 1a stub copy still mentions mockup wait — **1b must delete that language**.

---

## 12. Missing → phase

| Gap | Phase |
|---|---|
| Real Desk shell | **1b** GO |
| Keyboard + HQ link + presence auth | **1c** GO |
| Agent roles | 2 |
| Email → tickets | 3 |
| Collision / merge / SLA UX | 4 |
| AI draft approve | 5 |
| Rich context sidebar | 6 |

---

## 13. Security risks

| Risk | Mitigation |
|---|---|
| Shared `.tulala.digital` cookie on Desk | 1a host-scoped hosts |
| Flag-off still serving | 1a proxy 404 |
| Public presence channel | **1c server-auth** |
| Soft claim ≠ lock | Phase 4; 1c presence only |
| AI auto-send | Flags + later draft path |

---

## 14. Retention / privacy

Guest reaper + replay reap exist. localhost/QA → prod DB: DESK-QA seed/cleanup required. Notes must never look customer-visible.

---

## 15. Email

#2470 = interim forward to Gmail. Phase 3 = Resend inbound → `support_tickets` / messages (Message-ID / In-Reply-To). Gmail never SoT.

---

## 16. Phase / PR plan

| Phase | Status |
|---|---|
| 0 SPEC + audit | SPEC merged; this audit → merge #2479 |
| 0.5 mockups | **Skipped as gate** |
| 1a | #2473 — merge when green |
| **1b / 1c** | **Build now** — real product |
| 1d | Journeys 2/7/23–28 evidence |
| 2–6 | Per SPEC / memo |

---

## 17. Migration plan

1a host seed additive. 1c optional private realtime for presence. 2 roles. 3 inbound email columns. 4 spam/merged/snooze flags. Always `db:push` before merge of migration PRs.

---

## 18. Risks + open (non-blocking)

D1/D4/D5 defaults stand. **No open design questions.** Do not AskQuestion / ping Oran for mockup review.

---

## 19. Acceptance

### Phase 0
- [x] SPEC + live-implementation directive
- [x] Audit 1–20 + Oran additions
- [x] Mockup path skipped; 1b/1c unblocked
- [ ] #2479 merged; DESK-QA screenshots later

### Phase 1a
- Flag/host/cookie tests green; stub OK until 1b

### Phase 1b–1d
- Live Desk meets SPEC §6 / journeys / §23 — not mockup HTML

---

## 20. Journey-to-phase map

| # | Journey | Phase |
|---|---|---|
| 2, 23–28 | In-app ticket, resolve/reopen, search, mobile, network, retry, realtime | **1** |
| 7 | Two agents — presence+auth **1**; full collision **4** | 1 / 4 |
| 1, 3–4, 14–16 | Contact/email/attachments | 3 |
| 5–6, 8, 11, 13, 21–22 | Reopen UX, drafts, escalate, merge, SLA, snooze | 4 |
| 9–10, 17, 29 | AI draft paths | 5 |
| 12, 18–19 | Rich context | 6 |
| 20 | Unauthorized tenant | 2 |
| 30 | Honest final response | 3–5 |

---

## Oran additions (closed)

- **A. Host-scoped cookies** — implemented in 1a (`isHostScopedAuthHost`).
- **B. Flag-off=404** — implemented in 1a proxy + desk page `notFound()`.
- **C. DESK-QA** — still needed before prod screenshots.
- **D. #2470 interim** — merge lane; not Desk SoT.
- **E. Phase 2–3** — agents then inbound→tickets.
- **F. Journey 7 presence server-auth** — **1c must ship**; today public broadcast only.

---

## End-of-phase report (Phase 0)

1. **Discovered** — Engine/HQ complete enough to productize; gaps = Desk shell, agents, email ingest, presence auth.
2. **Implemented** — SPEC directive + this memo; no Desk UI in this PR.
3. **Reused** — `lib/support` + HQ for 1b/1c.
4. **Data-model** — none in audit PR; 1a host seed separate.
5. **Tested** — read-only audit; 1a unit tests on that branch.
6. **Incomplete** — DESK-QA screenshots; #2479 merge.
7. **Risks** — §13; stub copy still says mockup-wait until 1b edits it.
8. **Decisions from Oran** — none blocking; mockup path skipped.
9. **Evidence** — SPEC; this file; #2473; #2470; #2477 optional.
10. **Next** — Merge #2479 → 1a → **1b/1c ship live Desk**.
