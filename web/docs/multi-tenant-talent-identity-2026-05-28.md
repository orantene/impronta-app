# Multi-tenant talent identity — design doc

**Status:** Phase 1 shipped (verified badge + locked-fields metadata). Phase 2
(faded talent-types in admin editor) is scoped, file:line ready, deferred.
Phase 3 (agency permission/consent model) is designed below — not built.

**Written:** 2026-05-28 — companion to the multi-tenant-talent-identity PR.

---

## The problem in plain terms

Imagine Moran signs up on `tulala.digital` directly. She lists herself as a
**Chef**, a **Model**, AND something niche — say **Travel Concierge**. She
owns her own profile, her own photos, her own social handles. She is
"Tulala-native."

Now Alejandra runs Impronta, a fashion-model agency. She finds Moran in
the cross-tenant Discover feed and wants to add her to her roster — for
the **modeling** jobs Impronta gets.

Two things have to be true for this to work:

1. Alejandra **must not** be able to edit Moran's personal profile.
   Moran owns the photos and the bio. Impronta is just a **booking agent**
   for this relationship, not Moran's owner. The relationship is
   **non-exclusive** — Moran might be on three other agencies' rosters too.

2. Impronta has **disabled** the "Travel Concierge" talent type in their
   tenant settings — they only do modeling + hosting jobs. So when
   Alejandra opens Moran's profile inside the Impronta admin, the
   "Travel Concierge" talent-type chip should be **faded** with a tooltip:
   *"Disabled in your workspace. Enable in Settings →"*.

The data model already supports both states. The product hadn't surfaced
them in the UI yet. This PR fixes (1) and lays groundwork for (2) + (3).

---

## Phase 1 — SHIPPED in this PR

### Backend: editor-data loader exposes 3 new flags

`web/src/lib/server-actions/admin-talent-profile-sections.ts` adds three
fields to the `ProfileEditorData` returned from
`getTalentProfileEditorData()`:

| Field | Source | Meaning |
|---|---|---|
| `tulala_native_identity` | `talent_profiles.user_id IS NOT NULL` | The talent owns a Tulala auth account. Drives the "verified" badge. |
| `roster_exclusivity_status` | `agency_talent_roster.exclusivity_status` (for the active tenant) | `'exclusive' | 'non_exclusive' | 'pending' | null`. |
| `personal_profile_locked` | `tulala_native_identity && exclusivity_status !== 'exclusive'` | TRUE when this agency manages a Tulala-native talent non-exclusively. Personal fields belong to the talent, not the agency. |

The talent-self loader (`talent/self-profile-editor-data.ts`) returns
`tulala_native_identity=true`, `personal_profile_locked=false`,
`exclusivity_status=null` by definition — the talent IS the owner.

### Frontend: verified banner in admin profile drawer

`TalentProfileShellDrawer.tsx`:
- Loads the three flags on data hydration and holds them in three
  `useState`s (lines ~503-512).
- Sets them from `edRes.data` after the editor-data resolves
  (lines ~636-643).
- Renders a banner above the body when `!isSelf && tulalaNativeIdentity`
  (lines ~2531-2576) showing:
  - A green check chip
  - **"Tulala-verified talent."** plus a contextual sentence
  - When `personal_profile_locked`: *"Personal profile is owned by the
    talent — you can manage roster relationship only."*
  - When exclusive (still verified, but agency CAN edit): *"Roster
    relationship: exclusive. Personal profile editable because the
    relationship is exclusive."*

### NOT in this PR — per-field read-only (deferred)

The natural follow-up is: when `personal_profile_locked=true`, mark the
individual personal-field inputs (`display_name`, `first_name`, `bio_en`,
`bio_es`, `instagram_handle`, etc.) as `disabled`. That requires threading
the prop down through:

- `IdentityEditor` (profile-identity-editor.tsx:185)
- `BiosEditor` (`disabled` prop add + thread to each locale textarea)
- `LanguagesEditor` (same)
- Social link inputs inside the Services / Identity tabs

Plus the **server-side guard** at every save-action endpoint — the UI lock
must be backed by a `personal_profile_locked` check in `saveTalentProfile`,
`saveTalentBio`, etc., so a malicious admin who DOMs around the disabled
flag can't write to a locked profile.

**Why deferred:** ~15 component changes + 5–8 server-action guards.
Estimated ~3 hours. Worth doing as a focused follow-up PR. The banner
alone communicates the intent — a real admin reading "you can manage
roster relationship only" will not try to edit personal fields.

---

## Phase 2 — Faded talent-type chips (scoped, ready, deferred)

### What it should do

