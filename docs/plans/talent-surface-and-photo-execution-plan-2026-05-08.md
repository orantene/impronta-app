# Talent Surface + Profile Photo — Execution Plan

**Status:** Source of truth for the Talent surface launch readiness + profile photo system + Talent ↔ Workspace hybrid integration.

**Created:** 2026-05-08

**Related binding memories:**
- `project_workspace_talent_hybrid.md` — UI architecture for hybrid users
- `project_talent_subscriptions.md` — Basic / Pro / Portfolio tiers
- `project_agency_exclusivity_model.md` — workspace plan tiers (Free / Studio / Agency / Network)
- `feedback_admin_edit_ux.md` — every async state must be visible
- `feedback_pre_launch_shipping.md` — ship straight to prod

---

## Audit verdict: launch is blocked by fake state + fake buttons

Two foundation findings:

1. **The hybrid toggle is faked at the root.** `alsoTalent` is hardcoded `useState(true)` in `_state.tsx:7215`. Every user sees the toggle regardless of whether they actually have both surfaces.
2. **Talent data is never loaded for hybrid admins.** Workspace `admin/layout.tsx:146` pre-fetches workspace bridge data only. When a hybrid admin flips to Talent mode, they see `MOCK_CONVERSATIONS` until hard refresh.

Plus ~60 toast-only fake buttons across the talent surface — premium tier band, photo upload drawer, trial-start, today/calendar decision CTAs, personal-page Publish.

---

## The three-state model (binding)

### State A — Pure Talent (no workspace role)
- Top nav only (Today / Inbox / Calendar / Reach / Settings)
- No mode toggle
- Workspace deep links → "Workspace not available" screen with [Start a free workspace] CTA → provisions Free-plan tenant → user becomes hybrid

### State B — Pure Workspace owner (no talent profile)
- Left sidebar only
- No mode toggle
- "Create your talent page" CTA in account dropdown + Settings → Profile → provisions Basic talent profile → user becomes hybrid

### State C — Hybrid (current QA admin status)
- Both surfaces, toggle in top-right
- Default mode: Talent (per binding memory: "personal life is default")
- Inboxes scoped per mode (talent inbox = personal; admin inbox = agency-scoped per role)
- Cross-mode unread counts shown on the inactive pill

---

## Profile photo system — three-layer model

| Layer | Aspect | Master size | Where shown |
|---|---|---|---|
| Avatar | 1:1 | 1200×1200 | Roster cards, inbox rows, mode toggle, comments, public page |
| Hero | 4:5 portrait | 1600×2000 | Public talent page top, pitch cards, share-to-social |
| Gallery | Free 4:5 → 16:9 | 2000px long edge | Public page portfolio grid, lightbox, pitch attachment |

**Cropper:** `react-easy-crop` (3kb, React 19 compatible). Avatar locked 1:1; hero locked 4:5; gallery flexible.

**Storage:** existing `media_assets` table. Add `hero` to `variant_kind` enum.

**Flow:** Photo block at top of talent edit drawer → opens `<MediaGalleryDrawer>` → grid of all uploads → per-photo actions [Set as avatar] [Set as hero] [Add to portfolio] [Delete] → click to full-size lightbox → [Crop for avatar/hero] opens `<PhotoCropperDialog>` with locked aspect.

**Required UX:** every async action shows in-flight + resolved + persistent error states per `feedback_admin_edit_ux.md`. No toast-only confirmations.

---

## Strip-vs-Build principle (binding decision)

For every fake CTA on the talent surface, classify:

- **BUILD** — wire to real server action. Use for: photo upload, profile field edits, inquiry decisions (accept/decline), settings prefs, agency relationship actions.
- **STRIP** — remove until the underlying feature ships. Use for: premium tier features (Template / Embeds / Press / Media Kit / Custom Domain), trial start, anything billing-dependent. Replace with single upsell card "Coming soon — Tulala Pro / Portfolio".
- **DEFER** — keep visible but mark "Beta" with text-only confirmation, no toast lie. Use for: Reach exposure preset, conceptual things where v1 plumbing isn't critical.

