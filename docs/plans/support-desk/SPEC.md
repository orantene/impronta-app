# Tulala Support Desk — Product Spec

> Canonical product spec for the Support Desk. Source: work order Part 2 (2026-10-02).
> Every phase is built against this document. If SPEC and code disagree, **the code wins**: note the difference in the audit and update the SPEC.

You are responsible for designing and implementing a world-class Tulala Support Desk. Treat it as a complete support operations product, not a new page or a visual redesign.

The goal is ONE reliable support system where human agents, AI assistance, customer context, conversations, email, internal notes, escalations and operational analytics work together without disconnected records or dead ends.

Do not build a superficial dashboard. Investigate the existing product deeply, identify missing capabilities, reuse existing engines, and improve the full support journey from customer contact to resolution.

## 1. Product goal
A dedicated support application for Tulala:
- Primary host `support.tulala.digital`; optional alias `desk.tulala.digital`; local QA route `/platform/admin/support/desk`.
- One support engine and one source of truth. No second ticket system, no duplicated business logic.
- Existing Platform Admin Support keeps working; existing talent and customer conversations stay compatible.

It supports: in-app chat, guest chat, contact forms, email, internal notes, human replies, AI drafts and approved replies, escalations, feature requests, technical diagnostics, customer/talent/agency/booking/payment/website context, and reporting and service-quality metrics.

It should feel like a serious support product (Intercom, Front, Help Scout, Linear) while staying consistent with Tulala's design system: clean light interface by default, optional dark mode, speed, clarity, keyboard access, accessibility, excellent mobile behavior.

## 2. Non-negotiable product principles
**One conversation, one record.** A customer must not create disconnected records when moving between chat, email, the contact form, booking help, payment questions, technical support, feature requests and escalations. Every message and event stays connected to the correct conversation, customer, organization, talent, booking, payment and ticket.

**No false status.** Never show Resolved when only awaiting a reply, Replied when a send failed, Paid when payment is processing, Confirmed when a booking isn't approved, or Closed when the customer can still reopen. Every status reflects the underlying record.

**No dead ends.** Every visible action works, leads to a supported destination, offers a useful fallback, or is clearly labelled unavailable or proposed. Every journey has loading, empty, error, success, retry, cancellation and return states.

**Preserve context.** Never make an agent or customer repeat known information: identity, contact details, language, history, source channel, source website or hub, related talent, service, selected options, booking, quote, payment, diagnostic session, previous agent and AI actions, attachments.

## 3. Existing code and systems to investigate
- `web/src/app/(workspace)/platform/admin/support/*` (Support HQ shell, queue, ticket drawer, canned editor, ideas, insights, diagnostics, replay, propose-fix)
- `web/src/components/support/*` (launcher, panel, thread, contract, deep links, attachments)
- `api/ai/support-chat`, `api/ai/guest-support-chat`, `api/platform/support/tickets/[id]/investigation-bundle`
- Crons: `support-lifecycle`, `support-insights`, `support-weekly-digest`, `reap-guest-support`, `reap-support-replays`
- Migrations `20261213000000_support_tickets_core` → `20261227000004_support_escalation_reasons` (tickets, realtime, notifications kind, diagnostics, replay sessions, proposed actions, learning loop, round-2, canned replies, attachments, digests, feature requests, guest, escalation reasons)
- Support server actions, loaders, mutations; realtime private channels
- Auth and authorization; host routing in `proxy.ts`; the agency/workspace domain gate (`agency_domains`, `src/lib/saas/gate.ts`)
- Notification infrastructure (incl. push), email infrastructure (Resend)
- Customer, talent, booking, payment and website records

For each: what it does, who calls it, which tables it reads and writes, which roles may use it, whether it's live / incomplete / unused / duplicated / broken, whether it can be reused, and whether it needs refactoring. Do not create a replacement before proving the existing system can't support the requirement.

## 4. Users and permissions
**Owner / super admin:** all conversations and analytics; manages agents and permissions; configures channels, SLAs, business hours, routing, AI rules, canned replies; Platform Admin access; sensitive customer and payment context per existing policy; audits every action.

**Human support agent:** Support Desk only (no automatic Platform Admin access). Sees conversations assigned to them or in permitted queues; replies; internal notes; assigns or escalates per permission; uses approved canned replies; sees only the customer context needed.

