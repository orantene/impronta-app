# Support Desk — Phase 0.5 Design

**Status:** Ready for Oran design review (optional design reference — not a flag-enable gate).  
**Live Desk:** Product shell already on production via [#2483](https://github.com/orantene/impronta-app/pull/2483); master flag `SUPPORT_DESK_ENABLED` stays **OFF** until Oran enables it.  
**Mockups:** `http://127.0.0.1:3099/support-desk/` (`cd web && npm run mockup:support-desk`, or `python3 -m http.server 3099 --bind 127.0.0.1 --directory web/design-references`)  
**Screenshots:** `web/design-references/support-desk/screenshots/` · Project media `media/support-desk-phase-05/`  
**Prototype rule:** Fake data only. Every surface carries a **Simulated** banner. No production Desk UI from this PR, no prod writes, no real email/payments/notifications.

---

## 1. Product principles

1. **One conversation, one record** across email, in-app, guest chat, and forms.
2. **No false status** — failed sends never look delivered; AI drafts never look sent.
3. **No dead ends** — every control works, routes, or is labelled unavailable / proposed.
4. **Preserve context** — identity, booking, payment, language, source hub stay visible.
5. **Human owns the send** — AI drafts require Approve / Edit / Reject in v1.
6. **Internal notes are private** — dashed note chrome; never customer-visible.
7. **Drafts survive navigation** — reply and note drafts persist in the prototype (and must in product).
8. **Permissions are visible** — owner-only actions show a lock/badge, not a silent miss.

---

## 2. Roles and permissions

| Role | Desk access | Platform Admin | Sensitive payments | Previous history | Diagnostics / replay |
|---|---|---|---|---|---|
| Owner | Full | Yes (↗) | Yes | Yes | Yes |
| Human support agent | Queues + assigned | No | Masked / limited | Verified customers only | Diagnostics yes · replay no |
| Specialist | Escalated focus | No | Yes (escalation need) | Yes | Yes |
| AI (service) | Drafts only | No | No | N/A | N/A |
| Unverified guest (customer side) | N/A | No | Hidden | **Withheld** | Hidden |

Mockup role switcher (prototype bar) demonstrates agent vs owner vs guest visibility without claiming auth is implemented.

---

## 3. Information architecture

```
Support Desk (support.tulala.digital)
├── Login / invite / session recovery
├── Inbox shell
│   ├── Views / queues rail
│   ├── Conversation list + search
│   ├── Thread + composer
│   └── Customer context sidebar
├── Command palette (⌘K)
├── Insights (layout-only overview)
└── (Later) Settings / canned / agents — out of Phase 0.5 click target except via HQ link
```

Existing Platform Admin Support HQ remains; Desk is the agent workspace. HQ gets **Open Support Desk ↗** (Phase 1c). Desk owner rail gets **Open Platform Admin ↗**.

---

## 4. Navigation map

| From | Action | To |
|---|---|---|
| Login success | Sign in | Inbox · Needs you (or return path) |
| Rail view | Click queue | Filtered conversation list |
| List row | Click | Thread + context for that ticket |
| Thread | Hide context | Collapses context column |
| Thread | ⌘K / button | Command palette overlay |
| Composer | Reply ↔ Note | Same thread; recipient line changes |
| Mobile queues | Drill | List → Thread → Context sheet |
| Any | Esc (palette) | Close palette, keep thread |
| Owner rail | Platform Admin | Simulated new-tab toast |

---

## 5. Ticket lifecycle

Statuses shown in mockups (mapped from existing `support_tickets` enum + SPEC proposal):

`open` · `waiting_agent` · `waiting_customer` · `escalated` · `snoozed` · `resolved` · (+ `closed` / `reopened` documented for Phase 1)

Flags (not statuses): `merged`, `spam`.

Rules visible in prototype:
- Customer reply after resolve → reopen (journey 14).
- Failed outbound keeps failed chrome + Retry (idempotent).
- Escalation writes a system event and can change assignee to specialist.
- SLA warn / breach pills on list + toolbar.

---

## 6. Channel behavior

| Channel | Icon | Start | Reply path | Notes |
|---|---|---|---|---|
| Email | ✉ | Resend inbound → ticket (Phase 3 SoT; interim #2470) | Outbound email | Thread match Message-ID / reply-token |
| In-app | 💬 | Support launcher | In-app + notify | Auth user |
| Guest chat | ◌ | Marketing / guest | Guest session | Unverified until claim |
| Form | ▤ | Help / contact form | Email or in-app if claimed | |
| Agency-managed source | badge on hub | Workspace ticket to platform | Same engine | Journey 25 · not agency helpdesk |

Unsupported channel replies are labelled — never look live.

---

## 7. Conversation state model

Thread items: customer · agent · **internal note** · **AI draft (not sent)** · attachment (ok/fail) · system · assignment · status · escalation · failed outbound · loading · typing · presence · unread divider · date separator · link preview.

AI draft card states: actionable · stale (no actions) · rejected (retired).  
Composer modes: `reply` | `note` with explicit recipient line.

---

## 8. Customer identity rules

- Never merge on similar name/email alone.
- Unverified guest: previous conversations **hidden** (journey 19).
- Verified signed-in: history + bookings/payments per role.
- Phone may be masked for agent; owner/specialist see fuller payment ids.
- Source website / hub always shown on list + thread header.

---

## 9. AI + approval

- Identity: **Tulala Assist** with AI avatar + royal/violet chrome — never presented as a human agent.
- Confidence pill on draft.
- Actions: Approve & send · Edit draft · Reject · (low confidence → Escalate).
- v1: no auto-send. Simulated only in mockups.

---

## 10. Error / recovery matrix

| State | What happened | Next action |
|---|---|---|
| Empty inbox / assigned | No rows in view | Open Unassigned / clear filters |
| No search results | Query miss | Search email / BK- / pi_ |
| Network error | Fetch failed | Retry |
| Realtime lost | Live channel down | Reconnect; sends still allowed |
| Send / email failure | Outbound failed | Retry without duplicate |
| Attachment reject | Type/size | Choose allowed file |
| Permission | Role blocked | Ask owner |
| Session expired | Auth ended while composing | Sign in · draft kept |
| Unsupported / merge | Proposed | Labelled out of scope for Phase 1 |

---

## 11. Mobile (390)

Stack: Views → List → Full-screen thread → Context bottom sheet → Composer (+ keyboard) → Attach / Note / AI review → Back keeps draft + scroll.

Must not (checked in mockups H): cover composer; hide send; nested scroll traps; stacked modals; lose draft; strip status/assignee; unclear back.

---

## 12. Accessibility

- Focus rings use brand token (`--desk-focus`).
- Icon-only controls have `title` / `aria-label`.
- Destructive / important actions use visible text (Reject, Retry, Sign in).
- Status not color-only — pills include labels.
- `prefers-reduced-motion` zeroes `--desk-motion`.
- Command palette keyboard: Esc, typeahead (↑↓ documented).
- Contrast: light default; dark tokens keep muted ink ≥ readable on surfaces.

---

## 13. Design tokens

Defined in `web/design-references/support-desk/css/tokens.css`. Components use CSS variables only (no raw hex in UI rules beyond the token file).

**Light:** canvas white · surface `#FAFAF7` · panes light gray · hairline borders · forest brand `#0F4F3E` · note wash · AI royal.  
**Dark:** cool near-black surfaces · brighter brand/AI for contrast.  
**Type:** Inter · 11 / 12 / 13 / 14 / 16 / 20.  
**Motion:** ~150ms.  
**Accent budget:** one primary per task (Send / Approve / Sign in).

Aligned with admin `COLORS` / STYLE.md (forest brand, no gold/rust chrome).

---

## 14. Component inventory

| Component | Existing vs new | Data | Permissions | States | Responsive | Reuse | Production notes |
|---|---|---|---|---|---|---|---|
| Desk login | New | Auth session | Desk seat | default/loading/invalid/locked/invite/unsupported/expired/return | Centered card | Auth patterns | Host `support.tulala.digital` |
| Queue rail | New (HQ has views) | Queue counts | Role | active/disabled owner link | Hidden on mobile→screen1 | Adapt HQ filters | |
| Conversation list | New shell / reuse loaders | Tickets | Queue ACL | unread/SLA/empty/skeleton | Full width mobile | `support` loaders | |
| Thread | Extend `SupportThreadView` | Messages/events | Ticket ACL | full taxonomy | Full screen mobile | High reuse | |
| Composer | New Desk composer | Drafts/canned | Reply permission | reply/note/upload/fail/disabled | Keyboard-safe | Partial from panel forms | |
| AI draft card | New / extend cards | Proposed draft | Agent+ | approve/edit/reject/stale | Same | `SupportCardRenderer` ideas | |
| Context sidebar | Extend `TicketContextCard` | Customer graph | Role gates | rich/empty/hidden | Sheet on mobile | High reuse | |
| Command palette | New | Commands | Owner gates | empty/restricted | Full screen ok | — | |
| Insights overview | Adapt `SupportInsightsView` | Rollups | Owner/agent | layout-only | Stack cards | High reuse | Definitions required |
| Empty/error panels | New shared | — | — | matrix §10 | — | admin empty primitives | |

---

## 15. Reuse vs new

**Reuse:** support engine/tables, HQ insights/diagnostics/replay panels, canned settings, attachment upload helpers, notification catalog, auth.  
**New:** Desk shell host + three-pane layout, login on support host, ⌘K, mobile stack, AI approval chrome as first-class, explicit recipient line.  
**Do not rebuild:** second ticket system, agency helpdesk, Gmail-as-SoT.

---

## 16. Data-to-UI mapping (per screen)

### A Login
`agency_domains` host · auth user · Desk seat flag · invite token · return URL.

### B Inbox
`support_tickets` list · unread via reads · assignee · status · channel · SLA timers · source/hub metadata.

### C Thread
`support_messages` + `support_ticket_events` + attachments + AI proposed actions.

### D Composer
Draft local/state · canned from `platform_settings.support_canned_replies` · outbound via existing reply paths (simulated here).

### E Context
Profile / guest session · bookings · payments · diagnostics · replays · feature requests · escalations — filtered by role.

### F ⌘K
Client command registry + ticket search RPC (future).

### G Empty/error
Loader/error envelopes from list/thread APIs + realtime status.

### H Mobile
Same data · different navigation chrome.

### I Insights
`support_insights_rollup` / HQ dashboard types — **sample figures only** in mockup.

---

## 17. Mockup route map

| Route | Screen |
|---|---|
| `#/hub` | Index A–I |
| `#/login/:state` | A |
| `#/inbox/:queue` | B |
| `#/thread/:id` | C |
| `#/composer/:mode` | D |
| `#/context/rich\|empty` | E |
| `#/cmdk/:state` | F |
| `#/empty/:kind` | G |
| `#/mobile/:step` | H |
| `#/insights` | I |
| `#/journeys` | Journey index |
| `?theme=light\|dark&viewport=desktop\|mobile` | Screenshot automation |

Serve: `web/design-references/support-desk/serve.sh` → port **3099**.

---

## 18. Prototype limitations (labelled)

- No real auth, DB, email, Stripe, or notifications.
- Presence / typing / SLA clocks are static fixtures.
- Merge UI is **proposed / out of scope** (`#/empty/unsupported`).
- Insights numbers are illustrative — not live.
- Context deep links resolve to “labelled unavailable”.
- Keyboard shortcuts partially wired (⌘K, Esc); j/k/r/n/a/e/s documented for Phase 1c.

---

## 19. Phase 1 handoff

**Phase 1a:** Landed (#2473) — `SUPPORT_DESK_ENABLED` · host admit/404 · host-scoped cookies · mockup serve stub.  
**Phase 1b / 1c:** Landed (#2483) — live Desk shell, keyboard, HQ link, presence + send idempotency — still behind flag OFF.  
**This Phase 0.5 pack:** Optional visual/IA reference for Oran. Approving or revising mockups does **not** flip the Vercel flag. Future Desk polish may converge toward approved mockup patterns without requiring 1:1 parity as a merge gate (see SPEC implementation directive).

---

## 20. Open decisions

1. Final status enum mapping from existing open/resolved/closed → SPEC set (recommend additive map, keep DB compat).
2. Whether Desk login is fully separate cookie or shared platform session with seat gate (audit memo).
3. CSAT collection timing (placeholder only now).
4. Merge duplicates phase (labelled proposed).
5. Auto-close N days after resolve (SPEC default; not interactive in mockup).

---

## 21. Screenshot index

### Desktop 1440 · light
![Hub index](../../../web/design-references/support-desk/screenshots/hub-1440-light.png)

*Hub index*

![A · Login default](../../../web/design-references/support-desk/screenshots/A-login-default-1440-light.png)

*A · Login default*

![A · Invalid credentials](../../../web/design-references/support-desk/screenshots/A-login-invalid-1440-light.png)

*A · Invalid credentials*

![A · Owner login](../../../web/design-references/support-desk/screenshots/A-login-owner-1440-light.png)

*A · Owner login*

![B · Inbox shell](../../../web/design-references/support-desk/screenshots/B-inbox-1440-light.png)

*B · Inbox shell*

![C · Thread taxonomy](../../../web/design-references/support-desk/screenshots/C-thread-1440-light.png)

*C · Thread taxonomy*

![D · Internal note composer](../../../web/design-references/support-desk/screenshots/D-composer-note-1440-light.png)

*D · Internal note composer*

![D · Canned replies](../../../web/design-references/support-desk/screenshots/D-composer-canned-1440-light.png)

*D · Canned replies*

![E · Rich customer context](../../../web/design-references/support-desk/screenshots/E-context-rich-1440-light.png)

*E · Rich customer context*

![E · Empty / guest context](../../../web/design-references/support-desk/screenshots/E-context-empty-1440-light.png)

*E · Empty / guest context*

![F · Command palette](../../../web/design-references/support-desk/screenshots/F-cmdk-1440-light.png)

*F · Command palette*

![G · Empty inbox](../../../web/design-references/support-desk/screenshots/G-empty-inbox-1440-light.png)

*G · Empty inbox*

![G · Loading skeletons](../../../web/design-references/support-desk/screenshots/G-skeleton-1440-light.png)

*G · Loading skeletons*

![G · Realtime lost](../../../web/design-references/support-desk/screenshots/G-realtime-1440-light.png)

*G · Realtime lost*

![I · Insights overview](../../../web/design-references/support-desk/screenshots/I-insights-1440-light.png)

*I · Insights overview*

![25 journeys index](../../../web/design-references/support-desk/screenshots/journeys-1440-light.png)

*25 journeys index*


### Desktop 1440 · dark
![A · Login dark](../../../web/design-references/support-desk/screenshots/A-login-default-1440-dark.png)

*A · Login dark*

![B · Inbox dark](../../../web/design-references/support-desk/screenshots/B-inbox-1440-dark.png)

*B · Inbox dark*

![C · Thread dark](../../../web/design-references/support-desk/screenshots/C-thread-1440-dark.png)

*C · Thread dark*

![F · CmdK dark](../../../web/design-references/support-desk/screenshots/F-cmdk-1440-dark.png)

*F · CmdK dark*

![I · Insights dark](../../../web/design-references/support-desk/screenshots/I-insights-1440-dark.png)

*I · Insights dark*


### Mobile 390 · light / dark
![H1 · Views](../../../web/design-references/support-desk/screenshots/H-queues-390-light.png)

*H1 · Views*

![H2 · Conversation list](../../../web/design-references/support-desk/screenshots/H-list-390-light.png)

*H2 · Conversation list*

![H3 · Thread](../../../web/design-references/support-desk/screenshots/H-thread-390-light.png)

*H3 · Thread*

![H4 · Context sheet](../../../web/design-references/support-desk/screenshots/H-context-390-light.png)

*H4 · Context sheet*

![H5 · Keyboard open](../../../web/design-references/support-desk/screenshots/H-keyboard-390-light.png)

*H5 · Keyboard open*

![H7 · Internal note mode](../../../web/design-references/support-desk/screenshots/H-note-390-light.png)

*H7 · Internal note mode*

![H8 · AI draft review](../../../web/design-references/support-desk/screenshots/H-ai-390-light.png)

*H8 · AI draft review*

![A · Login mobile](../../../web/design-references/support-desk/screenshots/A-login-default-390-light.png)

*A · Login mobile*

![H · Thread dark](../../../web/design-references/support-desk/screenshots/H-thread-390-dark.png)

*H · Thread dark*

![B · Mobile dark frame](../../../web/design-references/support-desk/screenshots/B-inbox-390-dark.png)

*B · Mobile dark frame*


---

## 22. Acceptance checklist

- [x] Screens A–I implemented as clickable HTML
- [x] Served on :3099
- [x] Desktop 1440 + mobile 390
- [x] Light default + dark
- [x] Fake data only · Simulated labels
- [x] 25 journeys documented (§J below)
- [x] Screenshots embedded
- [x] Tokens / inventory / data mapping
- [x] No production Desk UI shipped from this PR (live shell is separate #2483, flag OFF)
- [ ] **Oran design review OK** (approve / revise / reject as reference — does not enable flag)

---

## J. Journeys 1–25

| # | Journey | Entry | Role | Visible | Action | Destination | Loading | Success | Failure | Recovery | Permission | Would change in prod |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Open + reply | `#/inbox` → thread | Agent | Unread open ticket | Send reply | Thread + sent (sim) | Sending skeleton | Toast sent | composer/fail | Retry | Reply ACL | `support_messages` insert + email |
| 2 | Reply → note | `#/composer/note` | Agent | Note chrome | Toggle note | Same ticket | — | Note event | — | — | Ticket ACL | internal message kind |
| 3 | Canned + vars | `#/composer/canned` | Agent | Variable preview | Insert | Composer filled | — | Inserted | — | — | Canned ACL | none until send |
| 4 | AI edit/approve | Thread AI card | Agent | Draft not sent | Edit / Approve | Sent as human-approved | — | Approved toast | Reject | New draft | Agent | message + AI audit |
| 5 | Low confidence escalate | `#/composer/escalate` | Agent | Escalate CTA | Escalate | Specialist | — | Escalation event | — | — | Escalate ACL | status/assignee |
| 6 | Customer attachment | Thread | Agent | OK chip | View | — | — | Attached | — | — | — | attachment row |
| 7 | Attachment rejected | `#/composer/attach_fail` | Agent | Fail chip | Choose other | — | — | — | Type blocked | Pick allowed | — | none |
| 8 | Fail + retry | `#/composer/fail` | Agent | Failed bubble | Retry | Same idempotency | Sending | Sent | Fail again | Retry | — | outbound retry |
| 9 | Two agents | Presence line | Agent | “Leo viewing” | Continue | — | — | — | Conflict toast (Phase1) | Refresh | — | presence channel |
| 10 | Typing + reply | Typing indicator | Agent | Customer typing | Reply | — | — | — | — | — | — | presence |
| 11 | Assign | `#/cmdk/assign` | Agent | CmdK | Assign | Assignee pill | — | Assigned | Permission | — | Assign ACL | assignee |
| 12 | Waiting on customer | `#/cmdk/status` | Agent | Status | Set waiting | Pill update | — | Updated | — | — | Status ACL | status |
| 13 | Snooze | `#/cmdk/snooze` | Agent | Snooze | Confirm | Snoozed view | — | Snoozed | — | Unsnooze | — | snooze_until |
| 14 | Reply after resolve | c5 resolved | Agent | Resolved | Customer reply (sim) | Reopen | — | Reopened | — | — | — | status reopen |
| 15 | Escalate specialist | Escalation event | Agent | ESC | Escalate | Leo assignee | — | Escalated | — | — | — | escalation row |
| 16 | Merge duplicates | `#/empty/unsupported` | Owner | Proposed label | — | — | — | — | Out of scope | Use link | Owner | future merge |
| 17 | Search | `#/cmdk/search` | Agent | Search | Query | Results / empty | Skeleton | Hit | No results | Clear | — | search |
| 18 | Owner-only blocked | Role=agent CmdK HQ | Agent | Owner badge | Attempt HQ | Blocked toast | — | — | Restricted | Ask owner | Owner | none |
| 19 | Guest history | Role=guest context/empty | Guest view | Hidden history | Attempt | Withheld copy | — | — | Hidden | Verify | Verify gate | none |
| 20 | Session expired | `#/login/expired` | Agent | Warn + draft | Sign in | Return path | Loading | Inbox | Invalid | Forgot pw | Auth | session |
| 21 | Realtime interrupted | `#/empty/realtime` | Agent | Banner | Reconnect | Inbox | — | Live | Still down | Retry | — | channel |
| 22 | Mobile keyboard | `#/mobile/keyboard` | Agent | Keyboard chrome | Send above kbd | — | — | Sent | — | — | — | message |
| 23 | Empty context | `#/context/empty` | Agent | No bookings | — | — | — | Empty labels | — | — | — | — |
| 24 | Rich context | `#/context/rich` | Agent | Many bookings/payments | Open link | Unavailable label | — | — | — | — | Role | deep links |
| 25 | Agency-managed source | Diego row / hub badge | Agent | Agency hub | Open | Thread | — | — | — | — | — | same ticket |

---

## §6 Approval gate report

| Item | Value |
|---|---|
| Mockup URL | `http://127.0.0.1:3099/support-desk/` |
| Screenshot directory | `web/design-references/support-desk/screenshots/` · store `media/support-desk-phase-05/` |
| Design doc | `docs/plans/support-desk/01-design.md` (this file) |
| Completed journeys | 1–25 documented + linked in prototype `#/journeys` |
| Missing capabilities (intentional) | Live auth, realtime sockets, real Resend send, merge engine, CSAT collection, auto-close job UI, full shortcut set |
| Assumptions | Forest brand tokens; Desk host `support.tulala.digital`; AI drafts human-approved; EN+ES; Tulala-only desk; existing ticket engine reused |
| Open decisions | §20 |
| Risks | Enabling flag before Oran review; treating mockups as 1:1 prod gate after SPEC skip; inbound email not SoT until Phase 3 |
| Recommended for Oran now | Click-through A–I light+dark + mobile H; approve/revise/reject reference; decide whether future polish converges to mockups; keep flag OFF until explicit enable |
| Live components (already #2483) | Desk shell rail/list/thread/context · reply/note/resolve · keyboard · HQ link · presence · send-key idempotency |
| Live routes (flagged) | `support.tulala.digital/*` · local `/platform/admin/support/desk` · dead while flag OFF |

**Do not enable `SUPPORT_DESK_ENABLED` from this PR. Oran design review is for the mockup reference pack only.**
