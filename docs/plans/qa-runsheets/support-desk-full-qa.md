# Support Desk full-QA run sheet (TUL-51 prep)

Status: DRAFT, written from code on `origin/main` (read-only study, nothing was run).
Card: TUL-51 "Support Desk full QA". Epic: TUL-111 "EPIC S, Support Desk".
Owner of the run: whoever the PM assigns. Written 2026-10-08.

How to read this sheet. Every behavior below was read in code and the file is cited as
`web/src/...` or `supabase/migrations/...`. Anything I could not confirm is marked
`unverified`. Anything the code does not do is marked `not built` and listed in section 2.
The older 30-step script on the Notion card assumes some things that the code does not
do (status names such as "new" and "waiting on user", inbound email threading, a client
question routed to a talent). Where the card and the code disagree, this sheet follows
the code and says so.

## Ground rules

- Run ONLY on the clean isolated `qa-journeys` stack (own Supabase project, own hosts,
  seeded workspaces). Guard with `web/scripts/isolated-target-guard.mjs`
  (see `web/AGENTS.md`, section on isolated fixtures). Never production, never a real tenant,
  never Jorgelina's real talent (TAL-93938).
- Throwaway accounts use `@impronta.test` addresses. No Stripe in any case below.
- The tester never types a password into a production page. On the isolated stack the
  test passwords come from the stack seed, not from this sheet.
- No real customer data in ticket text. Use the phrase "QA-SD" at the start of every
  subject so cleanup can find rows.
- Read-only SQL only during the run. Deletes happen in section 1.14 on the isolated
  project only.

---

## 0. Preconditions and test data

### 0.1 Accounts

| Key | Role | Needs | Notes |
|---|---|---|---|
| T1 | Talent A | auth user, `talent_profiles` row linked by `user_id`, a workspace (tenant) | Ticket creation requires a talent profile (`web/src/lib/support/support-access.ts`, `resolveSupportRequester`, error "No talent profile."). |
| T2 | Talent B | same, different person, ideally a different tenant | Used for the cross-talent permission cases. |
| C1 | Client | auth user, `client_profiles` row linked by `user_id`, a relationship in `agency_client_relationships` with the QA tenant | Without the relationship the ticket is still created but is platform-scoped, `tenant_id` null (`support-access.ts`). Run SD-06 both ways. |
| C2 | Client B | client without a relationship to the QA tenant | For attribution and isolation checks. |
| W1 | Workspace staff | member of the QA tenant holding capability `agency.support.tickets.view` | Sees the "Workspace" segment of the panel. |
| A1 | Desk agent / platform admin | `profiles.app_role` that passes `isPlatformAdmin` | The ONLY staff role the Desk knows (`web/src/lib/support/desk/desk-access.ts`, `web/src/lib/support/support-access.ts`, `assertHqAccess`). There is no separate "support agent" role. |
| A2 | Non-admin staff | an agency admin who is NOT a platform admin | Expect "forbidden" on `/desk`. |
| G1 | Guest (visitor) | no account, any `@impronta.test` mail inbox you can read | For the marketing `/contact` and chat. |

The mail inbox for each address must be readable by the tester (isolated mail sink or a
real mailbox on a domain the team controls). Record which in the run log.

### 0.2 Hosts

| Host | Use | Source |
|---|---|---|
| `support.tulala.digital` (isolated stack equivalent) | Desk host, path `/desk` | `web/src/lib/support/desk-hosts.ts` (also `desk.tulala.digital`, `support.local`, `desk.local`) |
| Any seeded app host (`app` kind) | Talent dashboard `/talent`, client portal `/{tenantSlug}/client`, workspace `/{tenantSlug}/admin`, local Desk mirror `/platform/admin/support/desk` | `web/src/lib/support/desk/desk-url.ts` |
| Marketing host (hub) | `/support`, `/contact`, guest chat | `web/src/app/(marketing)/support/page.tsx` |

The Desk host must exist in `agency_domains` as kind `app` (seeded by
`supabase/migrations/20261231320000_support_desk_host.sql`, rows for `support.tulala.digital`
and `support.local`). Confirm with the SQL in 0.5.

### 0.3 Flags and environment (names only, never values)

| Name | Needed value for this run | Effect (source) |
|---|---|---|
| `SUPPORT_DESK_ENABLED` | `1` for the main run, `0` for SD-21 | Unset means OFF everywhere. OFF makes the Desk host a 404 and `/desk` a soft 404 (`web/src/lib/support/desk-flag.ts`, `desk-host.ts`, `desk/load-desk-page.ts`). When ON, `/platform/admin/support` redirects to the Desk (`web/src/app/(workspace)/platform/admin/support/page.tsx`). |
| AI flags `ai_master_enabled`, `ai_support_enabled` | Both ON for AI cases, `ai_support_enabled` OFF for SD-10 | Stored settings read by `getAiFeatureFlags` (`web/src/lib/settings/ai-feature-flags.ts`). Default of `ai_support_enabled` is false, so a fresh stack creates human-handled tickets. How an operator flips these in the UI is `unverified`; ask the owner (Q4). |
| AI provider configuration | configured for AI cases, removed for SD-17 | `isResolvedAiChatConfigured` in `web/src/app/api/ai/support-chat/route.ts`. Env var names are `unverified`; use whatever the stack uses. |
| `ai_usage` tenant controls | row in the tenant AI controls table with a tiny `monthly_spend_cap_cents` and `hard_stop_on_cap` for SD-16 | `web/src/lib/ai/ai-usage-gate.ts` |
| `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET` | set on the stack | Webhook refuses with 503 without the secret and 400 on a bad signature (`web/src/app/api/webhooks/resend/route.ts`). |
| `RESEND_INBOUND_FORWARD_TO` | set to a test mailbox | Without it the code forwards to a hard-coded personal Gmail address (`web/src/lib/email/resend-inbound-forward.ts`, `DEFAULT_INBOUND_FORWARD_TO`). DANGER: on the isolated stack always set this, or inbound test mail leaves the sandbox. |
| `CRON_SECRET` | set | Bearer for `/api/cron/support-lifecycle` (SD-55). |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | set for rate-limit cases | Without them the limiters are no-ops (`web/src/lib/rate-limit-kv.ts`, the noop block returns `{ ok: true }`). SD-50 only means something when these are set. |
| `GUEST_COOKIE_SECRET` | set | Signs guest resume tokens (`web/src/lib/support/guest-resume-token.ts`). |
| `NEXT_PUBLIC_SUPPORT_EMAIL_CAN_RECEIVE` | note its value in the run log | Decides whether the public `/support` page claims email can be received (`web/src/lib/platform/support-contact.ts`). |

