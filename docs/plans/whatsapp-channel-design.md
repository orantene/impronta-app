# WhatsApp channel for talents: design (TUL-225)

Status: DESIGN ONLY. No code, no migration, no config in this PR.
Author: Onboarding Developer agent. Date: 2026-10-08.
Card: TUL-225, Backlog P2 ("email now, WhatsApp channel later"). The email half
(the "this client came from your website" line in talent emails) was decided on
2026-10-07 and is built separately. This doc covers only the real WhatsApp channel.

Fact labels used below:
- VERIFIED = read on the cited page on 2026-10-08.
- THIRD-PARTY = a blog or reseller said it; not confirmed by Meta.
- UNVERIFIED = I could not confirm it. Do not budget on it.

Plain summary: use WhatsApp only for short, transactional "something happened"
pings to a talent (and later, confirmations to a client), always through
provider-approved utility templates, only after the person opted in with a
number she confirmed herself. Start on Twilio (already in the repo), keep the
provider behind one small interface, and move to Meta Cloud API direct when
volume justifies it. Email stays the fallback.

---------------------------------------------------------------------------

## 0. What exists in the repo today (re-verified on origin/main, 2026-10-08)

| Piece | Where | What it does | Gap for this project |
|---|---|---|---|
| Notification channel type | `web/src/lib/notifications/types.ts` | `NotificationChannel` already includes `"whatsapp"` and `LIVE_CHANNELS` lists it | The name is live but only the owner alert uses it |
| WhatsApp notification handler | `web/src/lib/notifications/channels/whatsapp.ts` | Twilio send, free-text `body`, to ONE env number (`SUPPORT_OWNER_WHATSAPP_TO`), per-invocation dedupe on `eventId`, no-op when env unset | Free text only works inside the 24h window. No template, no per-recipient number, no opt-in, no suppression, no status callback |
| Only catalog user | `catalog-entries-support.ts` (support ticket escalated) | `whatsapp.render(event)` returns a string | Talent entries have no `whatsapp` block |
| Talent catalog entries | `catalog-entries-inquiry.ts`, `-billing.ts` | `inquiry.submitted.talent`, `offer.sent.talent`, `booking.confirmed.talent`, `roster.talent_invited.talent`, `payment.payout_settled.talent`, `payment.payout_reversed.talent` | Email, in-app and push only |
| Client-side entries | `catalog-entries-sessions.ts`, `-billing.ts` | `session.reminder.client`, `payment.received.client`, `payment.deposit_received.client`, `payment.invoice_issued.client` | Email, in-app only |
| Dispatcher | `notifications/dispatcher.ts` | Fans out per recipient and channel, retry, outcome | Needs a per-channel "can I send" gate for WhatsApp |
| Dispatch log | `notification_dispatch_log` (migration `20260513221951`) | Already allows `channel = 'whatsapp'`, `status` queued/sent/failed/suppressed, `provider_reference` | Good: no new log table needed. The migration comment says WhatsApp/SMS were "future sessions" |
| Email suppression | `suppressions.ts`, `email_suppressions` (keyed user_id + email_address, guest variant) | Resend webhook writes rows; email channel checks before send | Needs a phone-number twin |
| Preferences | `user_prefs.notification_prefs` JSONB, shape `{eventId: {email, push}}` | Per-event channel booleans | Needs a `whatsapp` boolean, off by default. `NotificationPrefsPanel.tsx` says "minus owner-only WhatsApp", so the panel hides it today |
| Consent records | `terms_acceptances` (migration `20261231299910`): version, context, ip_hash, user_agent, service-role writes only | Proves who accepted which policy | Contexts are fixed to signup/inquiry/offer_approval/payment; WhatsApp consent needs its own table (it needs the number and the text shown) |
| Marketing consent | `saveClientMarketingConsent` in `lib/client-account/actions.ts` writes `marketing_opt_in` + `marketing_opt_in_at` | Boolean + timestamp for clients | Not channel-specific, no text shown, no source. Must NOT be reused as WhatsApp consent |
| Client chat over WhatsApp | `lib/messaging/channels/whatsapp.ts`, `lib/channels/*`, `app/api/webhooks/messaging/[channel]/route.ts` | Queues chat messages to the inquiry contact; reads `inquiries.contact_phone` or an `external_thread_ref` shaped `whatsapp:<digits>@c.us`; HMAC-checked webhook; pairing actions and a worker client | This looks like a worker-paired WhatsApp session (a QR-style link), NOT the official Business Platform. I did not audit it in depth: it needs a separate review for WhatsApp policy risk. This design must not share its sender |
| Source line | `notifications/talent-site-source-line.ts` | Returns the es/en "this client came from your website (<address>)" line, null for other sources | Becomes a template variable |
| Talent phone | talent profile phone | Private profile phone | NOT her WhatsApp number. Card is explicit: separate field |
| Webhook route reachability | `web/src/lib/saas/surface-allow-list.ts` (`SHARED_API_PREFIXES`) | The 4th layer in `web/AGENTS.md` | Any new `/api/webhooks/...` path must be listed or it 404s on every host |