**Specialist / engineer:** escalated tickets, internal notes, diagnostics and replays, internal replies; access only to what the escalation needs.

**AI support agent:** a service identity, never a fake human. Record when the AI acted, which model or workflow, which sources, the confidence or policy category, whether drafted / approved / auto-sent, and which human approved or overrode it.

**Customer side:** distinguish customer, guest, talent, agency, workspace member, partner, and unknown or unverified visitor. Never merge people because names or emails look similar; verify identity before exposing previous conversations or account data.

## 5. Phase 0: audit before implementation
Create `docs/plans/support-desk/00-audit.md` with:
1. Support architecture
2. Ticket and message lifecycle
3. Database + RLS map
4. Auth and permission map
5. Routes + host routing
6. AI flows and safety limits
7. Cron + notification behavior
8. UI screenshots
9. Mobile problems
10. Tests + coverage
11. Duplicate or dead code
12. Missing functionality
13. Security risks
14. Retention and privacy risks
15. Email architecture options (incl. Gmail forwarding vs Resend inbound as source of truth)
16. Phase plan with PR breakdown
17. Migration plan
18. Risks + open decisions with recommended defaults
19. Acceptance criteria per phase
20. Journey-to-phase map for §20

Screenshots: desktop wide and narrow, 390px, light and dark, empty queue, active ticket, error state, existing Platform Admin Support. **Seeded test tickets or blurred personal data only.** Trace real data and permissions; don't rely on visual inspection.

## 6. Phase 1: Desk shell
Built on the existing support engine.

**Desktop:** a flexible three-pane layout:
1. Views / queues / navigation
2. Conversation list
3. Thread + customer context

Resizable panes where practical, a collapsible context panel, search, saved views, keyboard navigation, clear unread and assigned states, fast switching.

**Mobile:** queue list → conversation list → full-screen conversation → context as a bottom sheet or separate screen. Never squeeze three panes onto a phone. Verify 390px and 360px, keyboard-open, long messages, attachments, notes, the composer, loading and error, back navigation, and draft preservation.

**Keyboard:**

| Key | Action |
|---|---|
| `j` / `k` | Move between conversations |
| `r` | Reply |
| `n` | Internal note |
| `a` | Assign |
| `e` | Resolve |
| `s` | Snooze |
| `⌘K` | Command palette |
| `Esc` | Close or cancel |

Shortcuts never fire inside text inputs.

**Existing Support HQ** stays functional and gets **"Open Support Desk ↗"**, which opens the desk in a new tab or window with no second auth or ticket system.

## 7. Conversation and ticket lifecycle
Start from the existing status enum and propose a minimal set that covers: new, open, waiting on agent, waiting on customer, waiting on specialist, snoozed, escalated, resolved, closed, reopened. *Merged* and *spam* are flags.

Document:
- Who can change each status
- Unread-count effects
- What happens on a customer reply
- Auto-reopen of resolved conversations
- Reopening closed ones
- SLA timer effects
- How a merge preserves history
- Duplicate-message prevention

Each conversation shows: status, assignee, queue, source channel, created, last activity, first-response and resolution deadlines, related records, and the next required action.

## 8. Unified channel inbox
One queue for:
- In-app chat
- Guest chat
- Website contact form
- Talent support requests
- Email
- System alerts
- Escalated diagnostic reports

Each item shows a channel icon with an accessible label. A channel never appears active if replies aren't supported.

Per channel, define:
- How it starts
- How identity is verified
- How replies are sent
- Behavior when the channel is unavailable
- Notifications
- Attachments
- Whether the customer can reopen
- What the agent sees

## 9. Email channel
Implement only after verifying the provider and the infrastructure. **Intended source of truth: Resend inbound → Desk**; Gmail is at most an optional copy, decided in the memo.

Support:
- Inbound ingestion
- Thread matching via Message-ID / In-Reply-To with a reply-token fallback
- New-ticket creation
- Outbound replies
- Attachments
- Signature
- Plain-text fallback
- HTML sanitization
- Auto-reply and out-of-office filtering
- Spam handling
- Bounces and delivery failures
- Suppression lists
- Duplicate prevention
- Size limits
- Unsupported-attachment handling

Addresses: `hello@`, `help@`, `support@tulala.digital`. Never send real customer emails during QA; use test addresses or a sandbox.