### 0.4 Language and viewport setup

- Locale is a cookie named `locale` (`web/src/lib/support/support-handoff-copy.ts`). Switch
  with the account menu language control; record the cookie value in each screenshot name.
- Catalogs: `web/messages/en.json`, `web/messages/es.json` (a `fr.json` also exists; out of scope).
- Phone viewport for SD-48: 390 x 844.

### 0.5 Read-only SQL used throughout (run on the isolated project)

Tables (migration `supabase/migrations/20261213000000_support_tickets_core.sql`):
`support_tickets`, `support_messages`, `support_message_reads`, `support_ticket_events`;
plus `support_attachments` (`20261214000002_support_attachments.sql`),
`support_canned_replies`, `resend_inbound_emails`
(`20261231320001_resend_inbound_emails.sql`), `notification_dispatch_log` (named in the
Resend webhook route), `agency_domains`.

```sql
-- Q-HOST: the desk host rows exist
select hostname, kind, status, tenant_id from agency_domains
 where hostname in ('support.tulala.digital','support.local');

-- Q-TICKET: the newest QA tickets
select ticket_number, id, surface, status, waiting_on, handled_by, escalation_reason,
       assignee_user_id, priority, category, tenant_id, contact_email, message_count,
       reopened_count, created_at
  from support_tickets where subject ilike 'QA-SD%' order by created_at desc limit 20;

-- Q-MSGS: thread for one ticket (replace :id)
select created_at, author_kind, message_kind, left(body,80) body, ai_meta
  from support_messages where ticket_id = ':id' order by created_at;

-- Q-EVENTS: audit trail for one ticket
select created_at, actor_kind, event_type, old_value, new_value
  from support_ticket_events where ticket_id = ':id' order by created_at;

-- Q-INBOUND: inbound mail log
select created_at, from_address, to_addresses, subject, forward_status, forward_error
  from resend_inbound_emails order by created_at desc limit 10;
```

Evidence naming: `SD-NN_<step>_<role>_<locale>_<viewport>.png`, SQL results saved as
`SD-NN_<query>.txt`, mail evidence as the raw subject line plus the headers screenshot.

---

## 1. Cases

Conventions. "EN / ES" gives the visible label in each language, taken from the catalogs
(`dashboard.adminSupport.*` for the requester panel, `dashboard.platform.support.*` for the
Desk). The support persona is named by the placeholder `{agent}`; today it renders as
"Orlando" (`web/src/lib/support/support-persona.ts`). Each case ends with a pass/fail box:
`[ ] PASS  [ ] FAIL  ticket # ______  bug ticket ______`.

### 1.1 Entry points (talent and client)

| ID | Role | Steps | Expected | Evidence |
|---|---|---|---|---|
| SD-01 | T1 | 1. Sign in, open `/talent`. 2. Find the Support launcher in the left rail (aria "Open support" / "Abrir soporte"; rail label "Support" / "Soporte"). 3. Open it. 4. Look at the tabs. | Panel opens with tabs Home / Tickets / Guide ("Home" / "Inicio", "Tickets" / "Tickets", "Guide" / "Guía"). Greeting "Hi {name}" with the line "Ask anything. We are here." Input placeholder "How can we help?" / "¿Cómo podemos ayudarte?". Three cards: "Start live chat" / "Iniciar chat en vivo", "Start a ticket" / "Abrir un ticket", "Send an idea" / "Enviar una idea". Launcher mounts from `web/src/app/(workspace)/talent/_talent-layout-inner.tsx` via `web/src/components/support/SupportLauncherMount.tsx`. | `SD-01_panel_T1_en.png`, same in `es` |
| SD-02 | T1 | 1. Home, click "Start a ticket" / "Abrir un ticket". 2. Leave Description empty, press "Create ticket" / "Crear ticket". 3. Fill Subject "QA-SD-02 prices" and Description "How do I change my prices?" 4. Optional: pick Category, add phone, pick a callback preference ("Anytime/Morning/Afternoon/Evening"). 5. Submit. | Empty body is refused (server schema `body` min 1, max 8000 in `web/src/lib/support/actions.ts`; the exact inline message is `unverified`). Valid submit creates `support_tickets` with `surface='talent'`, `status='open'`, `waiting_on='support'`, `priority='normal'`, `contact_email` = T1 email, `talent_profile_id` set, `tenant_id` = T1 tenant. First message row `author_kind='requester'`. Events: `created`, `message_sent`. A `support.ticket.created` notification goes to all platform admins (email "New support ticket #N", in-app, push) (`web/src/lib/notifications/catalog-entries-support.ts`). Subject is trimmed to 200; if blank it becomes the first 80 chars of the body (`support-engine.ts`). With AI ON the ticket has `handled_by='ai'`, otherwise `'human'`. | Screenshots of form error and thread; Q-TICKET, Q-MSGS, Q-EVENTS |
| SD-03 | T1 | 1. Home, click "Start live chat" / "Iniciar chat en vivo" (subtext "A real person from Tulala, usually within minutes"). 2. Or use "Message {agent} directly" / its ES equivalent. 3. Send a message. | Ticket is created with `handled_by='human'`, `subject='Direct message'`, `escalated_at` set, `escalation_reason='user_requested'`, and the `escalated` event plus a `support.ticket.escalated` alert to admins (email subject "Ticket #N needs you", plus WhatsApp text) (`support-engine.ts` `createTicket`, `messageOranDirectly`). Which UI control sets `messageOranDirectly` is `unverified`; try both entries and record the result. NOTE the "usually within minutes" promise has no code backing; the real re-alert is 4 hours (SD-30). | Q-TICKET shows `escalation_reason`; alert email in an admin inbox |
| SD-04 | T1 | 1. Home, "Send an idea" / "Enviar una idea". 2. Heading "Tell us what you need". 3. Fill the idea title, area, optional body and phone. 4. "Send idea". | Confirmation "Thank you. Your idea #{n} is with {agent}." Row goes to the feature-request tables, NOT `support_tickets` (`web/src/lib/support/feature-request-actions.ts`; exact table name `unverified`). In the Desk it appears under the Ideas view ("Ideas"); admins get "New idea #N". It must not appear in the ticket queue. | Idea screenshot; Desk Ideas view; Q-TICKET count unchanged |
| SD-05 | T1 | 1. Open the Guide tab ("Guide" / "Guía"). 2. Type "prices" in "Search the Guide" / "Buscar en la Guía". | Results come from the in-app guide (`web/src/components/support/GuideTab.tsx`). Result text should be in the active language; ES guide chrome has known leftovers in English (see SD-47). Note the Notion card calls this the "How can we help?" search; in code that input starts a ticket/AI thread, the Guide has its own search. | EN and ES screenshots |
| SD-06 | C1 | 1. Sign in as C1, open `/{tenantSlug}/client`. 2. Open the Support launcher. 3. Start a ticket "QA-SD-06 booking question". | Same panel; ticket `surface='client'`, `client_profile_id` set, `tenant_id` = QA tenant only if C1 has an `agency_client_relationships` row, otherwise null. Repeat with C2 and confirm `tenant_id` is null (`support-access.ts`). Mounted from `web/src/app/(workspace)/[tenantSlug]/client/layout.tsx`. | Q-TICKET for both, side by side |
| SD-07 | W1 | 1. Sign in as W1, open `/{tenantSlug}/admin`. 2. Open Support, switch the segment "Mine" / "Workspace". 3. Create a ticket. | Ticket `surface='workspace'` needs capability `agency.support.tickets.view` (`support-access.ts`). The "Workspace" segment lists the tenant's workspace tickets. A staff member without the capability gets an error and no panel (exact copy `unverified`). | Both segments screenshotted |
| SD-08 | G1 | 1. On the marketing host open `/support` then the contact page. 2. Submit name, email, message. | `submitMarketingContactAction` (`web/src/lib/support/guest-actions.ts`) creates `surface='guest'`, `contact_email` set, no `requester_user_id`. Guest gets a confirmation mail "We have your message (#N)". Owner alert sent. Honeypot field present. Exact page labels `unverified` (marketing page reads from its own copy, not the catalog). | Page screenshot; inbox screenshot |
| SD-09 | G1 | 1. Open the marketing chat launcher. 2. Ask "How much does Tulala cost?" | Guest chat via `/api/ai/guest-support-chat`. Answers only from the guest corpus (`web/src/lib/support/guest-corpus.ts`); phone numbers and emails are stripped and any sentence with a price not present in the grounding text is dropped and forces escalation (`support-ai-guardrails.ts`, `sanitizeGuestAiOutput`). Hard ceiling of 6 AI replies per guest ticket (`guest-ai-turns.ts`). When AI is unavailable the fail-open line is "{agent} answers these himself. Leave your email and he will reply there." (`support-chat-shared.ts`). | Thread screenshots; Q-MSGS `ai_meta` |
| SD-10 | C1 | Visit a talent public site (for example the QA site on the isolated stack) as a signed-in or anonymous visitor and look for any Tulala support entry. | NOT BUILT: no Support launcher is mounted on talent public sites. The launcher mounts only in talent dashboard, client portal, workspace admin and marketing shell (grep of `SupportLauncherMount` / `MarketingSupportLauncherMount` usage). A visitor's booking question goes through the inquiry flow to the talent, not to Tulala support. Record "absent" and attach screenshot. | Screenshot of the site footer and floating widgets |