Idempotency note: `emit.ts` already guarantees `(origin_event_id, user_id)`
uniqueness for in-app rows, and the WhatsApp handler dedupes on `eventId`. The
existing dedupe is an in-memory `Set` per server invocation, so it does not
survive across invocations. The new channel must dedupe in the database (section 5).

---------------------------------------------------------------------------

## 1. Purpose and non-goals

### 1.1 What the channel is for

One sentence: tell a person that something needing attention happened, in the
place she already looks, with one tappable link back to Tulala.

Talent (first audience, matches the card):

| Moment | Existing catalog entry | WhatsApp at launch? | Template |
|---|---|---|---|
| New inquiry arrived (with "came from your website" line when applicable) | `inquiry.submitted.talent` | Yes | T1 |
| Offer sent to her / needs her rate | `offer.sent.talent` | Phase 2 | T2 |
| Booking confirmed | `booking.confirmed.talent` | Yes | T3 |
| Day-before reminder | no talent reminder entry exists (only `session.reminder.client`); needs a new entry | Yes, needs new entry | T4 |
| Payment received / payout settled | `payment.payout_settled.talent` | Yes | T5 |
| Invited to a roster | `roster.talent_invited.talent` | Phase 2 | reuse T1 style |
| Payout reversed | `payment.payout_reversed.talent` | Not on WhatsApp (sensitive, email + in-app) | none |
| Trial ending, discounts | `talent.trial_will_end`, `talent.discount_ending` | NEVER (these are marketing-ish plan nudges) | none |

Client (second audience, Phase 3): `session.reminder.client`,
`payment.received.client`, `payment.deposit_received.client`. Confirmations and
reminders only, only if the client ticked the booking checkbox.

### 1.2 What it is NOT

- No marketing, promotion, newsletters, upsell, plan nudges, or "come back" messages at launch. Marketing templates cost roughly 10x utility (THIRD-PARTY figure in section 2.3) and need stricter consent.
- Not a chat inbox. We do not read or answer inbound replies at launch, other than STOP/BAJA/HELP keywords and a polite auto-reply pointing to the app.
- Not the agency's own WhatsApp inbox feature (the `lib/channels` worker flow). Different product, different risk.
- Not a replacement for email. Email remains the system of record and the fallback.
- No payout amounts or client personal data in the message body. Names and one link only (section 4.6).

---------------------------------------------------------------------------

## 2. Provider options (WhatsApp Business Platform)

Retrieval date for everything in this section: 2026-10-08.

### 2.1 How the platform charges (VERIFIED)

Source: https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing (2026-10-08)

- Since 1 July 2025 Meta bills per delivered template message, by template category (marketing, utility, authentication) and by the recipient's country calling code.
- Non-template messages are free but only inside an open 24-hour customer service window (opened when the user messages you).
- Utility templates sent inside an open service window are free.
- A "free entry point" window (72 hours) applies to people who arrive through click-to-WhatsApp ads or Page buttons. Not relevant to us.
- Rate cards are published as downloadable files per currency (Mexico is in the MXN row, the US is in the USD row), effective 1 April 2026 with later updates. The page text I could read does not print the numbers.
- Mexico: marketing rates were lowered on 1 Oct 2025. US/Canada: utility and authentication rates were lowered on 1 Jan 2026. The 1 Jul 2026 and 1 Oct 2026 change lists do not include Mexico or the US.

### 2.2 Provider comparison

| Provider | Onboarding (what WE do) | Mexico + US | Delivery status webhooks | Pricing model | Notes for Tulala |
|---|---|---|---|---|---|
| Meta Cloud API direct | Business portfolio, create app, WABA, register number, display name review, business verification for higher limits (page I fetched does not detail the last three) | Meta sends to both; rates per recipient country | Webhook endpoint for statuses; the page I read names read and delivered, I did not confirm sent/failed on it | Meta fees only, no markup (rates: section 2.3) | Cheapest; we own the HTTP client, template sync and status mapping. Source: https://developers.facebook.com/documentation/business-messaging/whatsapp/get-started |
| Twilio | Upgraded Twilio account, admin on a Meta business portfolio, Self Sign-up creates a WABA, set display name, SMS/voice OTP on the number, Meta reviews display name, business verification (can take weeks) before production. One WABA per Twilio account. If the display name is rejected the number is capped at 250 business-initiated messages per 24h | Both listed in its pricing calculator | Status callbacks exist in Twilio's messaging API (not on the page I read: confirm in the build PR) | Meta fee passed through + Twilio fee of US$0.005 per message in or out, +US$0.001 on failures (VERIFIED) | Already in the repo (`twilio` SDK, env vars, owner alert). Fastest path. Sources: https://www.twilio.com/docs/whatsapp/self-sign-up , https://www.twilio.com/en-us/whatsapp/pricing |
| 360dialog | Meta Embedded Signup style onboarding (not confirmed on the page I read) | UNVERIFIED for country-level detail | UNVERIFIED on the page I read | Monthly fee per number (Regular EUR 49, Premium EUR 99, Scale EUR 500) + Meta fees, "no markup on Meta fees" (VERIFIED) | Flat fee beats Twilio's per-message fee above roughly 10,000 messages a month. Source: https://www.360dialog.com/pricing |
| MessageBird / Bird | Not retrieved | UNVERIFIED | UNVERIFIED | UNVERIFIED | Do not shortlist without a quote |
| Vonage | Not retrieved | UNVERIFIED | UNVERIFIED | UNVERIFIED | Same |
| WATI / Gupshup | Not retrieved | UNVERIFIED | UNVERIFIED | UNVERIFIED | Both are mainly inbox/chatbot products for SMBs; wrong shape for a transactional sender |

