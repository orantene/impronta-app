# Pitch Feature — Execution Plan
**Created:** 2026-05-07
**Status:** Spec locked pending two open questions (see §3). Ready to start Phase A.
**Owner:** orantene

## 1. What it is (one paragraph)

A **Pitch** is an admin-curated talent suggestion sent to a client (existing or not-yet-registered) via a public, token-gated landing page. The admin selects talents from the roster, attaches a personal note, optional starting brief, and optional files (lookbook PDF, brief images, etc.), then shares a link — typically via WhatsApp. The client opens the link on a mobile-first landing page, can remove talents from the suggestion, and clicks one CTA to convert it into a real inquiry. After conversion, the pitch becomes a normal inquiry under the existing pipeline (coordination → offer → approvals → booking) — nothing about that pipeline changes. Pitch is **upstream of inquiry**, not parallel to it.

## 2. Why this exists

- **Today:** agencies pitch talent via WhatsApp screenshots, scattered Instagram links, and disconnected emails. The client can't act on it without a back-and-forth.
- **With this:** one link, mobile-first, branded, with a single CTA that drops the client into the platform's inquiry flow. Admin gets visibility (viewed / edited / converted), the client gets a frictionless decision moment, and the platform captures leads that previously evaporated in chat.
- **Strategic:** sellable feature for Studio / Agency plan tiers. A clean upsell over the free workspace.

## 3. Open questions (settle before Phase B)

1. **Client-facing landing page header.** Three options:
   - "{Agency} sent you a pitch" *(consistent terminology)*
   - "Talent suggestions from {Agency}" *(softer, more client-friendly)*
   - "Recommended talents" *(neutral)*
   - **Recommendation:** option 1.
2. **Plan-tier gating thresholds.** Free = no pitches, Agency = unlimited. Studio = ? per month. **Recommendation:** start with 10 pitches/month for Studio, revisit with usage data. Enforcement deferred to Phase G.

Everything else is locked.

## 4. Locked product rules

| Decision | Rule |
|---|---|
| Naming | Internal: `pitches` table, `pitch_*` server actions. UI: "Pitch" everywhere. List view: "Pitch history." Avoid "shortlist" entirely. |
| Trust policy | Pitch-converted inquiries **bypass** talent contact policy (admin vouches for client). Logged as `pitch_curated_override` in `inquiry_events`. |
| Talent notification | **No notification on pitch send.** First ping is at conversion (when the inquiry is created). |
| Talent eligibility | Only `workflow_status='approved'` AND `visibility='public'` talents may be added. Hidden / draft / archived talents excluded. |
| Conversion model | One pitch → one inquiry (1:1). Different roster = new pitch. |
| Starting offer | Pitch carries a soft **brief** (event date, location, rate hint). Not a binding offer. Real offers created post-conversion via the existing offer system. |
| Edit affordance for client | V1: client can only **remove** talents from the pitch. Add/swap requires going to discovery or messaging admin. |
| Edit sync | Client edits flush to the pitch token in real-time so admin sees the diff before conversion. |
| Re-pitches | New pitch with `parent_pitch_id` reference. No in-place revision. |

## 5. Architecture audit — gaps & improvements found

These were uncovered in audit; all are folded into the plan below.