### 1.2 AI first reply (the AI path is `web/src/app/api/ai/support-chat/route.ts`)

Prereq for SD-11 to SD-18: `ai_master_enabled` and `ai_support_enabled` ON, provider configured.

| ID | Role | Steps | Expected | Evidence |
|---|---|---|---|---|
| SD-11 | T1 | With `ai_support_enabled` OFF, create a ticket (SD-02 steps). | Ticket `handled_by='human'`, no AI message, route returns `{skipped:"disabled"}` if called. Default of this flag is false (`ai-feature-flags.ts`), so on a fresh stack this IS the default behavior. | Q-TICKET, Q-MSGS |
| SD-12 | T1 | AI ON. Ask "How do I change my prices?" | While waiting, the panel shows "Reading your question", "Checking help articles", "Writing an answer". An `author_kind='ai'` message arrives (under 1200 chars), `ai_meta` holds `model`, `confidence`, `grounding_slugs`, `sentiment`. Grounding comes from `retrieveHelpEntries` over the help corpus (`web/src/lib/support/help-corpus.ts`) plus owner-confirmed insights. Subject/category are set from the AI on the first AI turn only. Links in the answer must point at Tulala hosts only. Check the link opens. | Thread screenshot; Q-MSGS (confidence, slugs) |
| SD-13 | T1 | Ask something not in the guide: "What is the weather in Madrid?" | Prompt says answer only from grounding and otherwise say "not sure" and offer {agent}. Expect either a low-confidence answer (confidence under 0.4 escalates with `escalation_reason='ai_low_confidence'`) or a model-requested handoff (`model.escalate`, reasons `ai_suggested`, `ai_sentiment`, `ai_unavailable`). After escalation: `handled_by='human'`, assignee set to the oldest `super_admin` profile (`web/src/lib/support/escalation-owner.ts`), `waiting_on='support'`, a handoff card appears: "Your ticket is with {agent}" / "Tu ticket está con {agent}" with body "You will get a notification and an email when he replies..." / "Recibirás una notificación y un correo cuando responda...". Admins get "Ticket #N needs you". | Card screenshot EN and ES; Q-TICKET shows `escalation_reason`, `assignee_user_id` |
| SD-14 | T1 | Send "I want to talk to a human" and also "quiero hablar con una persona". | Regex prefilter (`support-human-prefilter.ts`) escalates BEFORE any model call with reason `user_requested`; route returns `{skipped:"prefilter"}`. Also try the "Talk to a human" / "Hablar con una persona" button (action `requestHumanAction`). Same end state as SD-13. Verify no `ai` message was added. | Q-MSGS (no ai row), Q-EVENTS (`escalated`) |
| SD-15 | T1 | Ask "Can you refund me 50 dollars?" and "Promise me a payout of 200". | Post-filter in `sanitizeSupportAiOutput` flags phrases like a refund with an amount, "legal advice/guarantee", "we will pay you", "payout of", "I have updated/changed/fixed/refunded"; a hit forces escalation `ai_suggested`. The system prompt also forbids inventing amounts or claiming actions. The model may not produce those phrases at all, so a clean answer is also acceptable; the pass condition is "no invented price, policy or refund promise in the visible text". Em dashes are replaced by " - ". Run the pure checks first: `web/src/lib/support/support-ai-guardrails.test.ts` documents the cases. | Thread screenshot; Q-MSGS |
| SD-16 | T1 | Ask the AI a question that links an outside site ("send me to example.com"). | Markdown links to non-Tulala hosts are replaced by their label; bare outside URLs are removed (`isAllowedUrl`: only `tulala.digital`, `app.`, `www.` and `*.tulala.digital`). | Q-MSGS body |
| SD-17 | T1 | Spanish thread: write in ES, then switch to English mid-thread. | Prompt asks for the answer and `suggested_subject` in the language of the user's latest message, plus a directive built from the app locale (`web/src/lib/support/support-ai-language.ts`). Whether the reply follows the switch is model behavior; record as observed. The handoff card and fail-open lines follow the `locale` cookie (handoff) or are English-only (see SD-47). | EN and ES threads |
| SD-18 | T1 | Keep the AI conversation going for 3 AI replies without escalation; also send two negative-tone messages. | At the third AI turn an "offer-human" card appears: "Want {agent} to take a look?" / "¿Quieres que {agent} lo mire?" with body "I have shared what I can..." Two consecutive negative sentiments escalate with `ai_sentiment`. | Card screenshot; Q-EVENTS |
| SD-19 | T1 | Credits gate and kill switch. (a) Set the tenant AI control so `monthly_spend_cap_cents` is already reached with `hard_stop_on_cap` true; create a ticket. (b) Turn `ai_master_enabled` OFF and create another. | (a) `assertAiInvocationAllowed` fails with `spend_cap` (also `monthly_requests`, `rate_limit`); the route fails open: a system message "I'm having trouble right now. Want me to get {agent}?" and escalation `ai_unavailable`. (b) Route returns `{skipped:"disabled"}` and ticket is created as human-handled (flags are read at create time). Each successful AI turn records a usage estimate of `AI_USAGE_ESTIMATE_CENTS_PER_CALL` (default 1 cent) (`ai-usage-gate.ts`). | Thread screenshot; usage row before/after (table `ai_usage_monthly`) |
| SD-20 | T1 | Provider down. Remove provider config or point it at an unreachable endpoint, create a ticket. | `{skipped:"unconfigured"}` when not configured. On provider error, 20-second timeout, unparsable output or empty answer the route calls `failOpen`: system message + escalation `ai_unavailable`. The user always ends with a human path, never a spinner. | Thread screenshot; Q-EVENTS |

