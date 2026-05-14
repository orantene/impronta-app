# Inquiry funnel — product audit + foundation spec (2026-05-13)

Status: **BINDING — read before any work on the inquiry-creation surface.**
Owner direction: this is the FIRST step in the inquiry→booking flow. It is
the foundation of the business. The current dashboard form is a stripped-
down v0; the rest of the platform has the engine ready. This doc captures
what the platform already supports, what's missing, and the multi-tenant
design we're committing to before resuming QA.

---

## 1 · Why this doc

The QA marathon caught a 5-question gap in the inquiry-create surface:

1. The dashboard "+ New inquiry" form is a single-talent dropdown — it
   does not let a client pick favorites from a cart.
2. The form discards the saved-talent context — clients build up favorites
   on the agency/hub site but can't carry them into an inquiry.
3. The form is the same on every tenant — no plan-tier shaping, no
   hub-vs-agency context, no public-storefront origin attribution.
4. Guest support exists on `/directory` (saved-talent + submitGuestInquiry)
   but is invisible to a client who lands on a workspace's `/inquiries/new`
   page.
5. There's no audit trail of WHERE the inquiry came from beyond the
   `source_channel` enum — no "this client favorited X, Y, Z on the
   tenant site three days ago, then submitted an inquiry for those
   exact talents from the cart at this URL."

Before fixing the form, we have to decide the model. This doc is that.

---

## 2 · What's actually built (inventory)

### Inquiry-create surfaces — five paths, three of them bypass the engine

| # | Path | Server action | File | Goes through `submitInquiry` engine? | Source attribution |
|---|---|---|---|---|---|
| A | Client dashboard `/new` | `createClientWorkspaceInquiryAction` | `(workspace)/[tenantSlug]/client/inquiries/new/actions.ts` | ✅ yes | ✅ full |
| B | Public directory (logged-in client) | `submitClientInquiry` | `(public)/directory/actions.ts` | ✅ yes | ✅ full |
| C | Public directory (guest) | `submitGuestInquiry` | `(public)/directory/actions.ts` | ❌ direct INSERT (lines 627-655) | ✅ full + `guest_session_id` |
| D | Pitch token landing | `convertPitchToInquiry` | `lib/pitch/pitch-engine.ts` | ✅ yes (via submitInquiry) | ⚠️ missing `origin_domain` + `source_workspace_id` |
| E | Admin manual inquiry sheet | `createAgencyInquiry` | `lib/server-actions/admin-inquiries.ts` | ❌ direct INSERT (lines 100-104) | ❌ no `source_channel` / `origin_domain` / `source_workspace_id` |

This is architectural debt. Three paths (C, E, partial D) do not flow
through the canonical engine — they bypass the rate-limiter, the
permission check, the requirement-group setup, and the standard event
emit. **Consolidating them onto one engine call is non-negotiable for
the foundation**.


### Engine — fully equipped, just under-used by the form

`web/src/lib/inquiry/inquiry-engine-submit.ts` accepts:

| Field | Status |
|---|---|
| `talent_profile_ids: string[]` | ✅ ARRAY — multi-talent supported |
| `client_user_id: string \| null` | ✅ null path = guest |
| `contact_name / contact_email / contact_phone` | ✅ required for guest |
| `company` | ✅ |
| `event_date / event_location / quantity` | ✅ |
| `event_type_id` | ✅ taxonomy reference |
| `message / raw_ai_query / interpreted_query` | ✅ free text + structured |
| `source_page` | ✅ exact path (e.g. `/t/sofia-herrera-tulum`) |
| `source_channel` | ✅ enum (directory_client, directory_guest, …) |
| `origin_domain` | ✅ hostname (improntamodels.com, tulala.digital) |
| `source_workspace_id` | ✅ tenant id of the storefront where it originated |
| `trust_level_at_submission` | ✅ snapshot of client trust at submit |
| `tenant_id` | ✅ required — who OWNS this inquiry |

On insert the engine also:
- Creates `inquiry_requirement_groups` row (default talent group)
- Creates `inquiry_participants` rows for the client + each talent + coordinator (auto-assigned)
- Upserts `agency_client_relationships` (client ↔ agency)
- Emits `INQUIRY_SUBMITTED` engine event
- Snapshots coordinator assignment

### Public guest path — fully wired

- `web/src/app/(public)/directory/cart/inquiry-form.tsx` — guest + client variants
- `submitGuestInquiry` in directory/actions.ts — accepts `talent_ids` (CSV array), guest session key, full form
- `guest_add_saved_talent` / `guest_remove_saved_talent` RPCs — `saved_talent` table keyed by either `client_user_id` OR a guest session key
- `merge-guest-favorites.tsx` + `client-guest-merge.ts` — when a guest registers, their saved talent + pending inquiries merge into the new client account by email/phone match

