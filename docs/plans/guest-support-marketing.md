# Guest support + lead chat on tulala.digital

## Context

Tulala has a complete in-app Support Center (PRs #1405, #1412, #1418, #1421, #1427, #1439 — all live). It serves **signed-in** users only, on three surfaces: workspace admin, talent, client. AI answers first, escalates to Oran, and everything lands in the HQ console at `/platform/admin/support`.

`tulala.digital` — the platform's own marketing home, the front door for every prospect — has **no support entry point at all**. Today it offers a `mailto:hello@tulala.digital` in a "?" header popover, a second, divergent hardcoded `mailto:help@tulala.digital` on the help page, and **no contact form anywhere**. A prospect with a pre-sales question has no way to ask one, and nothing they send is recorded, tracked, or followed up.

The goal is twofold and the second half is the commercially important one:

1. **Support parity** — the marketing site funnels into the same support system, so no request is lost.
2. **Lead capture** — a guest conversation is a sales conversation. Prospects ask product questions, get answered instantly, and become identified leads the owner can follow up by phone or email.

The owner's constraint: *"Each support never should lost, it all must be connected."*

**The big finding: the database was already designed for this.** `support_tickets.surface` already permits `'guest'`, `guest_session_id` is already an FK to `public.guest_sessions`, `tenant_id` and `requester_user_id` are already nullable, and `CONSTRAINT support_tickets_requester_present` already contemplates a guest-only requester. This is an application-layer job with one small migration, not a schema project.

**Product decisions, already made — do not re-litigate:**
- **Answer first, then ask for email.** The guest asks freely, the AI answers immediately, and email is requested only when there is something to deliver (email me this answer / keep this thread / get a human). This matches the owner's free-first funnel philosophy.
- **Guest AI is grounded in marketing content**, derived from the existing 21-feature catalogue, pricing copy and role guides — never the admin drawer help corpus, which documents authenticated internals a prospect cannot reach.

---

## Architecture decisions (with rationale — these are the load-bearing calls)

### 1. Guests read through service-role server actions. Zero anon RLS policies. Zero anon grants.

Every support RLS policy is `TO authenticated` and there is no anon grant on any support table (`20261213000000_support_tickets_core.sql:262-329`). Do **not** add one.

An anon `SELECT` policy needs a predicate the anon role can bind. `auth.uid()` is null; the only browser-visible discriminator would be a capability secret in `localStorage`. That would permanently open `support_tickets` and `support_messages` — which hold **every tenant's** support history — to the anon role, for the benefit of one marketing widget. The guest cookie cannot help: browser `supabase-js` calls go straight to PostgREST and never pass through Next middleware, so `x-impronta-guest` is absent, and a client-set header is trivially forgeable.

Guests read via server action; the panel **polls**. This mirrors the existing guest chat (`MiniChatPanel.tsx` has no realtime at all).

> ⚠️ Do not try to make `postgres_changes` work for guests. `support-hooks.ts:82-85` already documents the trap verbatim: an anon socket delivers **zero rows, silently** (`claims_role` was `anon`). That bug already cost this codebase a live incident.

### 2. Signed-in visitors on marketing get **both** identity columns populated.

`support_tickets_requester_present` requires *at least* one of `requester_user_id` / `guest_session_id` — **both is legal**. So a signed-in visitor on tulala.digital gets `surface='guest'`, `guest_session_id=<cookie>`, `requester_user_id=<session>`, `contact_email=<session email>`.

This is free leverage. `loadSupportTicketSummaries` picks it up in their in-app list, RLS `support_tickets_select_requester` matches, and `assertTicketAccess`'s requester branch (`support-access.ts:139`) succeeds — so **every authenticated action works on it with no new code**, and the email prompt is skipped. It is also what makes guest→account conversion nearly free (Phase 9).

### 3. `/contact` is host-dispatched, NOT a new route.

`src/app/(public)/contact/` **already exists** (page, form, actions) and is the *tenant storefront* contact form. Creating `(marketing)/contact` would be an app-router path collision.

Adding `/contact` to the allow-list without more is worse than a 404: the marketing host would serve the tenant page, whose action calls `getPublicTenantScope()` (`actions.ts:100-104`), which returns `null` on marketing hosts — so **every submission returns "session unavailable"**. Page renders, form submits, HTTP 200, zero leads, and the error blames the user.

**Do this instead:** make `(public)/contact/page.tsx` dispatch on `getPublicHostContext().kind`, exactly as `src/app/page.tsx` already does for the homepage. Marketing host → platform contact form + platform action. Tenant host → existing storefront form, untouched. Then add `"/contact"` to `MARKETING_PAGE_PREFIXES`.

### 4. Mount the launcher in `MarketingShell`, not in a layout.

Verified: `src/components/home/marketing-landing.tsx` wraps `MarketingHomePage` in `<MarketingShell>`, and `MarketingShell` is rendered **only** by `(marketing)/layout.tsx`, `marketing-landing.tsx` and `(marketing)/global-directory/page.tsx`. One mount inside `shell.tsx` covers the homepage *and* the route group, and cannot reach agency or hub hosts.

> ⚠️ Mounting in `(marketing)/layout.tsx` misses the homepage — the highest-traffic page — and nobody notices because every other page has it. Mounting in `src/app/layout.tsx` puts a Tulala "Chat with Oran" button on white-labelled agency domains. Add a `getPublicHostContext().kind === "marketing"` assertion in the mount component as defence in depth.

### 5. Guest chat leads do NOT go into `saas_marketing_signups`.

That table has `name`, `audience` and `roster_size` all NOT NULL with CHECK constraints (`20260626120000:34-41`). A chat yields an email and maybe a name, so you would have to fabricate the rest. That permanently poisons `loadLeadStats()`, whose `conversionPct` counts `provisioned_tenant_id IS NOT NULL` — chat leads never provision, so every one drags the owner's headline conversion rate down forever.

Relaxing the NOT NULLs is worse: that table is read by the provisioner, `workspace-signup.server.ts`, the founder digest and `loadOrphanPaidFreeWorkspaces`.

**Union at the read layer instead** (Phase 6), and cross-stamp `metadata.lead_id` both ways so the two stay connected.

---

## Phase 0 — Verify the guest header reaches marketing (do this FIRST, half a day)

Everything downstream assumes `headers().get("x-impronta-guest")` is non-null on tulala.digital. It is set in `src/lib/supabase/middleware.ts:116` and re-forwarded through **rewrites** in `src/proxy.ts:757-771`. Marketing `/` and `(marketing)/*` are **pass-throughs, not rewrites** — confirm the pass-through branch also carries `forwardedRequestHeaders`.

**Verify before writing any other code.** Log the header in a server component on `/` and `/pricing` on a marketing host. If null, the entire feature fails with "we couldn't identify your session" and every downstream fix is wasted work.

Second check: `GUEST_COOKIE_SECRET` must be set in Vercel. Without it `verifyGuestCookie` (`src/lib/guest-cookie.ts:14-20`) accepts **any non-empty value verbatim** with only a `console.warn` — possession of a session-key string becomes full read/write on a ticket holding a prospect's email and transcript. The guest support path must **refuse to serve** when `guestCookieSigningEnabled()` is false, not degrade. Rotating that secret orphans every in-flight thread at once, which is the structural reason email capture matters.

---

## Phase 1 — Guest identity and ownership

**`src/lib/guest/guest-session.ts`** (new, plain server module, not `"use server"`). Extract verbatim from `src/app/t/[profileCode]/_actions/guest-chat-actions.ts:151-192`:
- `resolveGuestSessionId()` — reads `x-impronta-guest`, calls the `ensure_guest_session` SECURITY DEFINER RPC, selects `guest_sessions.id`
- `resolveClientIp()` — the **rightmost** `x-forwarded-for` hop, preferring `x-real-ip`. Copy the comment at `:118-127`; the leftmost hop is attacker-controlled and using `split(",")[0]` silently makes the IP rate-limit dimension free to rotate.

Then **change `guest-chat-actions.ts` to delegate to it**. Leaving the copy in place guarantees drift, and one copy keeps the leftmost-hop bug.

**`src/lib/support/guest-access.ts`** (new): `loadOwnedGuestTicket(admin, ticketId, { guestSessionId, userId })`. Load by id with service role, allow **only** if `ticket.guestSessionId === guestSessionId` OR (`userId` present and `ticket.requesterUserId === userId`). Ticket ids are never trusted; session ids are **never accepted from the client**.

> ⚠️ Do **not** add a guest branch to `assertTicketAccess` (`support-access.ts:121`). It calls `requireSession()` on its first line; a guest branch there makes guest-ownership reachable from all eight authenticated actions. Keep the paths disjoint. A guest branch matching on `contact_email`, or accepting a session id from the client, is a thread-hijack primitive.

---

## Phase 2 — Migration (one file)

Latest is `20261218000000_reservation_message_kind.sql`. **Filenames here are a local sequence, not wall clock** → new file `20261219000000_support_guest.sql`:

```sql
ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS contact_name TEXT,
  ADD COLUMN IF NOT EXISTS guest_last_read_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS support_tickets_guest_session_idx
  ON public.support_tickets (guest_session_id, last_message_at DESC)
  WHERE guest_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS support_tickets_contact_email_idx
  ON public.support_tickets (lower(contact_email))
  WHERE contact_email IS NOT NULL;
```

That is the whole migration. Three deliberate calls:

- **`guest_last_read_at` as a scalar, not a change to `support_message_reads`.** That table has `user_id UUID NOT NULL REFERENCES auth.users(id)`; extending it means dropping a composite PK, making `user_id` nullable, and adding partial unique indexes plus an XOR check — PK surgery for a strictly one-reader-per-ticket case. It is multi-reader because a *workspace* ticket has many readers. A guest ticket has exactly one guest session.
- **Not JSONB for the watermark.** JSONB patching is read-modify-write; the AI route and engine write metadata-adjacent fields concurrently and would clobber.
- **`contact_name` as a real column.** HQ's search does substring matching and the notification layer wants a `displayName`; a JSONB key is neither `ilike`-searchable through PostgREST nor patchable without clobber.

**Do not widen `support_feature_requests.surface`** (its CHECK is the narrower `workspace|talent|client`). Simply do not render `SupportIdeaForm` in the guest panel — a pre-sales lead is not a product-feedback channel.

**Do not add a new `support_ticket_events.event_type`.** `contact_updated` is already in the CHECK; use it with `new_value: { contact_email, claimed_by_user_id }` for both email capture and account claim.

Per `CLAUDE.md`: `npm run db:push` is part of the commit, **before** the merge.

---

## Phase 3 — Engine, guest actions, AI route

### `src/lib/support/support-engine.ts`

**`createTicket` — replace `requesterUserId: string` with a discriminated union, not an optional field:**

```ts
requester:
  | { kind: "user"; userId: string }
  | { kind: "guest"; guestSessionId: string; userId?: string | null }
```

An optional field lets a call site silently omit it and produce a runtime CHECK violation. The union forces the compiler to walk every existing call site. Write both columns from the union; `appendMessage({ authorUserId })` and `insertEvent({ actorUserId })` take `null` for a pure guest. Add `contactName`.

**🔴 `appendMessage`, agent-reply branch (`~:284`) — the single most important fix in this feature.**

It emits `support.message.agent` with `userId: working.requesterUserId`. For a pure guest that is `null`; `eventUser` (`catalog-audiences.ts:529`) returns `[]` on a null userId; the dispatcher iterates an empty array and returns cleanly. **Oran replies into the void.** He sees the message land, gets no error, and the prospect — who closed the tab — receives nothing, ever. There is not even a `dispatch_log` row to notice is missing.

Fix: when `working.surface === "guest" && !working.requesterUserId && working.contactEmail`, emit a **distinct trigger** `support.message.agent.guest`, with its own `insertEvent`-derived eventId, resolved by a new guest audience resolver returning `{ kind: "guest", email, displayName }` — the machinery already exists (`notifications/audience.ts:32-42`, `dedupeId: guest:<email>`).

The same null-audience trap applies to `catalog-entries-support.ts` lines 160, 192, 258, 290, 308, 405. Audit each. Note their `in_app` blocks are `surface: "workspace"` — an in-app notification for a guest is a write to nowhere; guest entries should be email-only.

> ⚠️ Do **not** add a second catalog entry on the existing `support.message.agent` trigger. The dedupe key is `${eventId}:${dedupeId}:${channel}` with **no entry id** (`dispatcher.ts:148`) — two entries on one eventId for the same recipient+channel silently suppress each other via the `23505` handler at `:348`. This is documented at `support-engine.ts:183-186` and is a live footgun. Mint a distinct event row per notification.

### `src/lib/support/support-engine-contact.ts`
Widen `actorUserId` to `string | null`; accept `contactEmail` and `contactName`. Keep callback-confirmed behaviour unchanged.

### `src/lib/support/guest-actions.ts` (new, `"use server"`)

A **separate file**, not new branches in `actions.ts` — that file's `createSchema` enum (`:59`) and `resolveUserId()` (`:316`) are load-bearing for three authenticated surfaces.

| Action | Notes |
|---|---|
| `startGuestSupportChatAction` | honeypot + KV, then create; `handled_by:'ai'` when flags on |
| `sendGuestSupportMessageAction` | |
| `getGuestSupportThreadAction` | also the poll endpoint |
| `listGuestSupportThreadsAction` | by `guest_session_id`, for panel home |
| `attachGuestContactAction` | the answer-first email moment |
| `requestGuestHumanAction` | reuses `supportEngine.escalateTicket` |
| `markGuestThreadReadAction` | writes `guest_last_read_at` |
| `resumeGuestThreadAction` | signed token → rebind session |

**Resume token.** "Never lost" is only true across devices if there is a link. Mint a signed 7-day HMAC over `ticketId` (mirror `src/lib/inquiry/guest-claim-link.ts`), embed in every guest email. On `/contact?t=<token>`: verify, rebind `guest_session_id` to the current cookie's session, stash the prior one in `metadata.prior_guest_sessions`.

### `src/app/api/ai/guest-support-chat/route.ts` (new)

Do **not** branch the existing route — its `requireSession()` + `assertTicketAccess` (`:154-158`) are load-bearing, and the guest needs a different corpus, prompt and escalation policy. Extract `SUPPORT_CHAT_SCHEMA`, `parseModel`, `REASONS`, `failOpen` to `src/lib/support/support-chat-shared.ts` so the two cannot drift.

Reuse unchanged: `resolveAiChatAdapter`, `recordAiUsageEstimate`, `sanitizeSupportAiOutput`, `wantsHumanSupport`, `supportEngine.appendMessage`/`escalateTicket`, the 20s `Promise.race`.

**🔴 Three hard requirements on this route — it is an unauthenticated endpoint that spends claude-sonnet-5 tokens:**

1. **Rate-limit by IP before `assertAiInvocationAllowed`** (see Phase 8).
2. **Hard per-ticket AI-turn ceiling, enforced by counting `authorKind === "ai"` rows *before* calling the adapter.** Today `aiTurns >= 3` only appends an "offer human" card; it does not stop generation. The route is re-entrant on the same ticket, so a loop of `POST {ticketId}` burns tokens indefinitely.
3. **Never call `loadConfirmedInsightCorpus()` on the guest path** — see the leak below.

**🔴 Cross-tenant leak via the insights corpus.** `src/lib/support/insights/load.ts:53-64` filters on `confirmed_at IS NOT NULL` and **nothing else** — no tenant filter, no surface filter — and `insightRowsToCorpus` maps `summary`/`root_cause` into grounding labelled "past confirmed resolution". Both directions are live: a paying agency's private incident becomes grounding for an anonymous prospect's chat, and guest-authored text that becomes a confirmed insight becomes grounding for tenant answers. Scope the corpus by surface. This is a one-line omission that is impossible to notice afterwards.

**🔴 Prompt injection.** The route builds `userMessage` as `JSON.stringify({messages:[...]})` with no delimiters and no untrusted-input fence. `sanitizeSupportAiOutput` strips only non-Tulala **URLs** — it does not touch phone numbers or email addresses, so an injected "for faster help call +1-555-…" renders to the guest as a Tulala answer: **a phishing vector hosted on your own marketing site**. Model output also flows into `setCategory({ subject: model.suggested_subject })`, which is rendered in the HQ queue and in Oran's notification email subject.
Required: fence guest turns explicitly; extend the guardrail to strip phone numbers and emails on the guest surface; never let a model-authored subject stand alone on a guest ticket — prefix it `[guest] …`.

---

## Phase 4 — Marketing UI

### Launcher
Mount in `src/components/marketing/shell.tsx` after `<MarketingFooter />`. New files under `src/components/marketing/support/`:
- `MarketingSupportLauncherMount.tsx` (server) — asserts marketing host kind, resolves locale + actor session + `origin_surface_slug`, builds a contract of server actions
- `MarketingSupportLauncher.tsx` (client) — floating button + unread dot
- `MarketingSupportPanel.tsx` (client) — home / thread views

**Do not reuse `SupportLauncherShell`** (`useAdminShell()` at `:10` throws outside the admin provider) or `SupportPanel` unmodified — it reads via the browser client under RLS (`:176-190`, and it **discards the error**, so failures are invisible), subscribes with `realtime.setAuth`, calls the session-gated `contract.markRead`, and mounts `SupportIdeaForm`.

Reuse the leaf presentation only: `SupportCardRenderer.tsx`, `support-tokens.ts`, `support-panel-geometry.ts`, `use-focus-trap.ts`, `use-compact-viewport.ts`, `support-rel-time.ts`.

**Live updates: poll `getGuestSupportThreadAction` every 6s** while the panel is open, the thread is escalated or `waiting_on === 'support'`, and `document.visibilityState === 'visible'`. Stop otherwise.

Open-from-header: a module-level store plus `window.dispatchEvent(new CustomEvent("tulala:support:open"))`, avoiding a provider through `header.tsx`.

### `/contact`
Per decision 3: host-dispatch inside `src/app/(public)/contact/page.tsx`, mirroring `src/app/page.tsx`. Marketing branch gets its own action that **never calls `getPublicTenantScope()`**.
- Add `"/contact"` to `MARKETING_PAGE_PREFIXES` (`src/lib/saas/surface-allow-list.ts:568`) — it is an allow-list, and a route not in it 404s on marketing hosts. This is a documented past incident class in this repo.
- Add `"/contact"` to the marketing paths array in `src/app/sitemap.ts:136-145`. Single slug, so `/contact` and `/es/contact` both serve — do **not** add it to `SPANISH_NAMED_MARKETING_PATHS`.
- Form: name, email, topic select, message, optional phone, hidden honeypot. Submit → `createTicket` with `surface:'guest'`, `originSlug:'/contact'`, and **`handledBy:'human'`** — a contact form is a human request; do not run the AI on it.

### The "?" menu
`src/components/marketing/marketing-support-menu.tsx` → three rows: "Ask a question" (dispatches the open event), "Help center" → `/help`, "Contact us" → `/contact`. Keep `SUPPORT_EMAIL` exported (other files import it) but stop rendering `mailto:` as the primary path. Fix the divergent hardcoded `help@tulala.digital` at `(marketing)/help/page.tsx:106`.

> ⚠️ Honor the warning at `marketing-support-menu.tsx:53-57`: base colors as **classes**, never inline `style`. Inline declarations outrank the stylesheet and silently kill `hover:` variants — it already happened once in this exact file.

> ⚠️ **Every internal `href` must go through `withLocaleHref`** (`src/i18n/pathnames.ts:113`). `src/lib/saas/marketing-locale-hrefs.guard.test.ts` asserts the set of files containing a bare `href="/…"` equals its allow-list **exactly** — one bare href fails CI, and a stale allow-list entry fails too. Note the guard walks only `src/app/(marketing)` and `src/components/marketing`, so components placed in `src/components/support/` escape it entirely: that is a reason to put the new components under `components/marketing/support/`.

**Do not add `/contact` to the top nav.** `NAV_HREFS` (`marketing-header-nav.ts:23`) zips against `copy.ts` labels **by index**; an insert needs index-aligned edits in both `en` and `es`, and a mismatch silently mislabels a link. Footer + "?" menu + launcher is enough reach.

---

## Phase 5 — Guest AI corpus

New `src/lib/support/guest-corpus.ts`, emitting `HelpCorpusEntry[]` so `retrieveHelpEntries` (`help-corpus.ts:111`) is reused verbatim via its `corpus` option.

**🔴 Build the corpus per locale — `buildGuestCorpus(locale: "en" | "es")`.** The retriever is bag-of-words `hay.includes(tok)` (`:126-129`). A Spanish question against English corpus text scores ~0 on every entry, `picked` is empty, and the model gets an **empty grounding set** — so it says "I'm not sure" to every question a Spanish visitor asks. Silent, and invisible in English QA. Store `metadata.locale` on the ticket so a poll or resume rebuilds the same corpus.

Sources:
1. **`MARKETING_FEATURES`** (21, `src/lib/marketing/features/index.ts:33`) via `getFeatureContent(feature, locale)` → `purpose` from promise+subtitle, `youCanHere` from highlights, `faqs`, `ticketCategory: feature.group` (gives the retriever's category boost something to bind to). Needs a `paraToText(p: Para)` flattener — `Para` is `Array<string | {f, label}>` (`features/types.ts:59`); take `label` for link segments.
2. **Pricing** — derive from `src/lib/marketing/pricing-ladders-copy.ts`, the same module the pricing page renders.
3. **`/help/[role]` guides** — `ROLE_LABELS` is a non-exported const inside `(marketing)/help/[role]/page.tsx:28`. **Extract to `src/lib/marketing/help-guides.ts`** and import from both. Pure move.
4. **`GUEST_SALES_ENTRIES`** — ~10 hand-written entries for what no page answers: free plan, booking cut, how to reach a human, where the team is, Spanish support, data export, migration from a spreadsheet.

**Explicitly not `DRAWER_HELP`** (the admin corpus) and **never `loadConfirmedInsightCorpus()`**.

Two content guardrails:
- **`feature.status === "coming"` must never be sold as shipped.** `HelpCorpusEntry` has no status field; rather than widening the type, prefix `purpose` with `"ON THE ROADMAP, not yet available: "` so it travels with the text into the prompt and cannot be dropped by a mapping. Back it with a system-prompt rule.
- **A stale price in a corpus is a price the AI will quote.** Add a guest-specific `sanitizeGuestAiOutput` rule: any currency amount in the answer must appear verbatim in the grounding text, else strip the sentence and escalate.

**Answer-first is structural, not prompted.** Do not give the model an `ask_for_email` field. The contact card is a client-side rule: after the first AI answer lands, render it. Deterministic and testable.

---

## Phase 6 — Lead capture

### Read-layer union (per decision 5)
New `src/lib/support/load-guest-leads.ts` → `loadRecentSupportLeads(limit): Promise<PlatformLeadRow[]>`. Select guest-surface tickets with `contact_email IS NOT NULL`, map to a `PlatformLeadRow`-compatible shape with `audience: "chat"`, add a `source: "signup" | "support_chat"` discriminator. Merge-sort with `loadRecentLeads()` in the platform Today "Recent leads" card; badge chat rows; deep-link to `/platform/admin/support?ticket=<id>`.

**Leave `loadLeadStats()` untouched** — it measures the signup funnel, and conflating changes the meaning of a number the owner reads daily.

### Keep the two connected
- On email capture, look up `saas_marketing_signups` by normalized email; on a hit, stamp `support_tickets.metadata.lead_id` so HQ shows "this is lead #X coming back".
- Inverse, in `(marketing)/get-started/actions.ts` right after the insert at `:334`: stamp any open guest ticket with a matching email. Best-effort, never blocking.

### The capture moment
1. Guest asks → ticket created, `contact_email` null, `handled_by:'ai'`
2. AI answers
3. Client appends a `messageKind:'card'`, `cardPayload:{kind:'guest-contact'}` message **into the transcript** (not ephemeral state, so it survives reload) with three CTAs that each need an email and say so
4. `attachGuestContactAction` → `updateContact` → `contact_updated` event → notify platform admins → send the guest a confirmation **carrying the resume link**. That email is what makes "never lost" true.
5. Escalation is allowed **without** an email — a guest can still ask for Oran and keep chatting in-session.

> 🔴 **An escalated guest ticket with `contact_email IS NULL` has no reply channel.** Oran can type a reply and nothing will ever reach anyone. HQ must render a loud **NO REPLY CHANNEL** badge on exactly this state.

**🔴 Do not call `ensureGuestClientByEmail` from the support path.** On an email match it writes to `profiles` (`guest-client.ts:88-125`) — `app_role`, `display_name`, `account_status` — and overwrites auth `user_metadata`. That hands an anonymous visitor on tulala.digital a **profile-overwrite primitive** over any existing client account, just by typing that person's email and an arbitrary name. Worse, its privileged-account guard reads `app_role` via `find_auth_user_identity_by_email`, but the platform role now lives in `profiles.platform_role` (`src/lib/access/platform-role.ts:88-99`), with `app_role` the *legacy fallback being migrated away* — so a platform admin can sail past the guard. It is also an **enumeration oracle**: `matched`/`created`/`unlinked` do very different amounts of work, so latency alone reveals which Tulala emails belong to staff.
Store the captured email on `support_tickets.contact_email` and nowhere else.

Analytics — add to `PRODUCT_ANALYTICS_EVENTS` (`src/lib/analytics/product-events.ts`, already namespaces `marketing_*`): `marketing_support_opened`, `marketing_support_question_sent`, `marketing_support_answer_shown`, `marketing_support_email_captured`, `marketing_support_human_requested`, `marketing_contact_form_submitted`. Fire via `trackProductEvent`.

---

## Phase 7 — HQ console

`src/app/(workspace)/platform/admin/support/SupportQueueClient.tsx`:
- `:15` `AudienceId` — add `"guest"` and the chip. Without it the filter at `:154` can never select guest rows.
- `:33-38` `surfaceIcon()` — add a guest case **before** the fallthrough. Today a guest ticket renders with the *client* glyph and colour: a marketing sales lead looks identical to a paying customer's support request, which defeats the point of the feature.
- `:155` search haystack — append `contactEmail`, `contactName`, `requesterEmail`. For a guest, `tenantName` and `requesterName` are both null and the subject is AI-derived, so email is the only thing the owner will type.
- `onTicketInsert` `:99-107` — populate `requesterEmail` from `contactEmail` so a realtime-inserted guest row is searchable without a reload.

`src/lib/support/load-hq.ts`:
- `:111` and `:209` — `requesterEmail` is hardcoded `null` despite being in the type, and `ticket.contactEmail` is rendered **nowhere** in HQ. So today the captured email would be invisible and the feature's whole purpose would silently no-op. Use `contactEmail` for guests; hydrate real users via `admin.auth.admin.getUserById` (precedent: `notifications/audience.ts:48`). Surface it in `TicketContextCard.tsx:64`.
- `loadHqTicketDetail` `pastTickets` (`:151`) only queries `requester_user_id`. Add `else if (ticket.guestSessionId)` → query by `guest_session_id`, **plus** a union by `lower(contact_email)` so a returning guest on a new device shows their history. This is exactly where "it all must be connected" is kept or lost.

`SupportTicketHqDrawer` — guest context block: contact email/name, `origin_surface_slug`, locale, matched `lead_id`, NO REPLY CHANNEL badge.

`loadHqSupportQueue` (`:83`) needs no change — no tenant filter, and `:103-104` already guards null tenantId.

**`hydrateSupportLinks`** (`catalog-entries-support.ts:45-49`) — add a `surface === "guest"` branch producing the marketing resume URL. It currently **defaults to `/talent?support=…`** for any unrecognised surface, so without this a guest reply email links a prospect into the talent dashboard. Also verify the `AgentReply` template renders with `unsubscribeUrl` undefined — guests never get one (`channels/email.ts:62-73` requires a userId) — and if the component hard-requires it, the email throws and is swallowed.

---

## Phase 8 — Anti-abuse

`src/lib/rate-limit-kv.ts` — existing `checkSupportTicketCreate`/`checkSupportMessageSend` (`:630`, `:636`) are keyed on `userId` only. Add `supportGuestSessionKey` / `supportGuestIpKey` / `supportGuestEmailKey` (via `normalizeEmailForKey`, `:119`) and `checkSupportGuestCreateBySession/ByIp/ByEmail`, `checkSupportGuestMessageBySession/ByIp`.

Use a **separate namespace** from `guestCreateIpKey`/`guestCreateEmailKey` (`:142`, `:152`) — those are tenant-scoped for storefront inquiries, and sharing a budget means a busy storefront starves the marketing chat. Suggested: create 3/hr/session, 10/hr/IP, 3/hr/email; message 20/min/session, 60/min/IP.

Note the file's own warning at `:92-98`: the guest session id is a **client-rotatable cookie**, so session-keyed limits reset on cookie deletion. **IP is the dimension that matters**, which is why `resolveClientIp` must take the rightmost hop.

**🔴 Every KV limiter falls back to ALLOW on failure** (`noopLimiter` `:235-265`, `getLimiter` `:296-315`), with only a one-time `console.warn`. With Upstash unconfigured there is effectively **no limit at all** in front of an anonymous LLM endpoint — you discover it on the Anthropic bill. For the guest AI call specifically, **fail closed**: degrade to "we'll get back to you by email" rather than burning tokens.

**🔴 `assertAiInvocationAllowed` is a no-op today.** `20260415190000_ai_provider_management.sql:136` seeds one `ai_tenant_controls` row for `DEFAULT_AI_TENANT_ID` with `monthly_spend_cap_cents`, `max_requests_per_minute` and `max_requests_per_month` all **NULL**, so the gate returns `{ok:true}` on every branch — and guest tickets (`tenantId = null`) all land on that one unconfigured row. Two further defects: the RPM check uses a module-level in-memory `Map` (`ai-usage-gate.ts:6`), which on Vercel is per-lambda-instance and is bypassed by exactly the cold-start fan-out an abuser generates; and `recordAiUsageEstimate` charges a flat 1 cent per call regardless of tokens, so the counter under-reports and any cap trips long after the money is gone.
**Set real values on that row before launch.** This is a data change, not code — it will not appear in any diff review.

**🔴 Do not flip `GUEST_CHAT_CAPTCHA_WIDGET_READY`.** It is a **global** flag shared with the talent guest chat, which has no real widget mounted; setting it to `1` would immediately start requiring tokens from users who cannot produce one, soft-bricking every velocity-tripped guest on tenant storefronts. Also `verifyCaptchaToken` **fails open** when no secret is set (`captcha/verify.ts:130-133`), so captcha is not currently an available mitigation at all — keep it out of the threat model.
**v1: no captcha.** Honeypot + IP/email KV is the floor. If a widget is later wanted on `/contact`, add a *second*, surface-scoped flag (`CONTACT_FORM_CAPTCHA_READY`).

New `src/lib/support/guest-support-abuse-guard.ts` mirroring `guest-abuse-guard.ts:26-36`: L0 honeypot → L1 `isDisposableEmail` (**only at capture** — answer-first means there is no email at question time) → L2 KV. On a disposable address, refuse to *record* it and say so plainly; never delete the ticket or the conversation.

---

## Phase 9 — Guest → account conversion

**1. Resume token** (Phase 3) — rebinds `guest_session_id`, works cross-device.

**2. Sign-in/sign-up.** New `claimGuestSupportTickets(userId)` in `src/lib/support/guest-claim.ts`, called where `mergeGuestActivity` runs:
- **Sweep A** — tickets where `guest_session_id` = current cookie's session AND `requester_user_id IS NULL`. Same browser, same person.
- **Sweep B** — tickets where `lower(contact_email)` = the session's **confirmed** email AND `requester_user_id IS NULL`.

> 🔴 **Sweep B must use the session's verified email, never a client-supplied one, and only when `email_confirmed_at` is set.** Copy the gate verbatim from `client-guest-merge.ts:126-133`.
>
> **Do not assume the inquiry precedent transfers.** `20261017091500_merge_guest_inquiries_email_gated.sql:30-42` spells out the invariant that makes the email-gated inquiry merge safe, and it is *not* "the email is verified" — it is that every guest inquiry path provisions a confirmed account so `client_user_id` is non-null. **`support_tickets` has no `client_user_id` analogue**, and its `contact_email` is unvalidated typed text. A bare email match here re-opens the shared-device takeover hole in a brand-new table, with none of the invariant that closes it for inquiries. The same migration also warns that under `enable_confirmations=false` the account email is not proof of inbox control. Prefer the signed claim token as the primary path.

Set `requester_user_id`; **keep `guest_session_id`** (provenance; the CHECK is satisfied either way). Emit `contact_updated` with `{claimed_by_user_id}`. **Keep `surface='guest'`** — surface records where the conversation *started*; flipping it erases the owner's pre-sales volume from the HQ guest filter. Show a "claimed" indicator instead.

Once claimed the ticket flows into every authenticated path with **no new code** (decision 2). Audit for UI branches switching on surface with no guest case — `SupportContract.surface` is typed `workspace|talent|client` while `SupportTicketSummary.surface` is the full `SupportSurface`, so it compiles either way.

**3. Workspace provisioning.** If `metadata.lead_id` was stamped and that lead later provisions a tenant, backfill `support_tickets.tenant_id` in the provisioner. Best-effort.

---

## GDPR / deliverability

A prospect's email plus a full transcript, with no account, no unsubscribe and no deletion path. `channels/email.ts:62-73` issues an unsubscribe token only when `recipient.userId` is set, so guest mail ships with **no `List-Unsubscribe` / `List-Unsubscribe-Post` headers** — which breaks Gmail's and Yahoo's bulk-sender requirements and can degrade the sending domain for *all* transactional mail. Required before launch: an **email-keyed** unsubscribe token, explicit consent copy at the capture step, and a retention job purging unconverted guest tickets and transcripts.

---

## Sequencing

| Phase | Depends on | Size |
|---|---|---|
| 0 verify header + cookie secret | — | 0.5d |
| 1 identity + ownership | 0 | 1d |
| 2 migration | — | 0.5d |
| 5 corpus | — (parallel) | 2d |
| 3 engine + guest actions + AI route | 1, 2 | 3d |
| 8 anti-abuse | 3 | 1d |
| 4 UI (launcher, /contact, "?" menu) | 3, 5 | 3d |
| 6 lead capture | 3 | 1d |
| 7 HQ | 3 | 1.5d |
| 9 conversion | 3, 7 | 1d |

Ship `0 → 1/2 → 3 → 8 → 4` as the first vertical slice (guests can ask and be answered), then `6 → 7 → 9`.

---

## Verification and QA

**House rules that apply (from `CLAUDE.md` and hard-won incidents):**
- `cd web && npx tsc --noEmit && npm run lint` before every commit. **`npm run lint` does NOT include `test:size-ratchet`** — run it separately after touching a big file, and *trim, never raise the budget*.
- **Test lanes are curated lists in `package.json`.** Adding a `*.test.ts` file does **not** add a test — `grep -n "<your-test-file>" package.json`, and wire it into the lane that owns its directory. This exact gap shipped an unrun test one week ago.
- Branch off fresh `origin/main`. **Never branch off a squash-merged branch** — GitHub marks the PR CONFLICTING and fires **zero** CI checks.
- Migration must be applied with `npm run db:push` **before** the merge, or production 500s on the feature that needs it.
- `deploy:smoke` after release, and **check the real exit code** (`cmd > log; echo $?`), not the log's happy words.

**Automated tests to write (name the lane in the same commit):**
- `support-guest-access.test.ts` — `loadOwnedGuestTicket` allows the owning session, denies a different session, denies a client-supplied session id, allows the requester branch.
- `guest-corpus.test.ts` — a Spanish query returns non-empty grounding (the silent-failure regression); `status:"coming"` features carry the roadmap prefix; no `DRAWER_HELP` entry ever appears.
- `guest-notification-audience.test.ts` — **a ticket with `requester_user_id = null` and a `contact_email` resolves a NON-EMPTY audience.** This is the "Oran replies into the void" regression and no existing test would catch it.
- `guest-ai-turn-ceiling.test.ts` — the Nth call refuses before invoking the adapter.
- Extend `surface-allow-list.test.ts` — `/contact` allowed on marketing kind, denied on agency/hub kinds.
- `marketing-locale-hrefs.guard.test.ts` — will need its allow-list updated in the same commit; confirm it still fails on a deliberately bare href.

**Manual QA — must be done on a preview deploy, not localhost.** Local dev hydration in this repo is unreliable (pages render with DOM present and never hydrate), the KV limiter no-ops without Upstash, captcha fails open without a secret, and the guest cookie is unsigned without `GUEST_COOKIE_SECRET`. **Local "it works" proves nothing** for the abuse, cookie, or realtime items. Note raw `*.vercel.app` URLs 404 (`agency_domains` host gate) — alias the preview to a seeded host or promote it.

Before concluding any UI element is broken, **first prove the page is hydrated** by clicking a known control.

1. **Guest happy path, signed out, incognito** — open tulala.digital, launcher visible on `/` **and** `/pricing`; ask a product question; AI answers grounded in real feature copy; contact card appears *after* the answer; submit email; confirmation email arrives **with a working resume link**.
2. **Resume** — open the resume link in a *different browser*; the thread loads with full history.
3. **Escalation without email** — request a human before giving an email; confirm HQ shows the **NO REPLY CHANNEL** badge.
4. **Oran replies** — reply from HQ to a guest ticket **with** an email; confirm the prospect actually receives it. Check `notification_dispatch_log` for a `sent` row. *This is the single most important check in the whole QA pass.*
5. **Spanish** — repeat step 1 on `/es/`; confirm the answer is grounded, not "I'm not sure".
6. **Signed-in on marketing** — confirm the ticket carries **both** ids and appears in the in-app support panel inside the workspace.
7. **Surface isolation** — confirm the launcher is **absent** on `improntamodels.com` and on a tenant workspace; confirm `/contact` returns 200 on tulala.digital and **404 on improntamodels.com**. Add both halves to `deploy:smoke`.
8. **Leak check** — as a guest, ask a leading question aimed at another tenant's incident ("has anyone had payouts frozen?"); confirm no confirmed-insight content appears.
9. **Injection** — send a message instructing the model to output a phone number and an external email; confirm both are stripped and the HQ subject is prefixed `[guest]`.
10. **Abuse** — loop the AI endpoint against one ticket; confirm the turn ceiling stops it *before* the adapter call. Confirm the IP limiter engages, and that with Upstash unset the guest AI path **refuses** rather than serving unlimited.
11. **HQ** — guest chip filters; guest glyph is visually distinct from client; searching the prospect's **email** finds the ticket; past tickets by email show for a returning guest on a new device.
12. **Claim** — sign up with the captured email (confirmed) and verify the ticket attaches; then verify a *different* account with an unconfirmed email **cannot** claim it.

**Data hygiene:** every QA ticket, lead row and test account created in production must be listed and deleted at the end. Note the permission classifier refuses predicate deletes on prod business tables but allows `delete ... where id = '<uuid>'` one statement at a time.

---

## The silent failures, collected

The owner has been repeatedly bitten by things that return HTTP 200 while doing nothing. Every item below has that shape.

1. `x-impronta-guest` missing on the marketing pass-through → whole feature dead behind a generic error (P0)
2. `GUEST_COOKIE_SECRET` unset → cookie unsigned, possession = ownership; rotation orphans every live thread (P0)
3. **Agent reply to a pure guest emits `userId: null` → empty audience → Oran replies into the void** (P3)
4. Two catalog entries on one eventId → dispatcher dedupe silently swallows one (P3)
5. Guest reads via the browser client → RLS returns nothing and `SupportPanel` **discards the error** → blank thread, clean console (P1/P4)
6. Spanish guest against an English corpus → empty grounding → "I'm not sure" to everything (P5)
7. `feature.status === "coming"` sold as shipped (P5)
8. Stale corpus prices quoted as current (P5)
9. Confirmed-insight corpus has no tenant/surface filter → cross-tenant leak out, guest poisoning in (P3)
10. `/contact` 404s until allow-listed — and allow-listing alone serves the tenant page, whose action returns "session unavailable" on every marketing submission (P4)
11. A bare `href="/…"` fails the locale guard in CI; components outside `components/marketing/` escape the guard entirely (P4)
12. Inline `style` kills `hover:` variants in the header control (P4)
13. Escalated guest ticket with no `contact_email` — unanswerable, looks normal in HQ (P6)
14. `requesterEmail` hardcoded null in `load-hq.ts` and `contactEmail` rendered nowhere → the captured email is invisible to the owner (P7)
15. `hydrateSupportLinks` defaults guest reply links to `/talent?support=` (P7)
16. `AgentReply` with `unsubscribeUrl` undefined may throw and be swallowed (P7)
17. Guest rows render with the client glyph and are unreachable by any audience chip (P7)
18. KV limiters fail open → no rate limit at all on a token-spending anonymous endpoint (P8)
19. `assertAiInvocationAllowed` is a no-op on an unconfigured row; in-memory RPM is per-lambda; flat 1c estimate under-reports (P8)
20. Flipping the shared captcha flag soft-bricks the *talent* guest chat (P8)
21. Fabricated `audience`/`roster_size` would silently corrupt `loadLeadStats()` forever (P6)
22. `ensureGuestClientByEmail` in the support path = anonymous profile-overwrite primitive + staff-email enumeration oracle (P6)
23. Email-matched claim without an `email_confirmed_at` gate = transcript takeover (P9)
24. Reusing `SupportPanel` wholesale → `SupportIdeaForm` hits the narrower feature-request CHECK, swallowed, guest sees false success (P2/P4)