### 1.3 Desk access and queue (agent A1)

| ID | Role | Steps | Expected | Evidence |
|---|---|---|---|---|
| SD-21 | A1 | With `SUPPORT_DESK_ENABLED=0`, open `https://support.tulala.digital/desk` (isolated equivalent) and `/platform/admin/support/desk`. | Host answers the branded 404 (`supportDeskHostDeadResponse`); local mirror calls `notFound()`. | Two screenshots |
| SD-22 | Anonymous, T1, A2, A1 | With the flag ON open `/desk` as: anonymous; T1 (talent); A2 (non-platform staff); A1. | Anonymous: redirect to `/login?next=/desk` (keeps `?ticket=` and `?view=`). T1 and A2: honest forbidden page titled "Platform admin sign-in required" / "Se necesita acceso de administrador de plataforma", showing "Signed in as {email}" and the button "Sign out and sign in as admin". A1: the Desk loads. All decided by `decideDeskAccess`. On the Desk host a host-only talent cookie may shadow an admin session; the middleware clears host-only auth cookies once and retries (`shouldAttemptDeskAuthRescope`, cookie `impronta_desk_auth_rescope`): test by signing in as T1 on the app host first, then A1 on the Desk host. | Screenshots of each outcome |
| SD-23 | A1 | Open `/desk`. Brand "Support Desk". Walk the views: "Needs you" / "Te necesitan", "Unassigned", "Assigned to me", "Waiting on customer" / "Esperando al cliente", "Escalated", "Resolved today", "All open" / "Todos abiertos". Use search "Search name, email, booking…" / "Buscar nombre, correo, reserva…". | View filters (`web/src/lib/support/desk/desk-filters.ts`): needs_you = open and `waiting_on='support'`; unassigned = open with no assignee; mine = open and assignee is me; waiting_customer = open and `waiting_on='requester'`; escalated = open with `escalated_at`; resolved_today = resolved in the last 24h; all_open = open. Empty state "No conversations in this view". Counts must match Q-TICKET. Tickets from SD-02/03/06/07/08 appear. New ticket appears without reload: via realtime (`desk-queue-realtime.ts`); fallback interval `unverified`. | Screenshot per view; Q-TICKET |
| SD-24 | A1 | Open a ticket. Check the context card ("Customer context" / its ES label), diagnostics panel and replay panel. | Card shows requester, tenant, plan, recent bookings (`load-hq.ts`). Diagnostics (route, viewport, console and network failures, Sentry id) were attached at create time and are platform-only (`actions.ts` `diagnosticsSchema`, bounded fields). Replay needs the requester's consent ("Attach a replay of your last few minutes..."). Exact panel labels `unverified`. | Screenshot of context and diagnostics |

### 1.4 Human reply, notes, statuses, assignment

Real statuses in code: ticket `status` is one of `open`, `resolved`, `closed`
(`support-types.ts`, `SupportTicketStatus`). `waiting_on` is `support` or `requester`
(null once resolved or closed). `handled_by` is `ai` or `human`. Priority is
`low|normal|high|urgent`. There is NO "new", "pending", "waiting on user" or "snoozed"
status; "Snooze is proposed for a later phase" is literal Desk copy (`deskSnoozeProposed`).
Reopen is a transition back to `open` plus `reopened_count`.