**Default rule: when in doubt, strip.** A missing feature is easier to forgive than a lying button.

---

## Phased execution plan

### Phase 0 — Wire the foundations (MUST ship first)
1. Replace `alsoTalent` hardcoded `useState(true)` with real value derived from bridge data.
2. Pre-fetch `talentSelfProfile` + `talentInquiries` in workspace admin layout when user has a talent profile.
3. Default mode for hybrid users → Talent.
4. Add `talent.profile.edit_self` capability + role mapping.

### Phase 1 — Photo system
1. Add `hero` to `media_assets.variant_kind` enum.
2. Build `<MediaGalleryDrawer>` (grid + multi-upload + per-photo actions).
3. Build `<PhotoCropperDialog>` using `react-easy-crop`.
4. Replace fake `TalentPhotoEditDrawer` with real flow.
5. Three-slot photo block at top of `TalentProfileShellDrawer`.
6. Replicate same block on standalone admin `/roster/[id]` form.
7. Visible in-flight / resolved / persistent-error states everywhere.

### Phase 1.5 — Strip the fake premium band
1. Remove `TalentTierCompareDrawer` "Start trial" CTA. Replace with marketing card "Pro & Portfolio launching soon — join waitlist".
2. Hide premium tier band cards (Template / Embeds / Press / Media Kit / Custom Domain) from `MyProfilePage` for Basic talent.
3. Remove "Publish" button from `TalentPersonalPageDrawer`.
4. Audit all other `useSaveAndClose()` toast-only calls; wire or strip.

### Phase 2 — Self-edit parity + inquiry actions
1. Audit field gap between admin `TalentEditForm` and shared `TalentProfileShellDrawer`.
2. Wire missing fields with real server actions, gated by `talent.profile.edit_self`.
3. Wire Today/Calendar/Inbox decision CTAs (accept offer, decline hold, confirm call sheet, reschedule).
4. Real save for settings: notifications, privacy, payouts, verification, contact prefs.
5. Real agency relationship actions: leave, request representation, set primary.

### Phase 3 — Pure Talent state
1. Replace 404 in admin layout for talent-only users with "Workspace not available" screen.
2. Build `<StartFreeWorkspaceDialog>` — name + slug + location + [Create].
3. Server action `provisionFreeWorkspaceFromTalent(userId)`.

### Phase 4 — Pure Workspace state
1. Add "Create your talent page" CTA in account dropdown + Settings → Profile.
2. Build `<CreateMyTalentProfileDialog>` — derives display name + slug.
3. Server action `provisionTalentProfileSelf(userId, tenantId)`.

### Phase 5 — Hybrid polish
1. Promote toggle persistence from URL → user preference (new `user_prefs.preferred_surface`).
2. Cross-mode unread counts wired to real bridge counts.
3. First-run tooltip on the toggle.
4. Inbox scoping QA (talent inbox = personal only, admin inbox = agency-scoped per role).

### Phase 6 — Empty states + visual consistency
1. Empty states for every list on talent surface.
2. Avatar consistency pass — same source rendered the same way everywhere.
3. `feedback_admin_aesthetics.md` pass — no gold/rust accents, no opaque labels, no dead space.

### Phase 7 — Launch QA
1. Local QA per `feedback_dev_workflow.md` — three test accounts: pure talent, pure workspace, hybrid.
2. Walk every CTA. Confirm zero toast-only lies.
3. Promote to prod (per `feedback_pre_launch_shipping.md` — straight to prod).

---

## Open decisions resolved

1. **Hero shape:** lock to portrait 4:5. Future Portfolio-tier upgrade can unlock 16:9 landscape for performers (musicians, bands).
2. **Cropper library:** `react-easy-crop` (3kb, React 19 compatible).
3. **Free-workspace provisioning:** one screen, auto-derive name/slug from talent display name, [Create] button.
4. **Premium provisioning gate:** strict server-enforced. For Basic talent, premium fields don't render — upsell card instead. Server action rejects writes if `subscription.tier !== required_tier`.

---

## Total estimate: ~10 days