| # | Gap / improvement | Resolution |
|---|---|---|
| 1 | Drafts not in original spec | Add `draft` status. Compose, save, refine, then send. |
| 2 | Re-pitch lineage | `parent_pitch_id` column. Show "Pitch v2 (revised from v1)" in admin history. |
| 3 | `declined` status missing | Client can explicitly decline ("not interested"). Distinct from expired/cancelled. |
| 4 | Files / attachments | Pitch-level (lookbook, brief PDF) + per-talent (model card). Signed URLs that expire with pitch. |
| 5 | Talent state changes mid-pitch | Defensive render: removed talent shows "no longer available" card; pitch stays valid for remaining talents. |
| 6 | Token revocation | DB-status check on every load — JWT validity is necessary but not sufficient. Cancelled/expired = "this pitch is no longer active." |
| 7 | Idempotent conversion | Server-side lock on convert action; double-clicks return same inquiry. |
| 8 | View tracking | `first_viewed_at`, `last_viewed_at`, view count. No IP / device tracking. |
| 9 | Channel attribution | `share_channel` enum on send: `whatsapp | email | copy_link`. |
| 10 | Mobile-first | Primary delivery is WhatsApp on phone. Landing page mobile-first, desktop graceful. |
| 11 | OG preview image | `opengraph-image.tsx` route (mirrors `/t/[profileCode]/opengraph-image.tsx`). Branded preview when link is pasted. |
| 12 | Tenant branding | Agency logo + brand colors on landing. Reuse the brand kit wired in commit 61088467. |
| 13 | i18n | EN + ES from day one (per blueprint). WhatsApp template localized. |
| 14 | Watermarking | Public preview images use watermarked variants only (existing platform rule). |
| 15 | Rate limit | Soft cap: 30 pitches/hour/tenant. Anti-abuse, not a paid limit. |
| 16 | Empty-state ergonomics | If 0 talents remain after client edits, the "Open inquiry" CTA disables with hint "add a talent or message {Agency}". |
| 17 | Sender identity on landing | Show which admin sent it ("Curated by {Admin name}, {Agency}"). |
| 18 | Internal admin notes | Optional `internal_notes` field on pitch — never rendered publicly. |
| 19 | Conversion lineage | Once converted, pitch detail surfaces a "View resulting inquiry" link. Inquiry detail surfaces "Originated from Pitch #N." |
| 20 | Expiry UX | Expired pitches show a soft "This pitch has expired, contact {Agency}" state, not 404. |

## 6. Data model

### 6.1 New tables

**`pitches`**
| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `tenant_id` | uuid | FK, RLS |
| `created_by_user_id` | uuid | admin who composed |
| `parent_pitch_id` | uuid? | for re-pitches |
| `share_token_id` | uuid | random; what's encoded in JWT |
| `status` | enum | `draft | sent | viewed | edited | converted | declined | cancelled | expired` |
| `recipient_user_id` | uuid? | if known client |
| `recipient_contact` | jsonb | `{ name, email?, phone?, company? }` for guests |
| `share_channel` | enum? | `whatsapp | email | copy_link` (set at send) |
| `personal_note` | text? | rich text, shown above grid |
| `brief` | jsonb? | `{ event_date?, event_location?, rate_hint?, event_type_id? }` |
| `expires_at` | timestamptz? | null = no expiry |
| `internal_notes` | text? | admin-only |
| `first_viewed_at` | timestamptz? | |
| `last_viewed_at` | timestamptz? | |
| `view_count` | int | default 0 |
| `converted_inquiry_id` | uuid? | FK once converted |
| `converted_at` | timestamptz? | |
| `declined_at` | timestamptz? | |
| `cancelled_at` | timestamptz? | |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

**`pitch_talents`** (ordered, per-talent metadata)
| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `pitch_id` | uuid | FK |
| `talent_profile_id` | uuid | FK |
| `position` | int | order in grid |
| `admin_note` | text? | shown under card publicly |
| `removed_by_client_at` | timestamptz? | tracks client edits |
| `created_at` | timestamptz | |

**`pitch_attachments`**
| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `pitch_id` | uuid | FK |
| `talent_profile_id` | uuid? | null = pitch-level; non-null = scoped to one talent's card |
| `media_asset_id` | uuid | FK to existing media_assets |
| `position` | int | display order |
| `kind` | enum | `image | pdf | other` |
| `created_at` | timestamptz | |

**`pitch_events`** (for observability — mirrors `inquiry_events` pattern)
| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `pitch_id` | uuid | FK |
| `actor_user_id` | uuid? | null for guest viewer |
| `event_type` | text | `created | sent | viewed | talent_removed | declined | converted | cancelled | expired` |
| `payload` | jsonb? | event-specific data |
| `created_at` | timestamptz | |