| ID | Role | Steps | Expected | Evidence |
|---|---|---|---|---|
| SD-25 | A1 then T1 | 1. A1 opens the SD-02 ticket, writes a reply, presses "Send reply" / "Enviar respuesta". 2. Switch to T1 and open the ticket. | `hqReplySupportTicketAction` first claims the ticket if unassigned (`claimIfUnassigned`), then inserts `author_kind='agent'`, `message_kind='text'`; `waiting_on` flips to `requester`; event `message_sent`. T1 sees the message in the thread live (realtime) and gets a `support.message.agent` notification: in-app, push and email with subject "Oran replied - {subject} [Tulala #N]". The persona name inside that subject is hard-coded "Oran" even though the panel says "{agent}" (Orlando); log as defect candidate (Q8). Queue badges update. | T1 thread screenshot; Q-MSGS; email headers |
| SD-26 | A1 | Reply with a canned response; open the canned editor and save one (max 30, title max 60, body max 2000). | Canned replies come from `web/src/lib/platform/support-canned.ts`, saved by `hqSaveCannedRepliesAction`. Insert, edit, and the reply appears with the canned text. | Screenshot; table `support_canned_replies` row count |
| SD-27 | A1 then T1 | Tick "Internal note" / "Nota interna" (hint "Internal only. Not visible to the customer" / "Solo interno, el cliente no lo ve"), type a note, press "Add note" / "Agregar nota". Then view as T1 and as C1 (own ticket). | Message stored with `message_kind='note'`, `skipNotify` true: no email, no push. Hidden from requesters by RLS (`support_messages_select` requires `message_kind <> 'note' OR is_platform_admin()` in `20261213000000_support_tickets_core.sql`) and the UI has a note branch (`SupportThreadView.tsx`). Verify in the requester UI AND by SQL as that user is not possible read-only; instead use the requester page text search for the note text. | Requester screenshot with no note |
| SD-28 | A1 | Press "Resolve" / "Resolver" (or "Reply and resolve"). Then T1 sends a new message on the resolved ticket. | `changeStatus` sets `status='resolved'`, `waiting_on` null, `resolved_at`; event `status_changed`; `support.ticket.resolved` mail "Resolved: {subject} [Tulala #N]" to the requester. When the requester then writes, `appendMessage` auto-reopens: `status='open'`, `reopened_count` +1, `reopened` event; Desk shows badge "Reopened ×N" ("The customer reopened this after it was resolved"). Also press "Reopen" / "Reabrir" as A1 on a resolved ticket and expect status open and `waiting_on='support'`. | Q-TICKET before/after each step; Q-EVENTS |
| SD-29 | T1 | On a resolved or AI-answered thread click "Did this help?" Yes / No ("¿Te ayudó esto?"), "Mark resolved" / "Marcar resuelto", "Keep this ticket open" / "Mantener este ticket abierto"; also rate 1 to 5 with optional comment, and "Skip". | Requester resolve works only from `open` (expectedStatus guard). On an AI-handled ticket it sets `metadata.ai_self_serve=true` and event `ai_marked_helpful`. Keep-open adds event `kept_open`. Rating 1 to 5, comment max 500, stored in `satisfaction_rating`. Requester can also close (`closeSupportTicketAction`). Status labels in the list: "Waiting on you" / "Te espera a ti", "With support" / "Con soporte", "Resolved" / "Resuelto", "Closed" / "Cerrado". | Q-TICKET and Q-EVENTS |
| SD-30 | A1 | Assign and classify: "Assign to me" / "Asignarme", then change assignee (including unassign), priority (low/normal/high/urgent), category. Also "send delay update" if exposed. | `assignTicket` sets `assignee_user_id`, event `assigned`; priority event `priority_changed`; category event `category_changed`. Delay update posts a card "{agent} is still on this" / body "...You have not been forgotten..." and does not change status (`hqSendDelayUpdateAction`). Picker UI for assignee beyond "Assign to me" is `unverified`. | Q-EVENTS |
| SD-31 | A1 | Propose a fix (`ProposeFixComposer`) with an invalid JSON payload, then a valid one. Let T1 decline or approve; let one expire. | Invalid shows "Payload must be a JSON object." Approve applies and logs ("Every applied change is logged" / ES equivalent); nothing changes customer data without T1's approval (`web/src/lib/support/proposed-actions/*`). Expiry is handled by the lifecycle cron and mails "A proposed fix on #N expired". Which action kinds exist: see `proposed-actions/kinds.ts` (`unverified` which are safe on the isolated stack; use only the harmless ones). | Card screenshots; Q-EVENTS (`proposed_action_expired`) |
| SD-32 | A1 | Open Insights ("Insights") and Ideas ("Ideas") views. | Insight tiles ("Open now", "Median first reply", "Resolved this week", "AI resolved alone", "Reopen rate", "Escalation rate") load with numbers or the documented empty copy ("The weekly digest cron has not run yet."), no raw "Error:" text. Ideas statuses: New, Under review, Planned, In progress, Shipped, Declined. | Screenshots; console clean |

### 1.5 Attachments

| ID | Role | Steps | Expected | Evidence |
|---|---|---|---|---|
| SD-33 | T1, A1 | In a ticket thread use the attach button (aria "Attach an image" / its ES text). Upload a 1 MB PNG; then a 6 MB PNG; then a PDF; then try opening the image URL while signed out. | Images only: PNG, JPEG, WEBP, GIF, max 5 MB (`web/src/lib/support/attachment-actions.ts`). Bigger or other types: error "That image did not upload. Try a smaller PNG or JPG." Bucket `support-attachments` is private; viewing uses a signed URL valid 10 minutes, minted after `assertTicketAccess`. A signed-out request to a stored path must fail. Whether the Desk (agent) side can also upload is `unverified`. The note on the Notion card "attachment if supported": only images are supported. | Screenshot; the 4xx evidence for the signed-out fetch |

### 1.6 Email round trip

Mail templates live in `web/emails/support/*` and are wired in
`web/src/lib/notifications/catalog-entries-support.ts`. Subjects are hard-coded English
strings in the catalog; the user's locale does not change the SUBJECT. Whether the body
is localized is `unverified` (check the template files).

| ID | Role | Steps | Expected | Evidence |
|---|---|---|---|---|
| SD-34 | A1 inbox | After SD-02, read the admin inbox. | Mail "New support ticket #N" with a link to the Desk (`adminPath` `/platform/admin/support?ticket=ID`, which redirects to the Desk when the flag is ON). Not in spam; link opens the ticket after login. | Inbox + link landing screenshot |
| SD-35 | T1 inbox | After SD-25, read T1's inbox. | Subject "Oran replied - {subject} [Tulala #N]". Link goes to `/talent?support={ticketId}` (talent), `/{slug}/client?support=ID` (client), `/{slug}/admin?support=ID` (workspace) (`support-reply-path.ts`, `hydrateSupportLinks`). The link opens the panel on that thread (`deepLinkTicketId` in `SupportPanel.tsx`). Check the unsubscribe link and category label "messages". Also verify resolved mail subject "Resolved: {subject} [Tulala #N]", auto-close warning "Still need help on #N?", fixed "The issue you reported is fixed [Tulala #N]". | Four inbox screenshots |
| SD-36 | G1 inbox | After SD-08 and an agent reply to a guest ticket. | Guest confirmation "We have your message (#N)"; reply mail uses the `.guest` audience and a signed resume link (token valid 7 days, `guest-resume-token.ts`); link opens the guest thread with no login. | Inbox + resume page |
| SD-37 | Sender | Reply BY EMAIL to the T1 mail from T1's mailbox (reply to the notification), wait 2 minutes. Then look at the thread, `resend_inbound_emails`, and the forward mailbox. | NOT BUILT as a thread feature. The Resend `email.received` event is stored in `resend_inbound_emails` (Q-INBOUND) and forwarded to `RESEND_INBOUND_FORWARD_TO`; there is no code that parses it into `support_messages`, no `In-Reply-To` / `References` matching, no use of the `[Tulala #N]` token on inbound (grep of `resend-inbound-forward.ts`, `webhooks/resend/route.ts`; the migration comment says "Interim SoT before Support Desk Phase 3"). Expected observation: row in Q-INBOUND with `forward_status` `sent`, NO new `support_messages` row. File this as the confirmed gap. Also check the webhook rules: unsigned POST returns 400, missing secret 503, store failure 500 so Resend retries, store ok but forward failed still 200. Signature check needs a real Svix-signed event; the tester sends the mail, not a hand-forged request. | Q-INBOUND, Q-MSGS, forward mailbox |
| SD-38 | Email failure | Stop the mail provider (remove `RESEND_API_KEY` on the isolated stack) and do SD-25. | The reply still saves and shows in the thread; notification delivery failure must not break the send. How failures surface in `notification_dispatch_log` is `unverified`. | Thread screenshot; log row |

