# Support Desk — Phase 0 audit + architecture decision memo

**Date:** 2026-10-02 (Codex review pass same day)  
**Branch audited:** `origin/main` @ post-#2472 tip; 1a on main via #2473; product shell [#2483](https://github.com/orantene/impronta-app/pull/2483)  
**SPEC:** [`SPEC.md`](./SPEC.md) · [#2472](https://github.com/orantene/impronta-app/pull/2472) merged · **directive: skip mockups, ship live Desk**  
**Phase 0.5:** [#2477](https://github.com/orantene/impronta-app/pull/2477) — optional reference only; **not a gate**  
**1a:** [#2473](https://github.com/orantene/impronta-app/pull/2473) — flag / host / host-only cookie write / local QA stub  
**1b/1c:** [#2483](https://github.com/orantene/impronta-app/pull/2483) — live Desk product (docs classify required vs optional below)  
**Codex triage:** Context `internal/desk-codex-2479.md`

**Verdict:** Platform support **engine is largely shipped**. Desk shell is 1b/1c. No second ticket system. No agency helpdesk.

**Oran directive (binding):** Skip mockup path. Ship real Desk. Do not gate on design asks. Memo D1–D10 apply if silent — with **required** callouts below (Codex P1/P2).

**This PR:** docs only — no Desk UI here. Do not merge until required/optional language below is accurate.

---

## Architecture decision memo (defaults — live implementation)

| # | Decision | Required contract | Owner | Status |
|---|---|---|---|---|
| D1 | Desk host | `support.tulala.digital` (+ `desk.*` later; local `support.local`) as `kind=app` | 1a | Landed #2473 |
| D2 | Flag | `isSupportDeskEnabled()` — ON only local unset-dev; **OFF** on Vercel unless explicit | 1a | Landed |
| D3 | Flag-off | Proxy 404 on Desk hosts; local desk route `notFound()` | 1a | Landed |
| D4 | Desk auth cookies | **Required:** Desk hosts never set `Domain=.tulala.digital` (`isHostScopedAuthHost` → host-only). Same Supabase cookie names; isolation is host-scoped Domain. | 1a + held #2483 | **Landed** #2473 / verified #2483 |
| D5 | Email interim | #2470 Gmail forward + `hello@`; Desk SoT = Phase 3 | merge lane | Track C |
| D6 | AI | Engine auto-sends today; Desk v1 human replies; draft/approve = Phase 5 | 5 | Noted |
| D7 | Agents | Oran via `super_admin` first; seats = Phase 2 | 2 | Later |
| D8 | Journey 7 presence | **Required 1c (not optional):** private `support.presence.{ticketId}` + `private: true` + `realtime.setAuth()` + **RLS on `realtime.messages`**. Public `tulala.presence.*` is not enough. | **1c (#2483)** | **Landed** #2483 |
| D9 | DESK-QA | Seed + cleanup before unblurred screenshots | ops | Open |
| D10 | Status | Keep `open\|resolved\|closed` + `waiting_on` | 1b | OK |
| D11 | Journey 27 idempotency | **Required Phase 1 (not UI-only):** `clientSendKey` on `hqReplySupportTicketAction` / `appendMessage`; persist + lookup so retries do not duplicate. | **1b/1c (#2483)** | **Landed** #2483 |

**1b/1c GO checklist (#2483; P1 bars required and landed — do not reopen product work):**
1. Reuse `hq-actions` / `load-hq` / engine — no parallel ticket writes.
2. Real three-pane Desk (SPEC §6) behind flag; delete 1a mockup-wait stub copy.
3. Wire queue + thread + resolve/reopen/reply/note.
4. HQ **"Open Support Desk ↗"** (D4 host-scoped cookies **required** — landed).
5. Keyboard per SPEC §6; ignore shortcuts in inputs.
6. Journey 7: **required** private presence + RLS (D8) — landed #2483.
7. Journeys **2, 7, 23–28** — journey **27** **requires** D11 send-key path — landed #2483.
8. Mobile stack; fix defects even if design-reference HTML disagrees.


---

## 1. Support architecture

| Layer | Location | Role |
|---|---|---|
| Engine | `web/src/lib/support/` | Create/append/status/escalate/claim; writes via service role |
| HQ UI | `web/src/app/(workspace)/platform/admin/support/` | Queue, drawer, insights, ideas, canned, diagnostics, replay |
| Requester UI | `web/src/components/support/` | Launcher/panel |
| Guest / marketing | `web/src/components/marketing/support/` | Marketing launcher, `/contact` |
| Desk flag/host (1a) | `desk-flag.ts`, `desk-hosts.ts`, `desk-host.ts`, `proxy.ts` | Kill-switch + host admission |
| Desk product (#2483) | `/desk`, `components/support-desk/`, `lib/support/desk/` | Live shell |
| AI / crons / email | existing + #2470 inbound forward | §6–7, §15 |

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
| Escalate | `handled_by=human` + reason |
| Agent reply retry | Must use client send key path (D11) — landed #2483 |

Messages: `author_kind` requester|agent|ai|system; `message_kind` text|card|system|**note**.

---

## 3. Database + RLS map

Core support migrations through guest / escalation. Pattern: SELECT via RLS; writes service-role.  
**Required additive (1c / Phase 1):**

| Migration / change | Required? | Landed |
|---|---|---|
| Desk host seed (`20261231320000_*`) | Yes — 1a | #2473 |
| **Private presence RLS** on `realtime.messages` for `support.presence.%` | **Yes — 1c** (not optional) | #2483 |
| Client send-key idempotency path (D11) | **Yes — Phase 1** | #2483 |
| Agent roles / inbound email cols | Phase 2–3 | — |

---

## 4. Auth and permission map

| Actor | Today | Target |
|---|---|---|
| super_admin | Full HQ | Desk + HQ |
| support_agent | missing | Phase 2 |
| Requester / guest | Existing | Unchanged |

HQ gate: `assertHqAccess` → `super_admin` only today.

**D4 cookie isolation (required):** Host-scoped Domain on Desk hosts (`isHostScopedAuthHost`) — **required** and landed in #2473; held by #2483. Same cookie names; not a second namespace.

---

## 5. Routes + host routing

| Route / host | Notes |
|---|---|
| `/platform/admin/support` | Existing HQ |
| `/platform/admin/support/desk` | Local QA → real Desk |
| `/desk` | Desk app path (#2483) |
| `support.tulala.digital` | Desk host; 404 when flag off |
| Marketing `/support` | Unrelated |

---

## 6–7. AI / cron / notifications

Unchanged vs prior audit: AI auto-sends today; crons as listed; deep links must open Desk when shell ships.

---

## 8–9. Screenshots / mobile

DESK-QA seed first. Mobile = list → thread → context sheet.

---

## 10. Tests + coverage

Required bars covered by product tests on #2483: `desk-presence.static.test.ts`, `desk-send.test.ts`, `cookie-domain.test.ts` / `desk-host.test.ts`.

---

## 11–12. Dead / missing

| Gap | Phase | Required? | Landed |
|---|---|---|---|
| Real Desk shell | 1b | Yes | #2483 |
| Keyboard + HQ link | 1c | Yes | #2483 |
| Private presence + RLS (D8) | 1c | **Yes** (not optional) | #2483 |
| Host-scoped Desk cookies (D4) | 1a/1c | **Yes** | #2473 / #2483 |
| Reply send-key idempotency (D11) | 1 | **Yes** | #2483 |
| Agent roles | 2 | Later | — |
| Email → tickets | 3 | Later | — |

---

## 13. Security risks

| Risk | Mitigation | Required? |
|---|---|---|
| Parent-domain cookie widen on Desk host | D4 host-scoped Domain (never `.tulala.digital`) | **Yes** — landed |
| Flag-off still serving | 1a proxy 404 | Done |
| Public presence spoof/join | D8 private + RLS | **Yes** — landed #2483 |
| Duplicate reply on retry | D11 client send key + engine lookup | **Yes** — landed #2483 |
| Soft claim ≠ lock | Phase 4 | Later |

---

## 14–15. Retention / email

Unchanged. #2470 interim; Phase 3 Desk SoT.

---

## 16. Phase / PR plan

| Phase | PR | Notes |
|---|---|---|
| 0 SPEC | #2472 | Merged |
| 0 audit | **#2479** | Docs; merge when required/optional language accurate |
| 0.5 mockups | #2477 | Optional reference only |
| 1a | #2473 | Merged |
| **1b/1c product** | **#2483** | Shell + presence + send key; finish D4 + DB unique |

---

## 17. Migration plan

| Change | Required? | When |
|---|---|---|
| Host seed | Yes | 1a (done) |
| **Private presence RLS** (`support.presence.%`) | **Yes — never optional** | 1c — landed #2483; `db:push` ops |
| Client send-key path (D11) | **Yes** | Phase 1 — landed #2483 |
| Host-scoped Desk cookies (D4) | **Yes** | 1a — landed #2473 |
| Agent roles / inbound email | Later | 2–3 |

Always `db:push` before merge of migration PRs (presence migration needs Mac `db:push` — non-blocking for this docs PR).

---

## 18. Risks + open

- D4 / D8 / D11 are **required** bars; code verified landed on #2483 / #2473 (`internal/codex-p1-desk-verify-2483.md`) — **do not reopen product work** from this audit.
- Presence RLS uses `is_platform_admin()` while Desk is owner-only; Phase 2 may tighten to ticket ACL.
- No Oran design questions. No mockup gate.

---

## 19. Acceptance

### Phase 0 (#2479)
- [x] SPEC + live directive
- [x] Audit 1–20 + Oran additions
- [x] Codex P1/P2 required vs optional corrected
- [ ] Merged after CI green

### Phase 1a
- [x] Flag/host/404/host-only write

### Phase 1b–1d (#2483)
- [ ] Live Desk §6 / §23 (product PR)
- [x] D8 private presence + RLS **required** — landed #2483
- [x] D4 host-scoped Desk cookies **required** — landed #2473 / held #2483
- [x] D11 send-key idempotency **required** — landed #2483
- [ ] Journeys 2, 7, 23–28 evidence (product PR)

---

## 20. Journey-to-phase map

| # | Journey | Phase | Notes |
|---|---|---|---|
| 2, 23–26, 28 | In-app, resolve/reopen, search, mobile, network, realtime | **1** | |
| **27** | Retry no duplicate | **1** | D11 — key + DB unique |
| **7** | Two agents | **1** presence (D8) / **4** collision | |
| 1, 3–4, 14–16 | Contact/email/attachments | 3 | |
| 5–6, 8, 11, 13, 21–22 | Reopen UX, drafts, escalate, merge, SLA | 4 | |
| 9–10, 17, 29 | AI drafts | 5 | |
| 12, 18–19 | Rich context | 6 | |
| 20 | Unauthorized tenant | 2 | |
| 30 | Honest final response | 3–5 | |

---

## Oran additions

- **A. Cookies (D4)** — **required**; host-scoped Domain landed #2473 / held #2483.
- **B. Flag-off=404** — done.
- **C. DESK-QA** — still needed for screenshots.
- **D. #2470 interim** — merge lane.
- **E. Phase 2–3** — agents; inbound→tickets.
- **F. Journey 7 presence (D8)** — **required 1c** private+RLS; landed #2483 (not optional).

---

## End-of-phase report (Phase 0)

1. **Discovered** — Engine/HQ enough to productize; Codex P1s are **required** bars (presence / cookies / idempotency).
2. **Implemented** — docs only in #2479; required vs optional corrected.
3. **Reused** — `lib/support` + HQ for #2483.
4. **Data-model** — presence RLS required (landed #2483); send-key path required (landed #2483).
5. **Tested** — docs + code verify note `internal/codex-p1-desk-verify-2483.md`.
6. **Incomplete** — DESK-QA screenshots; #2479 merge.
7. **Risks** — §13.
8. **Decisions from Oran** — none; no ping.
9. **Evidence** — this file; #2483; `internal/desk-codex-2479.md`; verify memo.
10. **Next** — Merge #2479 when CI green → merge lane; product work stays on #2483 (no reopen from docs).