I could not verify MessageBird/Bird, Vonage, WATI or Gupshup in this pass; they
are listed so the owner knows they were considered, not because I can vouch for them.

### 2.3 Numbers for Mexico and the US

| Item | Value | Status |
|---|---|---|
| Mexico utility template, per message | about US$0.004 | THIRD-PARTY (https://www.messagecentral.com/blog/whatsapp-business-api-pricing-2026 , 2026-10-08). UNVERIFIED against Meta's rate file |
| Mexico marketing template, per message | about US$0.0378 | THIRD-PARTY, same page. UNVERIFIED |
| Mexico authentication | no figure found | UNVERIFIED |
| US utility template, per message | US$0.0034 | Twilio's pricing page shows this as a utility figure in its calculator, region not stated. Read as the US figure with caution: UNVERIFIED (https://www.twilio.com/en-us/whatsapp/pricing) |
| US marketing, authentication | no figure found | UNVERIFIED |
| Service messages inside the 24h window | free | VERIFIED (Meta pricing page above) |
| Utility templates inside the 24h window | free | VERIFIED |
| Is there a peso (MXN) rate card? | Meta lists an MXN row | VERIFIED that the row exists; figures not read |

ACTION before any budget sign-off: download the MXN and USD rate CSVs from the
Meta pricing page (or read them in WhatsApp Manager) and replace this table. I
was unable to open the PDF/CSV in this environment (a Salesforce-hosted copy of
a May 2026 rate card came back as binary and could not be parsed).

### 2.4 Template approval, languages, categories (VERIFIED unless noted)

Source: https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/overview (2026-10-08)

- Three categories: authentication, marketing, utility. Category drives price.
- Templates are reviewed automatically on creation or edit, "In Review" can take up to 24 hours.
- Only `APPROVED` templates can be sent. Status changes arrive as `message_template_status_update` webhooks, or can be polled via the template API.
- Quality labels: pending, high, medium, low. Repeated negative feedback or low read rates can PAUSE a template (cannot be sent) and later disable it.
- Language code is required at creation. Meta does NOT translate; each language is a separate template entry and counts toward the template limit.
- Variables are positional (`{{1}}`) or named (`{{client_name}}`, lowercase and underscores). An example value per variable is required.
- Meta decides the final category. A template written as utility that reads like promotion can be re-categorised as marketing (the categorization page was not readable in this pass: UNVERIFIED detail, treat as a real risk and keep copy strictly transactional).
- Locale: we need `es_MX` and `en_US` (plus plain `es` is acceptable if Meta offers it: UNVERIFIED, decide when creating).

### 2.5 The 24-hour customer service window

- Opens when the person messages our number. Inside it we may send free-form text (free) and utility templates (free).
- Outside it only approved templates can be sent, and they are billed.
- Business-initiated pings to a talent will almost always be outside the window, so every launch message is a billed utility template. Design for that: the window is a bonus, not a plan.
- If she replies "ok" to a ping, we may answer with free text for 24h. At launch we do not (non-goal), but the window state should be recorded (`last_inbound_at`) so a later phase can use it.

---------------------------------------------------------------------------

## 3. The five core templates (draft copy, es and en, no em dashes)

Rules for all templates: category UTILITY, one variable-driven sentence or
two, no emojis, no promotional words ("free", "offer", "discount", "now!"), a
brand name in the text, and a single URL placed as the LAST variable. Use named
variables if the provider allows; otherwise map positionally in the order
shown. Example values are required at submission.

Names: `tulala_talent_new_inquiry`, `tulala_talent_booking_confirmed`,
`tulala_talent_reminder`, `tulala_talent_payment`, `tulala_talent_inquiry_site`
(variant with the source line). Locale suffix per language.

### T1. New inquiry

| | Text |
|---|---|
| es_MX | `Hola {{talent_name}}, tienes una nueva consulta de {{client_name}} para el {{date}}. Revisa los detalles y responde en Tulala: {{link}}` |
| en_US | `Hi {{talent_name}}, you have a new inquiry from {{client_name}} for {{date}}. Review the details and reply in Tulala: {{link}}` |
| Examples | Valeria, Hotel Casa Sol, 14 nov, https://app.tulala.digital/t/inbox/123 |

### T1b. New inquiry from her own website (carries the source line)

| | Text |
|---|---|
| es_MX | `Hola {{talent_name}}, tienes una nueva consulta de {{client_name}} para el {{date}}. Este cliente llegó desde tu sitio web ({{site_address}}). Responde en Tulala: {{link}}` |
| en_US | `Hi {{talent_name}}, you have a new inquiry from {{client_name}} for {{date}}. This client came from your website ({{site_address}}). Reply in Tulala: {{link}}` |

The wording of the clause is the same string `talent-site-source-line.ts`
returns today. Because a template body is fixed text, the source line is a
SEPARATE template (T1b), chosen when `source_context.host_kind === "talent_site"`.
We cannot make the sentence optional inside one template.

### T3. Booking confirmed

| | Text |
|---|---|
| es_MX | `Hola {{talent_name}}, tu reserva con {{client_name}} el {{date}} a las {{time}} está confirmada. Ver detalles: {{link}}` |
| en_US | `Hi {{talent_name}}, your booking with {{client_name}} on {{date}} at {{time}} is confirmed. View details: {{link}}` |

### T4. Reminder (day before)

| | Text |
|---|---|
| es_MX | `Recordatorio: mañana a las {{time}} tienes una reserva con {{client_name}}. Detalles y ubicación en Tulala: {{link}}` |
| en_US | `Reminder: tomorrow at {{time}} you have a booking with {{client_name}}. Details and location in Tulala: {{link}}` |

### T5. Payment received

| | Text |
|---|---|
| es_MX | `Hola {{talent_name}}, se registró un pago de tu reserva con {{client_name}} del {{date}}. Revisa tu resumen en Tulala: {{link}}` |
| en_US | `Hi {{talent_name}}, a payment was recorded for your booking with {{client_name}} on {{date}}. See your summary in Tulala: {{link}}` |

No amount in the body on purpose (section 4.6): the link opens the authenticated page.

Client-facing variants (Phase 3) follow the same shape: confirmation and
reminder, with the talent's display name in the body, the one-line opt-out hint
"Responde BAJA para dejar de recibir estos avisos" / "Reply STOP to stop these
messages" only if we decide the footer is needed (quick-reply STOP button is
preferred, see 4.4).