### 1.7 Permissions and privacy

| ID | Role | Steps | Expected | Evidence |
|---|---|---|---|---|
| SD-39 | T2 | Copy T1's ticket id. As T2 open `/talent?support={T1 ticket id}`; also call the thread from the panel list. | T2 sees nothing: `assertTicketAccess` allows platform admins, the requester, and workspace staff of the same tenant for workspace-surface tickets only, otherwise "Not authorized." The same check guards message send, mark read, resolve, close, rate, attachments. RLS policies `support_tickets_select_requester / _staff / _platform` back it. Note: workspace staff of T1's tenant can see a workspace ticket but not a talent ticket. | Screenshot of empty or denied state |
| SD-40 | C1 / C2 | As C2 open `/{tenantSlug}/client?support={C1 ticket id}` and `/desk`. As C1 re-check SD-27 notes. | Denied; client never sees `message_kind='note'`. `/desk` shows the forbidden page for any signed-in non-platform-admin. | Screenshots |
| SD-41 | W1 | W1 in tenant X opens the Workspace segment; another workspace staff W2 in tenant Y does the same. | Each sees only workspace tickets of own tenant (`staff.tenantId === ticket.tenantId`). Staff scoping by tenant is only for the in-product panel; the Desk is platform-admin only, there is no per-tenant desk agent role. | Two screenshots |
| SD-42 | A1 | Desk host versus app host. Open `/desk` on the Desk host; open `/talent`, `/platform/admin` and `/{slug}/admin` on the Desk host. Open `/desk` and `/platform/admin/support/desk` on the app host. | Desk host allows only `/`, static and PWA paths, `.well-known`, shared APIs, compliance and auth paths, `/desk`, `/platform/admin/support/desk`, `/api/support-desk` (`isPathAllowedOnSupportDeskHost`); everything else gets the branded 404. On the app host `/desk` is allowed (`path-groups.ts`). Auth cookies on Desk hosts are host-scoped, never `.tulala.digital` (comment in `desk-hosts.ts`). Note `/api/support-desk` is allow-listed but no route exists under `web/src/app/api/support-desk` (not built). | Screenshots of 404s |
| SD-43 | A1 | Impersonation read-only. Start "view as" T1 (platform feature), then try: create ticket, send message, resolve, close, rate, keep open, attach, ask the AI, reply in the Desk. | Every requester action begins with `requireNotImpersonating()` and the AI route with `assertNotImpersonating()`; they refuse with the read-only error text "... / Sal de 'ver como' para hacer cambios" (`web/src/lib/impersonation/readonly-guard.ts`). Desk actions (`hq-actions.ts`) also call the guard. Check no new rows in Q-TICKET or Q-MSGS under T1 or A1 during the attempt. | Error screenshot; SQL row counts |

### 1.8 Presence and typing privacy

| ID | Role | Steps | Expected | Evidence |
|---|---|---|---|---|
| SD-44 | A1 + T1 | A1 opens T1's ticket in the Desk while T1 has the thread open and types. Then open a second platform admin A3 (if available) on the same ticket. | T1's panel shows "{agent} is online" / "{agent} está en línea" and "{agent} is typing" / "está escribiendo". The Desk shows "Also viewing: name" for co-viewers (`deskPresenceViewing`). Presence is only tracked while the panel is open on a thread (comment in `SupportPanel.tsx`). Migration `20261231330000_support_desk_presence_private.sql` adds private-channel RLS for topics `support.presence.%`, platform admins only. CAUTION (unverified, possible defect): the private channel (`supportPresenceChannel`) is joined by `SupportDeskShell.tsx`, which is referenced only by tests; the live Desk portal mounts `SupportHqShell`, whose ticket drawer joins the public `tulala.presence.support.{id}` topic, and the requester panel also uses the public topic. So the privacy migration may protect a component that is not mounted. Test: from T2 (not admin) subscribe to the public topic with the browser console and note whether presence of A1 and T1 is visible. Report what you observe; do not exploit. | Console output (names redacted); notes |

### 1.9 EN and ES spot-check

Switch the `locale` cookie and revisit. For each string record EN and ES as seen.

| ID | Surface | Strings to check |
|---|---|---|
| SD-45 | Requester panel | rail label "Support" / "Soporte"; tabs "Home/Inicio", "Tickets", "Guide/Guía"; cards "Start live chat/Iniciar chat en vivo", "Start a ticket/Abrir un ticket", "Send an idea/Enviar una idea"; "How can we help?/¿Cómo podemos ayudarte?"; "Create ticket/Crear ticket"; "Subject/Asunto"; "What happened?/¿Qué pasó?"; status chips "Waiting on you/Te espera a ti", "With support/Con soporte", "Resolved/Resuelto", "Closed/Cerrado"; "Talk to a human/Hablar con una persona"; "Did this help?/¿Te ayudó esto?"; handoff card (SD-13); "That did not send. Your text is still here, try again." / "No se pudo enviar. Tu texto sigue aquí, inténtalo de nuevo." |
| SD-46 | Desk | Views (SD-23), "Reply/Responder", "Internal note/Nota interna", "Send reply/Enviar respuesta", "Add note/Agregar nota", "Resolve/Resolver", "Reopen/Reabrir", "Assign to me/Asignarme", "Waiting on customer/Esperando cliente", "Open/Abierto", forbidden page title. Note: `deskBrand` is "Support Desk" in both. |
| SD-47 | Known gaps to confirm or disprove | (a) Guide chrome strings still English in `es.json`: `guideWhoSeesWhat` "Who sees what", `guideCareful` "Careful", `guideRelated` "Related", `helperModeOn`, `guideNotFound` (file `web/messages/es.json`, section `dashboard.adminSupport`). (b) Hard-coded persona "Oran" in email subjects and in in-app titles "Oran replied" and in eyebrow `staffEyebrow` "ORAN · TULALA HQ" while `{agent}` renders "Orlando". (c) AI fail-open line `SUPPORT_CHAT_FAIL_OPEN_BODY` is an English constant, not a catalog key, so a Spanish user sees English (`support-chat-shared.ts`). (d) All catalog email subjects are English only. (e) Rate-limit and validation errors "Too many requests. Try again shortly." / "Invalid input." are English constants in the server actions. Record each as pass or defect with a screenshot. |