### Client dashboard path — the broken half

- `/[tenantSlug]/client/inquiries/new` — single-talent dropdown only
- Doesn't read `saved_talent` for the logged-in client
- Doesn't honor `?talent=` query param multi-value (only single `selectedTalentId`)
- No "send this inquiry to these N talents" cart UX
- `source_channel: "directory_client"` is hard-coded even though this isn't the directory

### What is NOT built (matches user's concerns)

- "Cart" (selected talent list) inside the workspace dashboard
- Multi-talent picker that mirrors the directory cart UX
- Cross-surface continuity (client browses Impronta site → adds 3 favorites → switches to dashboard → cart should be there)
- Plan-tier shaping of the form (free workspace = simple; agency = full brief; hub = which tenant is this for)
- Guest-to-client conversion ON the dashboard `/new` page (currently only on directory submit)

---

## 3 · Foundation principles (binding)

These bind every future inquiry-funnel decision.

### P1 — Inquiry is the universal "I want to book talent" object

Every inquiry, no matter the entry point or tenant tier, lands in the same
`inquiries` table with the same engine flow. There is no separate
"hub inquiry" / "free workspace inquiry" / "guest inquiry" — only one
table with rich source attribution.

### P2 — Source attribution is non-negotiable

Every inquiry MUST carry:
- `origin_domain` — exact hostname the form was submitted from
- `source_page` — exact path (`/`, `/t/<slug>`, `/cart`, `/client/inquiries/new`)
- `source_workspace_id` — the tenant whose storefront the inquiry was sourced from (may differ from owning `tenant_id` for hub flows)
- `source_channel` — one of the enum values, derived from the entry surface
- `trust_level_at_submission` — frozen trust signal at submit time
- `source_pitch_id` (when applicable) — if the inquiry came from a pitch link

This survives across guest → client conversion. When a guest registers
and their inquiry/favorites get merged, the original attribution stays
intact.

### P3 — Guest is first-class, not a fallback

A guest must be able to:
- Browse a tenant storefront (`improntamodels.com`, `tulala.digital`, hub)
- Save talents to favorites (anonymous `x-impronta-guest` session)
- Build an inquiry from the cart
- Submit it with just name + email + message — no account required
- Later sign up with that same email and find their inquiry already there

Email + phone are the canonical identity keys. The merge logic is already
shipped; the cart UX needs to feel guest-first, not "log in to submit."

### P4 — Tenant tier shapes the form, not the engine