Approval plan: submit all templates in both languages in one batch on day one
of Phase 1 so the up-to-24h reviews (plus any rejections and edits) run in
parallel with engineering. Expect at least one rejection round (UNVERIFIED
estimate; plan a week of calendar slack).

---------------------------------------------------------------------------

## 4. Opt-in, consent, retention

### 4.1 What WhatsApp requires (VERIFIED)

Source: https://whatsappbusiness.com/es-la/policy/ (2026-10-08, paraphrased)

- We may message someone only if they gave us their number and explicitly agreed to receive our later messages.
- Consent should cover each category of message we send. Calls need separate consent.
- We are responsible for how consent is collected and for legal notices where we operate.
- Every block / stop / unsubscribe request must be honored, inside or outside WhatsApp, including removing the person from our list.
- Opt-in and opt-out flows must be clear and easy.

### 4.2 Talent opt-in (Settings, own number, one-time code)

Flow, in Settings > Notifications (preset first, advanced hidden, per `web/AGENTS.md`):

1. A single toggle "WhatsApp alerts" with an (i) tooltip. Off by default.
2. Turning it on opens a small sheet: country-code phone input (reuse `intl-phone-input.tsx`), pre-filled EMPTY (never prefill the private profile phone).
3. We send a one-time 6-digit code TO THAT NUMBER ON WHATSAPP (authentication template, billed; or SMS as a cheaper fallback; decide in Phase 1). She types it back. This proves she controls the number and that it has WhatsApp.
4. On success we store the consent record (4.5) and show the text she agreed to.
5. A "Send me a test" button sends T3 with sample data once, so she sees what to expect.
6. Changing the number repeats the code step; the old number's consent is closed.

Consent text shown (es, draft; en mirrors it): "Acepto recibir avisos de Tulala por WhatsApp en este número: nuevas consultas, reservas confirmadas, recordatorios y pagos. Puedo responder BAJA o apagar esto en Ajustes cuando quiera." Needs legal review.

Defaults: per-event toggles follow the existing `notification_prefs` shape with
a new `whatsapp` boolean, all false until she confirms the number, then true
for the five launch events only.