## 10. Agent workspace features
- Assignment
- Team queues
- Status changes
- Snooze
- SLA timers
- Internal notes
- @mentions
- Canned replies
- Macros with variables
- Tags
- Saved views
- Search
- Filters
- Bulk assign and bulk status change
- Merge duplicates
- Collision detection
- Draft ownership
- Presence
- Attachments
- Export
- Audit history
- Block or spam actions

**Collision handling** shows:
- Who is viewing
- Who is typing
- Who has an unsent draft, and when it was last updated
- A warning before overwriting another agent's work

## 11. Customer context sidebar
Permission-aware; every value comes from real records.

Shows when available:
- Name, verified contact, account type, language, country
- Talent or agency relation, plan, website
- Services, bookings, quotes, payments, refunds
- Conversations, recent errors, diagnostics, replays, feature requests
- Internal risk or priority flags

Every item links to its detail view. Owner-only: "Open in Platform Admin". Never expose payment details, private notes, personal identity or other-tenant data without permission.

## 12. AI support copilot
**AI may:**
- Classify and suggest tags
- Detect language, sentiment and urgency
- Summarize
- Retrieve approved knowledge
- Draft replies
- Suggest troubleshooting steps
- Identify missing information
- Recommend escalation
- Propose articles
- Suggest the next action

**AI must never invent:** prices, refund promises, availability, legal conclusions, payment status, booking confirmations, permissions, product capabilities, staff identity, or unverified fixes.

**Each AI response shows:**
- Identity, draft or sent state, and confidence or review state
- Sources
- Actions: Approve & send, Edit, Regenerate, Reject, Escalate, Report incorrect

v1: human approval before every send. Auto-send only later, for explicitly approved low-risk categories, and configurable. When unsure, the AI says so and offers "Ask a human agent".

## 13. Knowledge system
**Content types:**
- Help articles
- Internal troubleshooting guides
- Policies
- Release notes
- Known issues
- Escalation procedures
- Approved response language

**Each article has:** EN + ES versions, an owner, a status, a review date and version history. Articles are searchable, and the AI retrieves only approved, current content.

Agents can turn a strong answer into a *proposed* article; it is never published automatically.

## 14. Escalations and handoffs
**Reasons:**
- Payment
- Refund
- Booking
- Security
- Account access
- Technical bug
- Data privacy
- Abuse or spam
- Agency ownership
- Legal or compliance
- Product request

**Each escalation includes:**
- Reason, priority and deadline
- Summary and customer impact
- Reproduction steps
- Related records, attachments and diagnostics
- Requested owner
- Internal notes

The customer gets an honest status message, with no promised resolution time unless the SLA supports it.

## 15. SLA, priority and business hours
Define:
- Priorities
- First-response and resolution targets
- Business hours, holidays and time zone
- Snooze behavior
- Escalation threshold and breach warnings
- Paused-clock and customer-waiting rules

Use real timestamps; show the customer's time zone where relevant. No fake SLA performance: metrics follow documented definitions.

## 16. Analytics and reporting
**Metrics, each with a documented definition:**
- New conversations
- First-response, average-response and resolution time
- Reopen rate
- Backlog
- SLA compliance
- AI-assisted conversations
- AI deflection
- Human-handoff rate
- Escalation rate
- Top categories and top unresolved issues
- CSAT
- Language, channel volume, agent workload
- Duplicate rate
- Failed-delivery rate

**Each metric has:**
- A definition, a time range and a source query
- A time-zone rule
- Loading and empty states
- A drill-down or export path where relevant

"AI deflected" requires a defined outcome, not just an AI message.

## 17. Notifications
**Events:**
- New assignment
- Mention
- Customer reply
- SLA warning
- Escalation
- Failed outbound message
- Bounce
- AI draft ready
- High-priority ticket
- Reopened conversation

**Notifications respect:** preferences, permissions, quiet hours, duplicate suppression, read state and mobile behavior. Every deep link opens the correct conversation.

## 18. Security, privacy and tenant isolation
**Verify before implementation:**
- RLS and server-side authorization
- Host admission, session behavior and direct URL access
- API, attachment, search, realtime and export authorization
- Cross-tenant leakage
- Agent access boundaries and AI context boundaries
- Audit logging, retention, deletion and sensitive-data masking

**Test as:**
- Owner
- Agent
- Specialist
- AI identity
- Unauthorized user
- Another workspace
- Another agency
- Guest
- Deleted or disabled account