The form fields the user sees depend on:
- **Free tenant** (talent's own site): name + email + message + "available date range" — minimal. Auto-routes to the talent themselves.
- **Studio** (small agency): + event_date + event_location + quantity + talent picker (their roster only)
- **Agency**: + budget hint + multi-talent cart + favorites + plan-tier-gated bells
- **Hub / Network**: + agency selector + cross-tenant roster + which agency this inquiry is FOR (and the answer is sometimes "let the hub recommend")

Plan tier is read from the SAME `tenant_id` the inquiry will be owned by.

### P5 — The cart is the UX primitive

Selecting a talent (favorite → "Add to inquiry") puts them in a per-session
cart. The cart is the inquiry-in-progress. From cart, the client opens a
modal/sheet to fill in the brief and submit. This UX already exists on
`/directory/cart/` for guests — the dashboard's `/new` page should be a
specialization of the same primitive, not a separate form.

### P6 — Continuity across login/signup

A guest's cart + favorites persist via the `x-impronta-guest` session key
cookie. On signup/login:
- Favorites merge into `saved_talent` (`client_user_id`-keyed)
- Pending guest inquiries get re-bound to `client_user_id`
- Cart contents (talents queued for an inquiry) transfer

Already shipped in `merge-guest-favorites.tsx` + `client-guest-merge.ts` —
the dashboard just needs to render the merged state correctly.

---

## 4 · The proposed inquiry funnel (target state)

### Entry points (all converge to the same engine call)

| # | Surface | Who | Auth | Tenant |
|---|---|---|---|---|
| A | Public talent page `/t/<slug>` on tenant storefront | Anyone | Guest or client | Storefront tenant |
| B | Tenant directory `/directory` (filtered) | Anyone | Guest or client | Storefront tenant |
| C | Cart `/directory/cart` | Anyone | Guest or client | Storefront tenant |
| D | Pitch link `/p/<token>` (admin-shared) | Anyone | Guest or client | Pitch's tenant |
| E | Client workspace dashboard `/<slug>/client/inquiries/new` | Client | Auth required | Same workspace |
| F | Hub site (tulala.digital, etc.) `/discover` cart | Anyone | Guest or client | Hub recommends an agency |
| G | Talent page direct CTA on a freelancer site (free tenant) | Anyone | Guest | Talent's own free tenant |

### Common payload (all entry points → `submitInquiry`)

```ts
{
  // Identity
  contact_name, contact_email, contact_phone (optional but rich for guest)
  client_user_id: string | null  // null for guest

  // Selection (always an array, even when length=1)
  talent_profile_ids: string[]   // from cart / from favorites / from pitch
  event_type_id: string | null

  // Brief
  event_date, event_location, quantity, message, company

  // Attribution (REQUIRED at insert)
  source_channel: enum
  source_page: string            // exact URL
  origin_domain: string          // exact hostname
  source_workspace_id: string    // the storefront tenant id
  source_pitch_id: string | null

  // Trust + ownership
  tenant_id: string              // who OWNS the inquiry (the agency)
  trust_level_at_submission: enum

  // AI / interpretation (optional)
  raw_ai_query, interpreted_query
}
```

### How the form decides which fields to show (plan-tier matrix)

```
free tenant     → contact + message + date hint                       (1 talent always)
studio tenant   → contact + brief block + 1 talent OR roster picker   (≤ small N)
agency tenant   → contact + brief block + cart + favorites + budget   (unlimited)
hub tenant      → contact + brief + cart + agency-selector            (cross-tenant)
```

The `tenant_id` on the URL or hostname determines tier. The fields
collapse/expand from that.

### Hub vs agency-owned inquiry — the routing decision

Hub tenants (tulala.digital) DO NOT OWN inquiries. When a guest submits
from the hub cart:
- The cart may contain talent from multiple agencies
- The form asks "do you want one agency to handle this, or let us
  recommend?"
- If the client picks an agency, that becomes `tenant_id`
- If "recommend", the hub's coordination team triages → assigns the
  inquiry to a tenant → from then on it's a normal agency-owned inquiry

`source_workspace_id` always equals the hub's tenant id in this case.

---

## 5 · What needs to be built (smallest-step migration)

### Step 0 (foundation): Converge all 5 paths onto `submitInquiry`

Before any UX work, paths C / D / E must call `submitInquiry` like A / B
do. This means:

- `submitGuestInquiry` — keep the guest-session resolution + `ensureGuestClientByEmail` provisioning, but pass the resolved `client_user_id` into `submitInquiry` instead of doing a direct insert.
- `convertPitchToInquiry` — add `origin_domain` + `source_workspace_id` to the submitInquiry call (from the pitch's tenant + the share URL host).
- `createAgencyInquiry` (admin manual) — rewrite to call `submitInquiry` with `source_channel: "admin_manual"` and pass the staff user as `actorUserId` while leaving `client_user_id` null (admin can submit on behalf of an unregistered client by name+email; the merge layer takes care of linking later).

After step 0 there is ONE insert path. Every gap-fix from step 1 onward
auto-applies to every entry point.



Each step is independently shippable and unlocks the next.

### Step 1 (small): Dashboard form pulls saved talent

- `/client/inquiries/new` page loads `saved_talent` for the logged-in client
- Form renders a "Your saved" section above the dropdown with chips for
  each saved talent
- Click chip → adds to a `talentIds` array (multi-talent state)
- Submit posts the full array to the engine (already supported)
- On success, clear those saved-talent rows (already done in directory action)

### Step 2 (small): Hoist the cart UX from directory into dashboard

- Extract `InquiryForm` from `(public)/directory/cart/inquiry-form.tsx`
  into `components/inquiry-cart/InquiryCartForm.tsx`
- Both `/directory/cart` and `/client/inquiries/new` consume the same
  component with different `pov` / `tenant context` props
- One canonical UX everywhere

### Step 3 (medium): Cart state persistence across surfaces

- Cart contents live in `saved_talent` (already keyed per client / guest)
- A boolean `in_cart` column distinguishes "saved for later" vs "queued
  for this inquiry" (currently the directory deletes saved rows on
  inquiry submit — that loses the distinction)
- New migration: `ALTER TABLE saved_talent ADD COLUMN in_cart boolean DEFAULT false`
- Cart UI = `saved_talent WHERE in_cart = true`

### Step 4 (medium): Plan-tier-aware form shaping

- `loadTenantPlanTier(tenantId)` → `"free" | "studio" | "agency" | "hub"`
- `<InquiryCartForm planTier={tier}>` toggles which sections render
- Free: minimal copy + auto-route to the talent
- Studio: + brief block
- Agency: + budget hint + AI assist
- Hub: + agency-selector + cross-roster picker

### Step 5 (large): Hub routing flow

- `source_channel = "hub_inquiry"` triggers the triage path
- Hub coordination team gets a queue of inbound inquiries to assign
- New table `hub_inquiry_assignments` keyed by inquiry_id
- Once assigned, the inquiry's `tenant_id` flips to the assigned agency
  and the engine resumes normal flow

### Step 6 (small): Free-tenant talent-page CTA

- Every public talent page has "Inquire" button
- Click → inline cart with just that talent pre-selected
- Guest-first form (name + email + message)
- Submits → talent's free tenant → talent themselves coordinate

---

## 6 · Add / remove talent + coordinator (mid-inquiry edits)

User explicitly called out: "all the add remove talent and add remove
coordinator." These are POST-submit edits the admin/coord uses. Tracking
where they live today and where the gaps are.

### Already shipped (engine)

- `addTalentToInquiry` in `inquiry-engine-roster.ts` — admin invites a new talent
- `removeTalentFromInquiry` — marks participant `status='removed'`
- `acceptTalentInvitation` — talent self-accepts (FIX shipped in `7984128cb` — RLS escalation + error check)
- `declineTalentInvitation` — talent declines
- `addCoordinatorToInquiry` / `removeCoordinatorFromInquiry` — admin manages coord seats
- `approveCoordinatorJoin` — coord-request-actions for talent requesting coord
- `swapTalentInRequirementGroup` — replace one talent slot with another

### Where they're wired in UI

- Admin shell `messages.tsx` Lineup tab → LineupDrawer → AddTalentPicker (admin can add/remove)
- TalentBookingTab "Open lineup drawer" → same
- Talent's Accept/Decline buttons in the action ribbon at the bottom of every inquiry shell
- Coord-request card in chat → approve/decline buttons

### Where the gaps are (QA TODO)

- The current QA marathon caught the talent-Accept RLS bug. The OTHER edge actions (add talent post-submit, remove, swap, coord add/remove) need the same RLS audit — all of them follow the same pattern (server-side action, user-session client, no UPDATE policy on `inquiry_participants`).
- The audit emit hooks land on most paths but not the swap path yet.
- No client-side feedback on remove/add — operator clicks the button, nothing changes visually until refresh.

---

## 7 · Memory needed (so future sessions don't re-learn this)

Saving as auto-memory:
- This audit doc is the binding spec for the inquiry funnel.
- The engine is built, the form is the lagging surface.
- Cart UX exists on `/directory/cart/` and should be hoisted into a shared component.
- Guest is first-class; the merge flow on registration is already shipped.
- Plan-tier shapes form, not engine.
- Hub flows don't own inquiries — they triage to agencies.

---

## 8 · Recommended execution order before resuming QA

1. **Discuss this doc with the user, get sign-off on §3 principles.**
2. **Step 1 of §5** (dashboard form pulls saved talent) — smallest unlock; lets a real user QA the favorites→inquiry flow end-to-end on Impronta.
3. **Step 2 of §5** (hoist the cart) — one component everywhere; deletes the dashboard form's duplicate.
4. Resume QA on add/remove talent/coordinator now that the form parity is correct.
5. Step 3 of §5 (cart persistence) — unlocks cross-surface continuity.
6. Step 4 of §5 (plan-tier shaping) — unlocks free / studio / agency / hub differentiation.

Hub routing (§5 step 5) is its own marathon and out of scope for the
inquiry funnel sprint.

---

## 9 · Open questions for product owner

1. **Cart capacity** — is there a max number of talent per inquiry? (engine accepts unlimited; UX should probably cap at ~10)
2. **Cart abandonment** — how long do guest saved/cart entries persist? (TTL on `saved_talent` for guest sessions?)
3. **Cross-tenant carts** — can a hub-site cart mix talent from agencies A + B in one inquiry, or does it force one agency per inquiry?
4. **Pitch links** — when a client clicks a pitch link, does the cart get auto-populated with the pitched talent? (probably yes)
5. **Budget hint** — should the inquiry form ask for a rough budget, or is that always agency-pulled-out-of-the-client later?
6. **AI assist on the brief** — InquiryDraftAssistant already exists in directory. Should it appear on the dashboard form too?
7. **"Available date range" vs single event date** — multi-date inquiries are real (talent on hold for multiple potential dates). Worth surfacing in the form?

These don't block sign-off on §3 principles but block step 4 execution.