### 6.2 Schema additions to existing tables

- **`inquiry_source_channel` enum**: add value `pitch`.
- **`inquiries.source_pitch_id` (uuid, nullable, FK to pitches.id)**: lineage from inquiry back to pitch.

### 6.3 RLS

- Admin staff of a tenant can SELECT/INSERT/UPDATE pitches in that tenant.
- Public landing reads use **service-role client + JWT-claim filter** (same pattern as [share/[token]/page.tsx](web/src/app/share/[token]/page.tsx)). Never use anon-key reads.

## 7. Admin controls (compose drawer + history view)

### 7.1 Compose flow
Triggered from the roster bulk-action toolbar in [_talent.tsx:10182](web/src/app/prototypes/admin-shell/_talent.tsx:10182), via a new "Send as pitch" item in the action menu. Pre-fills the talent list with the current selection.

**Drawer fields (top to bottom):**
1. **Recipient** — autocomplete against existing clients OR free-text contact (name + email/phone) for new leads
2. **Personal note** (rich text, 0–500 chars)
3. **Talent grid** — selected talents with drag handles, per-talent admin note input, "remove" affordance
4. **Files** — drag-drop area; pitch-level OR drop on a talent card for per-talent attachment
5. **Starting brief** (collapsed by default) — event date, location, rate hint, event type
6. **Expiry** — none / 7d / 14d / 30d / custom date
7. **Internal notes** (admin-only, never rendered publicly)
8. **Save as draft** | **Send pitch** buttons

After "Send pitch": modal with the share URL, a copy button, and three branded send buttons:
- **WhatsApp** — `https://wa.me/{phone?}?text={encoded localized template}`
- **Email** — `mailto:{email?}?subject=...&body=...`
- **Copy link**

The chosen channel writes `share_channel` to the row.

### 7.2 Pitch history view
New admin route: `/{tenantSlug}/admin/pitches`
- List of pitches with: recipient, talents preview, status chip, viewed timestamp, conversion status
- Filters: status, date range, recipient, sender (admin)
- Click → drawer with full pitch detail, including timeline of events from `pitch_events`
- "Cancel pitch" action (sets status=cancelled, immediately invalidates token)
- "View resulting inquiry" link if converted

## 8. Public landing UX

**Route:** `/share/pitch/[token]` (parallel to existing `/share/[token]` and `/share/talent/[slug]`)

**Mobile-first layout:**
1. **Header strip** — agency logo + brand color, "Curated by {Admin}, {Agency}", localized (EN/ES)
2. **Personal note card** — admin's note rendered prominently
3. **Brief chip strip** — if brief was provided: "📅 12 Jun · 📍 Milano · ~€2.5k pp" (low-key)
4. **Pitch-level files** — gallery of attachments below brief
5. **Talent grid** — cards with photo, name, key tags. Per-card admin note as quote strip. Per-talent files appear in card lightbox. "Remove from pitch" button per card (state syncs to backend).
6. **Sticky CTA bar** — "Open inquiry with these {N} talents" + "Decline" link (small)
7. **Footer** — agency contact info, expiry hint

**Edge states:**
- **Expired** → Soft "This pitch expired on {date}. [Contact {Agency}]"
- **Cancelled** → "This pitch is no longer active. [Contact {Agency}]"
- **Already converted** → "You've opened an inquiry from this pitch. [View inquiry]" (with sign-in if needed)
- **All talents removed** → CTA disables with hint "Add talent back or message {Agency}"
- **Talent removed by agency mid-pitch** → That card shows "no longer available" — pitch stays valid for the rest

**OG image:** `/share/pitch/[token]/opengraph-image.tsx` — renders agency brand + "{Admin} sent you a talent pitch" + N talent thumbnails.