Never rely on frontend hiding for security.

## 19. Accessibility and performance
**Accessibility:**
- Keyboard navigation and visible focus
- Labels and screen-reader announcements
- Contrast and reduced motion
- Error association and accessible status changes
- Accessible dialogs and sheets
- No keyboard traps

**Performance:**
- Fast initial load, progressive loading of the queue and context
- No redundant refetches or repeated context queries
- Virtualized long lists
- Optimistic updates only when failure is recoverable
- Clear retry behavior
- No oversized client bundles

## 20. Test journeys
Show both the customer and agent sides. The Phase column is the default mapping; the audit may adjust it.

| # | Journey | Phase |
|---|---|---|
| 1 | New guest contact-form request | 3 |
| 2 | In-app chat becomes a support ticket | **1** |
| 3 | Email creates a new ticket | 3 |
| 4 | Email reply attaches to an existing ticket | 3 |
| 5 | Customer replies after resolution | 4 |
| 6 | Customer sends duplicate messages | 4 |
| 7 | Two agents open the same conversation | **1** (presence) / 4 (full collision) |
| 8 | Agent leaves a draft, another agent replies | 4 |
| 9 | AI drafts a reply needing approval | 5 |
| 10 | AI lacks info and hands off | 5 |
| 11 | Agent escalates a payment issue | 4 |
| 12 | Agent views booking + payment context | 6 |
| 13 | Agent merges duplicate tickets | 4 |
| 14 | Customer sends an attachment | 3 |
| 15 | Unsupported attachment rejected clearly | 3 |
| 16 | Email delivery fails | 3 |
| 17 | Customer changes language | 5 |
| 18 | Customer is a talent | 6 |
| 19 | Customer is an agency | 6 |
| 20 | Unauthorized agent tries another tenant | 2 |
| 21 | SLA approaches breach | 4 |
| 22 | Ticket snoozed and returns | 4 |
| 23 | Ticket resolved and reopened | **1** |
| 24 | Search finds a conversation | **1** |
| 25 | Mobile agent replies with keyboard open | **1** |
| 26 | Network fails during reply | **1** |
| 27 | Retry doesn't duplicate the message | **1** |
| 28 | Realtime update while viewing | **1** |
| 29 | AI suggestion corrected and rejected | 5 |
| 30 | Customer receives an honest final response | 3–5 |

**For each journey, show:**
- Entry point
- Loading, empty and validation states
- Success, failure and retry
- Permission behavior
- Destination and return path
- Stored records and audit event
- The customer-facing result

## 21. Implementation rules
- Additive migrations unless a destructive change is explicitly approved; verify them in the database before merge.
- Reuse the existing support and commerce engines; never duplicate ticket or message logic.
- Don't start unrelated MCP or AI booking servers. No real customer emails during QA. Test accounts only.
- Preserve behavior outside scope. Follow the worktree and branch rules. Keep modules small.
- Never hide unsupported functionality behind polished UI. No production legal promises or refund guarantees.
- Never claim complete until tested.

## 22. Deliverables
**Phase 0:**
- Audit
- Architecture decision memo
- Data and permission map
- Risk register
- Gap analysis
- Proposed migrations
- PR breakdown
- Test strategy
- Screenshots
- Open questions with defaults
- Journey-to-phase map

**Phase 1:**
- Desk shell behind `SUPPORT_DESK_ENABLED`
- Host routing
- Owner access
- Existing queue and ticket view connected
- Mobile layout
- Keyboard navigation
- The Platform Admin link
- Tests
- Screenshots
- Accessibility and performance review

**Every later phase:**
- Product spec and UX states
- Data and permission model
- Migration
- Server actions and frontend
- Tests, screenshots and failure evidence
- Security review
- Rollback plan
- Known limitations

## 23. Completion standard
"The page renders" is not complete. A phase is complete only when:
- The user can enter, understand the state, complete the action, recover from failure, and return without losing context.
- The right records are connected.
- Permissions are enforced server-side.
- Mobile and accessibility are acceptable.
- Tests pass, and screenshots prove the key states.
- No control is a dead end.
- Limitations are reported.

**End-of-phase report:**
1. Discovered
2. Implemented
3. Reused
4. Data-model changes
5. Tested
6. Incomplete
7. Risks
8. Decisions needed from Oran
9. Evidence links
10. Recommended next phase