### 4.3 Client opt-in (Phase 3)

- At booking/inquiry, an unticked checkbox: "Send me booking confirmations and reminders on WhatsApp" next to the phone field. Never pre-ticked, never bundled with accepting terms.
- Store: number (E.164), timestamp, source (`inquiry_form`, `booking_sheet`, `talent_site`), the exact checkbox text and its version id, ip_hash and user_agent (same minimal fields `terms_acceptances` uses), inquiry id.
- Only confirmations and reminders for THAT booking. No marketing, even though `saveClientMarketingConsent` may be true: that flag is not channel consent.
- A guest with no account is allowed (same grain as the guest email suppression table).

### 4.4 Opt-out and suppression

- Keywords (case-insensitive, accent-insensitive, trimmed): STOP, BAJA, CANCELAR, PARAR, UNSUBSCRIBE, NO. Also treat the Meta "Stop notifications" quick-reply button as a stop. HELP / AYUDA returns a short reply pointing to Settings.
- Inbound STOP writes a suppression row, closes the consent record (`revoked_at`, `revoked_via = 'keyword'`), and sends one confirmation reply (allowed: inside the window it opened).
- Suppression is per recipient number, scoped like email: `(user_id, phone_e164)` for accounts, phone only for guests. New table `whatsapp_suppressions` mirroring `email_suppressions`, same degrade-open helper pattern as `isEmailSuppressed`, but this one should degrade CLOSED: if we cannot check suppression for WhatsApp, we do not send (a stray message after STOP is worse than a missed ping). This is a deliberate difference from the email helper.
- Provider-level signals also suppress: a "number is not on WhatsApp" failure, repeated delivery failures (3 in a row), and a block signal.
- Re-opt-in needs a fresh code (talent) or a fresh checkbox (client). Never auto-clear a suppression.

### 4.5 Data model sketch (names only, no SQL here)

| Table | Purpose | Key columns |
|---|---|---|
| `whatsapp_consents` | Proof of consent | id, subject (user_id or guest ref), phone_e164, audience (`talent`/`client`), granted_at, source, consent_text_version, consent_text_snapshot, ip_hash, user_agent, verified_via, revoked_at, revoked_via |
| `whatsapp_suppressions` | Do-not-send list | id, phone_e164, user_id nullable, reason, created_at |
| `whatsapp_messages` (or reuse `notification_dispatch_log` plus a status table) | Delivery receipts | provider_message_id, dispatch_log_id, status (sent/delivered/read/failed), error_code, status_at |

Reuse `notification_dispatch_log` for the queue and the per-event record (it
already allows `whatsapp`); add only what it lacks (message-level status
history). RLS: service role writes only, no anon/authenticated policies, per the
2026-09 "WITH CHECK (true)" lesson and the `terms_acceptances` precedent.

### 4.6 Privacy and retention (HIGH LEVEL, NEEDS LEGAL REVIEW)

This is not legal advice. Items to put in front of counsel before launch:

- Mexico (LFPDPPP): privacy notice must disclose WhatsApp/Meta as a recipient or processor; consent for the purpose; ARCO rights (access, rectification, cancellation, opposition) must reach this data; cross-border transfer (Meta and the provider host outside Mexico) needs to be covered in the notice.
- US: TCPA covers texts to US numbers; WhatsApp is not SMS but counsel should confirm treatment. State privacy laws (e.g. California) for client numbers.
- Retention (proposal, needs legal sign-off): keep consent proof for the life of the relationship plus the statute window; keep message bodies as short as possible; store delivery metadata 13 months; purge phone number from suppression only on a verified erasure request (keep a salted hash so the STOP is still honored).
- Minimization in the message itself: no payout amounts, no client phone/email/address, no free-text from the client. Names and a link only. A WhatsApp message lives on a handset and in a backup; email is easier to retire.
- Subprocessor list and the privacy policy must name Meta and the chosen provider before launch.
- This overlaps the open legal/policy inventory work (memory note: handed to the Mockup Manager); coordinate, do not duplicate.

---------------------------------------------------------------------------

## 5. Architecture sketch

### 5.1 Shape

```
event ──> emit/dispatcher ──> per-recipient resolve ──> channel gates ──> whatsapp channel
                                                       (flag, consent,        │
                                                        suppression,          ▼
                                                        prefs, quiet hrs)  provider adapter
                                                                           (twilio | meta)
                                                                               │
provider ──> POST /api/webhooks/whatsapp-status ──> verify signature ──> update status ──> maybe email fallback
```

### 5.2 Changes by layer (what a later build PR touches)