**Convert CTA flow:**
- **If recipient has a client account & is signed in** → one-click convert
- **If recipient is a guest** → mini-form (name confirm, email, phone, optional message) → guest_session created → submitInquiry called → result page links to claim/sign-in

## 9. Client integration

### 9.1 Client home (`/client/today`)
Add a fourth bucket: **"Pitches from your agency"** — appears above existing buckets when the client has any non-converted pitches. Each card shows: admin name, talent thumbnails, "Review & open inquiry" CTA → opens the same `/share/pitch/[token]` page (now signed-in flow).

### 9.2 Client inquiry list
Existing `/client/inquiries` filter pill set gets a new filter: "From a pitch." Inquiries with `source_pitch_id` set surface a small "Originated from a pitch" chip in the row.

### 9.3 Inquiry workspace
Workspace header shows "Originated from Pitch — sent {date} by {Admin}" if `source_pitch_id` is set. Click → opens read-only pitch detail in a side sheet.

## 10. Security model

| Concern | Mitigation |
|---|---|
| Token forgery | JWT signed with `verifyShareJwt` pattern from [@/lib/site-admin/share-link/jwt](web/src/lib/site-admin/share-link/jwt). Reuse verbatim. |
| Tenant data leakage | Token claims include `tid` (tenant_id) + `pitch_id`; server-side query is triple-filtered (tenant_id, pitch_id, status≠'cancelled'). |
| Token revocation | DB status check on every load, not just JWT validity. |
| Talent privacy | Only `published` + `public` talents allowed. Hidden talents excluded at compose time and re-checked at landing render. |
| File access | Signed URLs scoped to pitch token expiry. Watermarked variants only for images. |
| Trust bypass abuse | Logged in `inquiry_events` as `pitch_curated_override`. Visible to super-admin. |
| Rate limiting | 30 pitches / hour / tenant (soft block, returns friendly error). |
| Token enumeration | UUIDv4 share token IDs in JWT, never sequential. |

## 11. Observability

Captured in `pitch_events`:
- `created` (admin saved as draft)
- `sent` (admin sent — includes `share_channel`)
- `viewed` (first view + each subsequent view; bumps `view_count`, `first_viewed_at`, `last_viewed_at`)
- `talent_removed` (client removed a talent)
- `declined` (client clicked decline)
- `converted` (client opened inquiry)
- `cancelled` (admin cancelled)
- `expired` (system, on first read after `expires_at`)

Admin-side aggregate metric: **pitch → inquiry conversion rate** per tenant. Surfaced in pitch history view header.

## 12. Plan-tier gating (prep for billing phase)