In the admin profile drawer Services tab, render each talent-type chip
the talent has selected. For each type, check whether it's
**enabled at this tenant's `agency_taxonomy_settings`**:

- **Enabled** → render normally.
- **Disabled** → render with `opacity: 0.4` plus a small chip
  *"Disabled in your workspace · Enable in Settings →"* linking to
  `/<tenantSlug>/admin/settings#talent-types`.

### The file:line map (ready to execute)

| File | Lines | Action |
|---|---|---|
| `TalentProfileShellDrawer.tsx` | ~1469-1471 | Build `disabledTalentTypeIds: Set<string>` from the loaded taxonomy tree (`getEnabledTaxonomyTree`). Use the existing call site. |
| `TalentProfileShellDrawer.tsx` | ~2963-2971 | Pass `tenantDisabledTalentTypes={disabledTalentTypeIds}` to `<SkillSlotPanel>`. |
| `skill-slot-panel.tsx` | ~118 | Add optional `tenantDisabledTalentTypes?: Set<string>` prop. Thread to `<SkillCategoryCard>`. |
| `skill-row.tsx` | 26 + 162 | Same threading. In `SkillRow` body, check `tenantDisabledTalentTypes.has(skill.parent_id)`; if so, wrap the row in `<div style={{ opacity: 0.4 }} title="Disabled in your workspace — enable in Settings"`>` and append a "Enable in Settings →" inline link. |

### Why deferred

~4 small files, ~80 LOC, no behavior risk. But it's prop-drilling work
that's better done with one full focus pass than rushed at the end of a
larger session. Tracked as the next item in the multi-tenant epic.

---

## Phase 3 — Agency permission / consent prompt (design only)

### The product question

When Moran (Tulala-native) accepts an invite from Impronta to join their
roster, she should NOT have to re-register or re-enter her profile data.
But she SHOULD see a **clear consent prompt** explaining exactly what
Impronta will be able to do with her data and her bookings:

> **Impronta wants to add you to their roster.**
>
> If you accept:
>
> - ✅ Your existing profile, photos, and social handles will be visible
>   on their site (improntamodels.com).
> - ✅ Impronta can RECEIVE bookings + draft offers for you, scoped to
>   the talent types they support (Models, Hosts & Promo, …).
> - ❌ Impronta CANNOT edit your personal profile (name, bio, photos,
>   social handles).
> - ❌ Impronta CANNOT see your other agencies' bookings, financials,
>   or private notes.
> - 💼 Commission terms: 15% on bookings closed through Impronta. You
>   can decline this offer and stay independent.
> - 📅 You can leave Impronta's roster at any time. Any active offers
>   you've already accepted finish on the agreed terms.
>
> [ Accept · Non-exclusive ]   [ Accept · Exclusive (locks you to
> Impronta) ]   [ Decline ]

### Data model

Two new tables. Both scoped per tenant + per talent.

#### `roster_invitation`

| column | type | notes |
|---|---|---|
| `id` | uuid pk | |
| `tenant_id` | uuid | the inviting agency |
| `talent_profile_id` | uuid | the invited talent |
| `invited_by_user_id` | uuid | which admin sent the invite |
| `requested_permissions` | jsonb | array of granted permission scopes — see below |
| `requested_exclusivity` | text | `'exclusive' | 'non_exclusive'` |
| `commission_terms_data` | jsonb | proposed rate / shape (% / fixed / per-unit) |
| `requested_talent_types` | text[] | which of the talent's existing types this agency will represent her for |
| `status` | text | `'pending' | 'accepted' | 'declined' | 'expired' | 'withdrawn'` |
| `expires_at` | timestamptz | 14 days default |
| `decided_at` | timestamptz | when talent acted |
| `decision_note` | text | optional reason for decline |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

#### `roster_permission_grant`

| column | type | notes |
|---|---|---|
| `id` | uuid pk | |
| `tenant_id` | uuid | the agency |
| `talent_profile_id` | uuid | the talent |
| `granted_permissions` | jsonb | the OAuth-style scope list the talent ACTUALLY granted (may differ from `requested` if we add per-permission opt-out) |
| `exclusivity_status` | text | mirror of `agency_talent_roster.exclusivity_status` |
| `granted_at` | timestamptz | |
| `revoked_at` | timestamptz | nullable; set when talent leaves |

### Permission scopes (the "OAuth-like" list)

| Scope | Plain English | Default |
|---|---|---|
| `roster.list_publicly` | Show me on this agency's directory + public site | Required to be on roster |
| `bookings.receive` | Receive bookings + draft offers on my behalf | Required to be on roster |
| `profile.edit_personal` | Edit my name, bio, photos, social handles | OFF by default — only granted on `exclusive` |
| `profile.edit_field_values` | Edit my measurements, languages, skills | OFF by default — granted explicitly |
| `bookings.see_others` | See bookings I have with OTHER agencies | OFF by default — only granted on explicit consent |
| `financials.see_payouts` | See my Tulala-wide earnings | OFF by default — never granted via roster |
| `messages.thread_as_me` | Speak in client threads as me (DM-style) | OFF by default — granted only on `exclusive` |
| `media.upload_for_me` | Add photos to my profile | OFF by default — granted explicitly |
| `bookings.set_commission` | Set commission split per booking | Granted when on roster |
| `talent_types.represent` | Represent me for these specific talent types | Required — defaults to the intersection of (talent's types) ∩ (agency's enabled types) |

### UX flow

1. Agency admin invites talent (from Discover or by email).
2. Talent receives in-app notification + email: *"Impronta wants to add
   you to their roster"*.
3. Talent clicks → lands on `/talent/invitations/<id>` consent page.
4. Page renders the permission grid above, pre-checked per agency's
   request, with explanatory tooltips.
5. Talent can toggle individual scopes (some are required; toggling them
   off shows *"Required for roster membership — declining this scope is
   equivalent to declining the invitation."*).
6. Talent picks `Exclusive` vs `Non-exclusive` from a radio.
7. Talent clicks **Accept** → atomic transaction:
   - `roster_invitation.status = 'accepted'`
   - `agency_talent_roster` row created (or updated)
   - `roster_permission_grant` row created with the toggled scopes
   - `agency_talent_roster.exclusivity_status` set to talent's choice
8. Talent now appears on the agency's roster with the scoped permissions.

### Server-side enforcement

Every personal-data write path (the ones gated in Phase 1's banner) checks
`roster_permission_grant.granted_permissions` for the active tenant. No
grant → 403. Standardize via a `requireGrantedScope(tenantId, talentId,
scope)` helper called at the top of each affected server action.

### Revocation

Talent can revoke a permission at any time from
`/talent/agencies/<tenantSlug>/permissions`. Revocation:
- Sets `roster_permission_grant.revoked_at = now()`
- Re-renders the agency admin drawer with the appropriate locks
- Active bookings continue under the agreed commission terms (don't break
  open contracts), but no NEW bookings on revoked scopes

### Migration plan

| Step | Effort | When |
|---|---|---|
| Schema migration: two new tables + indexes | 1h | Phase 3 start |
| Build invite-creation surface in admin (under Roster → Add talent → "Invite existing Tulala talent") | 4h | Phase 3 W1 |
| Build consent page at `/talent/invitations/<id>` | 6h | Phase 3 W1 |
| Wire `requireGrantedScope` into 8 personal-data save actions | 3h | Phase 3 W2 |
| Build talent-side permission management at `/talent/agencies/<slug>/permissions` | 4h | Phase 3 W2 |
| Email templates for invitation, acceptance, revocation | 2h | Phase 3 W3 |
| Tests | 4h | Phase 3 W3 |
| **Total** | **~24h / 3 weeks part-time** | Phase 3 |

### Open questions

1. **Commission negotiation in the prompt** — should the talent be able to
   counter the proposed commission rate as part of the consent flow, or
   is the agency's proposal take-it-or-leave-it? Recommend: counter
   allowed; agency can re-propose; max 3 rounds.
2. **Talent-types intersection** — if Moran has *Chef* but Impronta has
   *Chefs & Culinary* disabled, do we show that as a required talent-type
   for the roster? Recommend: only INTERSECTION of talent's types and
   agency's enabled types are eligible; if no intersection, block the
   invite at the admin side with a clear "your agency doesn't support
   any of this talent's types" message.
3. **Exclusivity downgrade** — can talent flip from exclusive → non-
   exclusive without leaving the roster? Recommend: yes, with a 30-day
   notice period to give the agency time to renegotiate commission.
4. **Display preference** — when a talent is on multiple agencies'
   rosters, the public profile at `tulala.digital/t/<slug>` shows which
   agencies? Recommend: show all with `roster.list_publicly` granted +
   `status=active`; agency-specific subdomains show only that agency.

---

## TL;DR for the next session

- **Shipped:** verified banner + 3 new fields on editor-data response.
- **Tracked but deferred:** per-field read-only gates (15 components + 8
  server-actions, ~3h), faded talent-type chips (~80 LOC, ~2h).
- **Designed:** OAuth-style permission/consent flow with 2 new tables, 10
  scopes, ~24h implementation. Ready to start when product gives the green
  light on the open questions.