1. Catalog: add an optional per-entry `whatsapp` block shaped as TEMPLATE + VARIABLES (template key, locale from the recipient's language, variable list), not a free string. The owner alert keeps its free-text render. Only the six talent entries in section 1.1 get blocks at launch.
2. Channel handler: the current `channels/whatsapp.ts` is replaced by a thin router: owner alert path unchanged, talent path new. Recipient number comes from `whatsapp_consents` (verified, not revoked), NEVER from the profile phone.
3. Provider interface: one small `WhatsAppProvider` with `sendTemplate({to, template, locale, variables})`, `parseStatus(request)`, `verifySignature(request)`. Twilio adapter first, Meta adapter later. A static test pins that nothing outside the adapter imports a provider SDK.
4. Webhook route: a NEW route for status callbacks and inbound keywords, separate from `/api/webhooks/messaging/[channel]` (which belongs to the worker-based inbox and uses its own HMAC header). Reuse its `timingSafeEqual` signature pattern with the provider's own scheme. FOUR-LAYER RULE (`web/AGENTS.md`): after creating `app/api/**/route.ts` add the prefix to `SHARED_API_PREFIXES` in `src/lib/saas/surface-allow-list.ts`; `api-route-reachability.static.test.ts` must pass; verify on the production host kind, not just in a unit test.
5. Template sync: store template name, locale, status and category in a small table, updated from the template-status webhook; the channel refuses to send a template that is not `APPROVED` and falls back to email.
6. Preferences UI: the `whatsapp` toggle in `NotificationPrefsPanel.tsx` (currently hidden as owner-only), plus the verify sheet. All strings en + es (rule in `web/AGENTS.md`); no em dashes.

### 5.3 Sender number

Recommendation: ONE platform-owned verified WhatsApp number and display name
("Tulala"), with the talent's display name in the template body ("Hola Valeria,
...") and, for client messages, "de parte de {{talent_name}}". Reasons: one
business verification, one display-name review, one quality rating to protect,
no per-talent onboarding friction.

Later (Phase 4, only if talents ask): per-talent numbers via Embedded Signup so
messages come from her own business identity. Cost: each talent needs a
Meta business portfolio, number and verification; Twilio caps senders until
business verification (above). Do not build this before demand shows.

Risk of the shared number: one bad actor or complaint wave lowers quality for all.
Mitigate with the strict utility-only scope, STOP handling, and per-talent send caps.

### 5.4 Idempotency

- Key: `(event_id, recipient_user_id, channel = 'whatsapp')` as a unique key on the dispatch row, written BEFORE the provider call as `queued`, flipped to `sent` with `provider_reference` on success. A retry sees the existing row and skips or resumes.
- The in-memory `sentThisInvocation` set stays only as a cheap short-circuit.
- Provider-side: pass our dispatch id as the provider's client reference where supported so a status webhook maps back without guessing.
- Status webhooks are replay-safe: ignore out-of-order downgrades (delivered after read).

### 5.5 Failure and fallback

| Failure | Behaviour |
|---|---|
| Flag off, no consent, suppressed, template not approved | Do not send; `suppressed` row with the reason; email goes as usual |
| Provider 5xx / timeout | Existing retry (`notifications/retry.ts`) up to N times, then email |
| Number not on WhatsApp, permanent error | Mark number invalid, suppress, prompt her in-app to fix the number, email |
| `failed` status webhook within 10 min | Email fallback once, only for T1, T3, T4 (time-sensitive) |
| Template paused | Page the platform admin; all sends of that template fall back to email |

Rule: email is sent for every event regardless (it is the record); WhatsApp is
an ADDITIONAL ping, not a substitute, at launch. Revisit "WhatsApp instead of
email when delivered" after we have delivery data. This also avoids a double-send
dispute: the email is always there.

### 5.6 Flag, limits, quiet hours

- Feature flag in `flags-registry.ts`, Production-only ON per the repo's pattern for talent surfaces; plus a per-talent allowlist for the pilot.
- Rate limits: per talent 20 WhatsApp messages per day and 5 per hour; per platform number a global pacing queue (the client-chat adapter already uses a 2s pace and 60/hour ceiling; follow that spirit). New number tiers start low: Meta's messaging limits (not read in this pass: UNVERIFIED) cap unique recipients per day until verified.
- Quiet hours 22:00 to 07:00 in HER timezone for non-urgent events (T5 payment, T1 inquiry). T3/T4 reminders are scheduled inside her day. Held messages go in the morning, not dropped.
- Dedupe bursts: multiple inquiries within 10 minutes collapse into one "you have N new inquiries" template (needs a count variable; add as T1c in Phase 2).

### 5.7 Cost metering and credits

- Every send writes a cost row: category, country, provider fee, Meta fee estimate (from the rate file in code or table), and the talent/workspace it is attributed to. The dispatch log gets `provider_reference`; add a cost column or a side table.
- Relationship to the AI credits idea ("a growing engine, not a faucet", memory note 2026-09-17): WhatsApp pings are NOT a credit-priced feature at launch. They are a small, capped, included benefit of an active plan. Credits only make sense if we later add paid add-ons (marketing templates, per-talent numbers, high volume). Reasoning: the per-message cost is a fraction of a cent to a cent, and billing it per ping would make a basic safety notification feel metered.
- Guardrails so it cannot become a faucet: per-talent daily caps (5.6), only the six catalog events, no talent-configurable broadcast, and an admin cost dashboard line with an alert at 2x forecast.

---------------------------------------------------------------------------

## 6. Cost model (illustrative, assumptions stated)

Rates used: Mexico utility US$0.004 (THIRD-PARTY, unverified) and US utility
US$0.0034 (Twilio page, unverified). Twilio fee US$0.005 per message (VERIFIED).
Replace with Meta's MXN/USD rate files before sign-off. FX and peso billing
ignored.

Assumptions for 1,000 active talents per month (mine, not measured):
- 6 new-inquiry pings, 2 booking-confirmed, 2 reminders, 2 payment = 12 per talent = 12,000 messages.
- Phase 3 clients: 2 bookings per talent x 2 client messages = 4,000 more.
- All sent outside the 24h window (billed). Success rate ~100%.
- Mix: assume 85% Mexico, 15% US.

| Scenario | Messages | Meta fee (blended ~US$0.0039) | Provider fee | Total per month | Per message |
|---|---|---|---|---|---|
| Talent only, Meta Cloud API direct | 12,000 | about US$47 | 0 | about US$47 | about US$0.004 |
| Talent only, Twilio | 12,000 | about US$47 | US$60 (12,000 x 0.005) | about US$107 | about US$0.009 |
| Talent only, 360dialog Regular | 12,000 | about US$47 | EUR 49 (about US$55, FX unverified) | about US$102 | about US$0.0085 |
| Talent + clients, Meta direct | 16,000 | about US$62 | 0 | about US$62 | about US$0.004 |
| Talent + clients, Twilio | 16,000 | about US$62 | US$80 | about US$142 | about US$0.009 |
| Stress test: Meta fee 5x higher than assumed, Twilio | 16,000 | about US$312 | US$80 | about US$392 | about US$0.025 |

Plus one-time: verification codes at enrollment (1 authentication message per
talent, rate unverified, order of cents), and retries/failures (US$0.001 extra
per failed message on Twilio).

Reading: even in the stress case the cost is under US$0.40 per talent per month.
At the base case it is about US$0.11 to US$0.14 per talent per month on Twilio.

Who pays and margin:
- Recommendation: the platform pays; WhatsApp alerts are included in every plan including free (consistent with the "free-plan instant ON" owner decision: the talent gets value on day one, and the free plan is where discovery happens). Exposure is capped by 5.6.
- If volume per talent grows 10x (heavy-booking talents), a plan-tier cap is the lever: free plan N messages per month, paid plans higher. Do not invent prices now; this needs the owner's call and the plan matrix.
- Margin impact: at about US$0.11 to US$0.14 per active talent per month the channel is small versus any paid plan price, and negligible next to payment processing fees. Verify against the real plan price list; I do not have it in this pass (UNVERIFIED).

---------------------------------------------------------------------------

## 7. Phased plan, risks, open questions, decision

### 7.1 Phases (each bullet is roughly one PR; no PR combines schema and unrelated UI)

Phase 0 (owner/ops, no code): create the Meta business portfolio, start business
verification now (can take weeks, per the Twilio page), pick the display name,
procure the platform number (must not already be on WhatsApp), download the MXN
and USD rate files, engage legal for section 4.6.

Phase 1 (talent, 5 launch events, email always sent too):
1. PR 1: migration for `whatsapp_consents`, `whatsapp_suppressions`, template registry, message status (apply with `db:push` BEFORE merge per the repo rule). Static test for RLS shape.
2. PR 2: provider interface + Twilio adapter + template-send; owner alert path unchanged and regression-tested.
3. PR 3: status/inbound webhook route + `SHARED_API_PREFIXES` entry + reachability test + STOP/BAJA handling.
4. PR 4: Settings opt-in UI: number entry, code verify, per-event toggles, test message, es/en strings.
5. PR 5: catalog blocks for the five launch events, T1b selection from `source_context`, quiet hours, caps, email fallback, cost rows.
6. PR 6: flag, pilot allowlist, admin cost + health line. Pilot with 5 talents; verify a REAL delivery on the real number (owner/integrator does the live check; agents do not browser-QA production).

Phase 2: offer.sent and roster invite templates, burst collapse (T1c), delivered/read analytics in admin.

Phase 3: client confirmations and reminders with booking checkbox (client consent table rows, `session.reminder.client`, `payment.deposit_received.client`).

Phase 4 (only on demand): Meta Cloud API adapter replaces Twilio at volume; per-talent numbers; two-way replies in the inbox.

### 7.2 Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Business verification takes weeks | Blocks launch | Start Phase 0 now; build against the sandbox meanwhile |
| Template rejected or re-categorised as marketing | 10x cost, delay | Strict utility copy, batch submit early, keep a plain version |
| Display name rejected | Capped at 250 business-initiated per day (Twilio page) | Follow Meta guidelines, use the Tulala brand |
| Quality drop pauses templates for everyone (shared number) | All WhatsApp stops, email still works | Utility-only, honor STOP, caps, monitor quality in webhook |
| Message after STOP | Policy and legal exposure | Fail-closed suppression, tests for keyword set |
| Wrong number gets a message | Privacy incident | One-time code; no profile-phone reuse; no amounts or personal data in body |
| Existing worker-paired client WhatsApp flow shares the brand | Policy exposure if it violates WhatsApp terms | Separate audit (see section 0); no shared sender |
| Provider lock-in | Migration pain | Provider interface from day one |
| Cost surprise | Margin | Caps, cost rows, 2x alert |

### 7.3 Open questions for the owner

1. Is WhatsApp an included benefit for all plans, or paid-plan only?
2. Who owns the Meta business portfolio and the verified business name (Tulala legal entity)? Do we have the documents verification needs?
3. Which phone number becomes the sender, and may we dedicate it?
4. SMS fallback for the verification code if WhatsApp is not on her number, or WhatsApp-only?
5. Do talents get WhatsApp for payout amounts if she asks (we say no by default)?
6. Is Mexico the launch market, or Mexico and US together (affects legal review and the rate files)?
7. Who signs off the legal review of section 4.6, and the retention periods?
8. Do we pursue the existing worker-based client WhatsApp flow separately, or retire it (see `lib/channels/REMOVAL.md`)?

### 7.4 Decision table

| Decision | Recommendation | Why | Revisit when |
|---|---|---|---|
| Launch provider | Twilio | Already in the repo and env; self-sign-up creates the WABA; fastest to pilot; fee is about US$60 a month at 12,000 messages | Monthly volume passes about 10,000 to 20,000, or Twilio's per-message fee becomes the largest cost line |
| Target provider | Meta Cloud API direct behind the same interface | No markup; one sender number needs no ISV status | Phase 4 |
| Flat-fee alternative | 360dialog | Fixed per-number fee, no markup on Meta fees | If a quote beats Twilio at our volume |
| Others (Bird, Vonage, WATI, Gupshup) | Not shortlisted | Unverified; inbox-style products | Only if a vendor offers a clear quote |
| Sender | One platform-owned number, talent name in body | One verification, one quality rating | Talents ask for own identity |
| Category | Utility only | Cost and approval | Never marketing at launch |
| Consent | Own number + one-time code, stored text and timestamp | Meets WhatsApp policy, proves ownership | Counsel feedback |
| Email | Always sent, WhatsApp additive | Record, fallback, no double-send dispute | Delivery data supports replacing |
| Who pays | Platform, capped | Pennies per talent | Plan matrix decision |
| Credits | Not at launch | Included benefit, "engine not faucet" | Paid add-ons exist |
| Suppression failure mode | Fail closed | A message after STOP is worse than a missed ping | Never |

---------------------------------------------------------------------------

## 8. Source list (all retrieved 2026-10-08)

- Meta pricing: https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing
- Meta templates overview: https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/overview
- Meta Cloud API get started: https://developers.facebook.com/documentation/business-messaging/whatsapp/get-started
- WhatsApp Business policy (opt-in, opt-out): https://whatsappbusiness.com/es-la/policy/
- Twilio WhatsApp self sign-up: https://www.twilio.com/docs/whatsapp/self-sign-up
- Twilio WhatsApp pricing: https://www.twilio.com/en-us/whatsapp/pricing
- 360dialog pricing: https://www.360dialog.com/pricing
- Third-party 2026 price guide (Mexico figures, THIRD-PARTY): https://www.messagecentral.com/blog/whatsapp-business-api-pricing-2026
- Notion card TUL-225 (page id 3f22c5ee-9743-81df-a9f3-e192eb6f6a61), read-only, fetched 2026-10-08.

## 9. Unverified list (summary)

1. Meta's actual MXN/USD utility, marketing, authentication numbers for Mexico and the US.
2. Twilio's Mexico and US per-country Meta fees (page showed a single 0.0034 utility figure).
3. Delivery-status callback details for Twilio, 360dialog and the Meta sent/failed events.
4. Meta template categorization rules, messaging tier limits, `es` versus `es_MX` availability.
5. MessageBird/Bird, Vonage, WATI, Gupshup: everything.
6. Legal points in 4.6 (LFPDPPP, TCPA, retention periods).
7. Template review turnaround beyond Meta's stated "up to 24 hours", and rejection rate.
8. Plan prices for the margin comparison.