Per [project_workspace_talent_hybrid.md](file:///Users/oranpersonal/.claude/projects/-Users-oranpersonal-Desktop-impronta-app/memory/project_workspace_talent_hybrid.md) and [project_agency_exclusivity_model.md](file:///Users/oranpersonal/.claude/projects/-Users-oranpersonal-Desktop-impronta-app/memory/project_agency_exclusivity_model.md):

| Plan | Pitch availability |
|---|---|
| Free | No access. Compose drawer hidden, history shows upsell card. |
| Studio | 10 pitches / month (proposed; settle in §3). |
| Agency | Unlimited. |
| Network | Unlimited + multi-tenant pitch templates (V2). |

Phase G implements the gate. Until then, all tenants get unlimited (no enforcement). Schema is forward-compatible.

## 13. Execution phases

### Phase A — Bulk toolbar fix (ship independently) — ~1 day

- [ ] Replace prototype `BulkActionBar.onAction` toast in [_talent.tsx:10182](web/src/app/prototypes/admin-shell/_talent.tsx:10182) with real handlers
- [ ] **Archive** → `bulkSetWorkflowStatus(tenantSlug, talentIds, 'hidden')` from [bulk-actions.ts:26](web/src/app/(workspace)/[tenantSlug]/admin/roster/bulk-actions.ts:26)
- [ ] **Publish** → `bulkSetWorkflowStatus(tenantSlug, talentIds, 'published')`
- [ ] Replace **Message** button with a `…` (more) menu containing: "Archive", "Publish", "Send as pitch" (Send as pitch is greyed-out with "coming soon" until Phase C lands)
- [ ] Toast confirms count + result
- [ ] Selection clears on success
- [ ] Manual QA on localhost (per dev workflow rule)

**Definition of done:** the floating toolbar from the screenshot does what its labels say.

### Phase B — Pitch backend — ~2 days

- [ ] Migration: `pitches`, `pitch_talents`, `pitch_attachments`, `pitch_events` tables
- [ ] Migration: `inquiry_source_channel` enum gains `pitch`; `inquiries.source_pitch_id` column
- [ ] RLS policies for all new tables
- [ ] Server actions in `web/src/lib/pitch/`:
  - `createPitchDraft(input)`
  - `updatePitchDraft(id, input)`
  - `sendPitch(id, channel)` — mints token, sets status=sent, returns share URL + WhatsApp/email deep link
  - `cancelPitch(id)`
  - `recordPitchView(token)` — public, idempotent within session
  - `removeTalentFromPitch(token, talentProfileId)` — public, syncs client edits
  - `declinePitch(token)` — public
  - `convertPitchToInquiry(token, contactInfo?)` — calls `submitInquiry()` with `source_channel='pitch'`, idempotent
- [ ] Token mint/verify wraps existing JWT helpers from [@/lib/site-admin/share-link/jwt](web/src/lib/site-admin/share-link/jwt)
- [ ] Unit tests for engine actions (esp. idempotent convert, cancel during view, expiry)

**Definition of done:** backend supports the full lifecycle through automated tests; no UI yet.

### Phase C — Admin compose UX — ~3 days

- [ ] Compose drawer component (`PitchComposeDrawer`)
- [ ] Recipient autocomplete (existing clients) + guest contact form
- [ ] Talent grid with drag-reorder, per-talent admin note, remove affordance
- [ ] File upload (pitch-level + per-talent) — reuse media_assets pipeline
- [ ] Brief / expiry / internal notes panels
- [ ] Save as draft + Send pitch
- [ ] Post-send modal: copy link + WhatsApp/email deep links + channel tracking
- [ ] Wire from the bulk toolbar's "Send as pitch" menu item (un-grey)

**Definition of done:** admin can compose, save, send a pitch with files. Token is generated and copyable. Does not require landing page to work end-to-end.

### Phase D — Public landing — ~3 days

- [ ] Route `/share/pitch/[token]` with token verification + DB status check
- [ ] Mobile-first layout (header, note, brief, files, talent grid, sticky CTA, footer)
- [ ] Per-talent card with lightbox for attachments
- [ ] Client edit (remove talent) — calls `removeTalentFromPitch` action
- [ ] Decline action
- [ ] Convert flow: signed-in (one click) + guest (mini-form)
- [ ] Edge states: expired, cancelled, already-converted, all-removed, talent-no-longer-available
- [ ] OG image route
- [ ] EN + ES strings
- [ ] Tenant brand kit applied (logo, colors)

**Definition of done:** WhatsApp a pitch link to a real phone, open it, remove a talent, click "Open inquiry," verify inquiry appears in admin inbox with `source_channel='pitch'` and lineage chip.

### Phase E — Pitch history (admin) — ~1.5 days

- [ ] Route `/{tenantSlug}/admin/pitches`
- [ ] List view with status chips, filters, search
- [ ] Detail drawer with timeline (`pitch_events`)
- [ ] Cancel action
- [ ] Re-pitch ("send revised version" — opens compose with `parent_pitch_id` pre-set)
- [ ] Conversion lineage link

**Definition of done:** admin can review every pitch sent, see view/edit/conversion timeline, cancel or re-pitch.

### Phase F — Client surfaces — ~1 day

- [ ] Add "Pitches from your agency" bucket on `/client/today`
- [ ] Add "From a pitch" filter pill on `/client/inquiries`
- [ ] Add lineage chip on inquiry rows when `source_pitch_id` is set
- [ ] Add "Originated from Pitch" header on inquiry workspace + read-only pitch side sheet

**Definition of done:** clients see pitches in their dashboard and can trace a converted inquiry back to the pitch.

### Phase G — Plan-tier gating + observability polish — deferred to billing phase

- [ ] Pitch counter per tenant per month
- [ ] Soft-block at limit with upsell card
- [ ] Free tenants: hide compose, show upsell-only history view
- [ ] Pitch → inquiry conversion-rate metric in admin

---

**Total estimate:** ~11.5 working days for A–F. Phase A ships standalone; B unblocks everything else. C and D can be built in parallel by different people if needed.

## 14. Test plan

### Unit (per server action)
- Create draft, update, send (verify token mint), cancel, expire (time-travel)
- Convert: 1× idempotent on duplicate calls, 1× with cancelled pitch (rejects), 1× with all talents removed (rejects), 1× via guest contact (creates guest_session), 1× via signed-in client
- Trust bypass: pitch convert lands inquiry even when talent's contact policy blocks the client tier; verify `pitch_curated_override` event written

### Integration / e2e (smoke)
- Compose pitch with 4 talents, 1 PDF, 1 image, personal note, expiry 14d → send via copy-link → open in incognito → remove 1 talent → click open inquiry → admin inbox shows inquiry with 3 talents and lineage chip
- WhatsApp deep-link opens correctly on mobile (manual)
- OG preview renders correctly when link pasted in WhatsApp + Slack + Telegram (manual)
- Tenant isolation: pitch token from tenant A cannot be opened on tenant B host
- Hidden talent excluded at compose time
- Talent set to hidden after pitch sent → card shows "no longer available"
- Cancelled pitch token → landing shows soft cancel state
- Expired pitch token → landing shows soft expiry state

### Multi-tenant
- Two tenants, each can only see and act on their own pitches
- Service-role read on landing is triple-filtered

## 15. Definition of done (whole feature)

- All Phase A–F checkboxes ticked
- All test-plan items pass on staging
- One real pitch sent end-to-end from production admin → real client phone via WhatsApp → converted into a real inquiry
- Pitch history view shows the timeline accurately
- No regressions in existing inquiry / booking flow (verified via `npm run validate:inquiry-participants`)
- Localhost-first dev workflow followed (per [feedback_dev_workflow.md](file:///Users/oranpersonal/.claude/projects/-Users-oranpersonal-Desktop-impronta-app/memory/feedback_dev_workflow.md))

## 16. Out of scope (V2+)

- Multi-recipient pitches (one URL → multiple named recipients)
- Pitch templates / "save as preset"
- Pitch analytics dashboard (open rate, conversion-rate-by-channel, time-to-convert)
- Pitch from a hub-distribution context (per [project_api_embeds_strategy.md](file:///Users/oranpersonal/.claude/projects/-Users-oranpersonal-Desktop-impronta-app/memory/project_api_embeds_strategy.md))
- Client can ADD talents to a pitch (V2 — opens browse-from-pitch flow)
- Pitch-level rate negotiation (use real offers post-conversion instead)
- AI-generated pitch suggestions ("based on this brief, send these 6 talents")

## 17. Charter / memory implications

- This doc functions as a **binding amendment** to the SaaS build charter ([project_saas_build_charter.md](file:///Users/oranpersonal/.claude/projects/-Users-oranpersonal-Desktop-impronta-app/memory/project_saas_build_charter.md)) under Phase 1.5 — agency operational tools.
- A short memory entry (`project_pitch_feature.md`) will point to this plan as the source of truth.
- Decision log entry to be added to [docs/decision-log.md](docs/decision-log.md) once Phase B begins.