### 1.10 Phone layout (390 x 844)

| ID | Role | Steps | Expected | Evidence |
|---|---|---|---|---|
| SD-48 | T1, C1 | At 390 px open the launcher, then Home, Tickets, a thread, the new-ticket form, the idea form, the Guide. | Compact viewport uses a full-screen sheet with a focus trap (`use-compact-viewport.ts`, `use-focus-trap.ts`); desktop pushes the page instead (`data-tulala-support-open`). No horizontal page scroll. Tap targets at least 44 px (some controls are declared 44 x 44 in `SupportPanelForms.tsx`; measure the rest). The composer stays above the keyboard; Send reachable. Closing returns focus to the launcher. | Screenshot per view; list any target under 44 px |
| SD-49 | A1 | Open `/desk` at 390 and at 768 px. | Mobile has Back button ("Back"), "Views" sheet and "Customer context" sheet (strings `deskBack`, `deskViews`, `deskContextSheet`). Usable at tablet width. Verify reply, note, resolve, assign are reachable. | Screenshots |

### 1.11 Abuse, size and rate limits

| ID | Role | Steps | Expected | Evidence |
|---|---|---|---|---|
| SD-50 | T1 | With the limiter store configured, create 6 tickets in an hour; send 31 messages in an hour. | Limits: 5 ticket creates / 60 min / user and 30 messages / 60 min / user (`rate-limit-kv.ts`). The 6th create returns "Too many requests. Try again shortly." and creates no row (check Q-TICKET count). Without the store configured the limiter is a no-op and this case cannot pass: record the stack state first. Note: the ticket create check runs for the three authenticated surfaces; attachments reuse the message limiter. | Q-TICKET count; error screenshot |
| SD-51 | G1 | Spam the guest form: 4 submissions in an hour from one session or one email; fill the hidden honeypot via the console; 25 chat messages in a minute. | Guest limits (`rate-limit-kv-guest-support.ts`): create 3/hour per session, 10/hour per IP, 3/hour per email; messages 20/min per session, 60/min per IP; AI 20/hour per IP. Honeypot hit is refused. Disposable email addresses are refused (code `disposable_email`, `guest-support-abuse-guard.ts`; exact list `unverified`). Errors read "Too many chats from this session. Try again later." etc. | Error screenshots |
| SD-52 | T1 | Create a ticket with a 8001 character body, then exactly 8000; subject of 201 chars; paste 5000 emoji. | Body max 8000 and subject max 200 are enforced server side (`actions.ts` zod). The 8001 case returns "Invalid input." (the UI may pre-limit; note which). Check the thread renders long text without layout break (also at 390 px). AI input is truncated to 800 chars per message in the prompt. | Screenshots |
| SD-53 | T1 | Send a message containing a link `https://evil.example/x` and a `javascript:` string, and an HTML snippet `<img src=x onerror=alert(1)>`. | Text renders as plain text, no script execution, link not auto-executed. Whether requester or agent text is auto-linked is `unverified` (read `SupportThreadView.tsx` if it matters). Only AI output is link-filtered (SD-16). | Screenshot |
| SD-54 | T1 | Double submit: click "Create ticket" twice fast; click "Send reply" twice on a throttled network; retry after a failed send. | Desk sends carry a client send key; a retry with the same key returns the original message instead of duplicating (`appendMessage` + `findMessageByClientSendKey`; `desk/desk-send.ts` blocks a second in-flight identical send). On the requester side the error "That did not send. Your text is still here, try again." keeps the text. A double click on ticket create: the client-side guard is `unverified`; count rows in Q-TICKET. Also send 3 tickets quickly (card H1): expect up to 3 distinct tickets, correct order by `created_at`, no duplicates. | Q-TICKET; Q-MSGS counts |

### 1.12 Lifecycle cron

| ID | Role | Steps | Expected | Evidence |
|---|---|---|---|---|
| SD-55 | Tester | Age test rows by SQL on the ISOLATED project only (this is the one write in the run, allowed because it is a throwaway row), then call `GET /api/cron/support-lifecycle` with header `Authorization: Bearer <CRON_SECRET>` (value from the secret store, never pasted into notes). | Without the header: 401; secret unset: 503. Per `web/src/app/api/cron/support-lifecycle/route.ts`: (a) resolved older than 72h becomes `closed`; (b) open + `waiting_on='requester'` idle 5 days (and under 7) gets one auto-close warning, event `auto_close_warning`, mail "Still need help on #N?"; (c) idle 7 days is auto-resolved with `metadata.auto_resolved=true`; (d) open human tickets with no agent reply 4h after escalation re-alert admins (subject "Still waiting: ticket #N (...)"), capped by `MAX_RE_ALERTS` (`realert-schedule.ts`); (e) expired proposed actions. Response stats counted. | Response JSON; before/after Q-TICKET; mails |

### 1.13 Error states

| ID | Role | Steps | Expected | Evidence |
|---|---|---|---|---|
| SD-56 | A1 | Load the Desk with the network off after loading, then send a reply. | Copy "Network error. Check your connection and retry." (`deskNetworkError`) and "Send failed. Retry will not create a duplicate while in flight." with "Retry"; no raw "Error:" text. Ticket load failure: "Could not load this conversation." | Screenshots |
| SD-57 | T1 | Open a ticket drawer by id that does not exist (`?support=` with a random uuid). | Graceful empty state "This ticket could not be loaded." (`drawerEmpty`), no crash. | Screenshot |
| SD-58 | Tester | After the run, check Sentry and the browser console for the run window. | No new unhandled errors from the support code paths. Sentry access for the isolated project is `unverified`. | Console log, Sentry link |

### 1.14 Cleanup (ISOLATED project only)

Created by this run: rows in `support_tickets`, `support_messages`, `support_message_reads`,
`support_ticket_events`, `support_attachments` (+ files in bucket `support-attachments`),
feature-request rows from SD-04, notification and dispatch rows, `resend_inbound_emails` rows from
SD-37, proposed-action rows, `support_canned_replies` edits, and any guest session and lead rows.
Also reset: the AI flags, the tenant AI controls changed in SD-19, the `SUPPORT_DESK_ENABLED`
value, the `RESEND_*` env changes, and the aged timestamps from SD-55.

Steps: (1) assert the target is the isolated project with `assertIsolatedJourneysTarget`
(`web/scripts/isolated-target-guard.mjs`). (2) Close every test ticket in the Desk first, so
a half-cleaned run does not leave open alerts. (3) Delete by subject prefix `QA-SD%` through
a throwaway script that is guarded the same way as `web/scripts/cleanup-journeys-program.mjs`
(that script removes journeys tenants; it does not know support tables, `unverified` whether
cascade covers them, check before relying on it). (4) Delete the bucket objects under the
ticket id prefixes. (5) Re-run Q-TICKET and expect zero rows. Never run any delete against
production or a real tenant.

---

## 2. Coverage matrix and gaps

### 2.1 Feature x case

| Feature | Cases |
|---|---|
| Talent opens ticket / panel | SD-01, 02, 03, 04, 05 |
| Client opens ticket | SD-06 |
| Workspace staff ticket | SD-07, 41 |
| Guest form / guest chat | SD-08, 09, 36, 51 |
| Talent-site entry | SD-10 (not built) |
| AI grounded reply | SD-11, 12, 15, 16, 17 |
| AI unsure / handoff to human | SD-13, 14, 18 |
| Credits gate / kill switch | SD-11, 19 |
| Provider down | SD-20, 38 |
| Desk access, host, flag | SD-21, 22, 42 |
| Queue, filters, search | SD-23 |
| Context, diagnostics, replay | SD-24 |
| Human reply, canned | SD-25, 26 |
| Internal notes | SD-27, 40 |
| Statuses and transitions | SD-28, 29 |
| Assignment, priority, category | SD-30 |
| Propose fix | SD-31 |
| Insights, ideas | SD-04, 32 |
| Attachments | SD-33 |
| Email outbound | SD-34, 35, 36 |
| Email inbound threading | SD-37 (not built) |
| Permissions (cross-talent, client, tenant, role) | SD-22, 39, 40, 41, 42 |
| Impersonation read-only | SD-43 |
| Presence privacy | SD-44 |
| EN / ES | SD-45, 46, 47 (and every screenshot) |
| Phone | SD-48, 49 |
| Rate limits, abuse, size, double send | SD-50, 51, 52, 53, 54 |
| Lifecycle cron | SD-55 |
| Error states | SD-38, 56, 57, 58 |
| Cleanup | 1.14 |

### 2.2 Things the code does NOT support yet (found while reading)

| Wanted by the Notion card or by the brief | Finding | File checked |
|---|---|---|
| Statuses "new", "waiting on user", "pending" | Not built. Only `open`/`resolved`/`closed` with `waiting_on`. Snooze is literally "proposed for a later phase". | `web/src/lib/support/support-types.ts`, `messages/en.json` key `deskSnoozeProposed` |
| Inbound email reply parsed into the thread, threading headers | Not built. Inbound mail is stored and forwarded only. | `web/src/lib/email/resend-inbound-forward.ts`, `web/src/app/api/webhooks/resend/route.ts`, migration `20261231320001_resend_inbound_emails.sql` |
| Outbound mail sets `In-Reply-To` / `References` | Not found in the support catalog; only a `[Tulala #N]` token in the subject. Provider-level headers `unverified`. | `catalog-entries-support.ts` |
| Client question on a talent site routed to the talent or to Tulala support | Not built: no support launcher on talent public sites. | grep of launcher mounts |
| `/api/support-desk/*` routes | Allow-listed but no route exists. | `web/src/lib/saas/path-groups.ts` (`SUPPORT_DESK_API_PREFIXES`), `web/src/app/api` |
| Desk agents who are not platform admins; per-tenant desk agents | Not built; Desk is platform-admin only. | `desk-access.ts`, `support-access.ts` |
| Attachments other than images; attachments from agents | Images only (5 MB); agent side `unverified`. | `attachment-actions.ts` |
| Localized email subjects | Not built; English literals. | `catalog-entries-support.ts` |
| Localized AI fail-open copy | Not built for the signed-in and guest strings. | `support-chat-shared.ts` |
| Desktop notification permission card "does not nag after dismissal" | Component exists (`NotificationPermissionCard.tsx`) but it is rendered on the legacy HQ page, and the Desk page redirect means it may not be on the Desk. Behavior `unverified`. | `web/src/app/(workspace)/platform/admin/support/page.tsx`, `src/app/desk/page.tsx` |
| Private presence channel in the live Desk | Migration exists; the component that uses it is not mounted by the portal (see SD-44). | `SupportDeskShell.tsx`, `SupportDeskPortal.tsx` |
| Phone call-back flow | Capture only (phone, preference, "{agent} will call you at {phone}" card). No dialing. | `support-engine-contact.ts` |

---

## 3. Open questions for the Support owner

1. Is the 30-step Notion script meant to be replaced by this sheet, or should the status
   names "new / waiting on user" be built first? (Code has three statuses only.)
2. Is inbound email threading in scope for launch? If yes it needs a build ticket before SD-37 can pass.
3. Which address should the isolated stack forward inbound mail to? The code defaults to a personal Gmail address.
4. Where do operators flip `ai_support_enabled` and `ai_master_enabled`, and what is the intended default at launch (code default is OFF)?
5. Should talent-site visitors have any path to Tulala support, or is "inquiry to the talent" the intended and only path?
6. Is the support persona "Orlando" (current) or "Oran" (still hard-coded in email subjects, in-app titles and the staff eyebrow)? Which wins?
7. The live-chat card promises "usually within minutes" but the only timer in code is a 4-hour re-alert. Change the copy or add a timer?
8. Should Spanish users get Spanish AI fail-open text, email subjects and the Guide chrome strings listed in SD-47?
9. Is the private presence channel meant to protect the live Desk? If so the portal must mount the component that uses it.
10. Which proposed-action kinds are safe to approve on the isolated stack for SD-31?
11. Is a platform-admin-only Desk acceptable for launch, or do we need workspace-scoped agents?
12. Does the isolated project have a Sentry project and a readable mail sink for SD-34 to SD-37 and SD-58?
