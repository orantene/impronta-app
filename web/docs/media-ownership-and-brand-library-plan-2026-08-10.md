# Media Ownership & Brand Library — Master Plan

**Date:** 2026-08-10 · **Status:** BINDING PLAN (phases 1+ pending owner sign-off; phase 0 shipped with this PR)
**Owner question this answers:** *"Alejandra paid a studio to shoot the fire dancer. The fire dancer claims her profile, leaves exclusivity, joins rivieramayawork.com and builds a Tulala Digital page. Who may use which photo, where — and how does the product enforce it?"*

---

## 1. Why now

This is not hypothetical. In production today:

- **87 of 159** rostered talents already sit on **more than one tenant** (mostly Impronta + the Tulala hub).
- **12 profiles are claimed** (`talent_profiles.user_id` set) and the claim funnel (#1012/#1019) is live on branded hosts.
- Every hub shows **the same face**: the thumbnail resolver (`web/src/app/(workspace)/[tenantSlug]/_data-bridge/talent-card-thumbs.ts`) ranks `media_assets` by `variant_kind` (card → hero → … ) keyed **only on `owner_talent_profile_id` — no tenant filter**. Discover, the agency roster, the hub directory and the talent's own dashboard all render identical imagery by design.
- Media has **no working ownership attribution**: of 1,894 live talent assets, `uploaded_by_user_id` is set on 6, `created_by` and `owner_tenant_id` on 0. We literally cannot answer "who uploaded this?" today.

So the moment the fire dancer joins a second hub, Alejandra's studio shoot follows her everywhere, and nothing in the product can express "these photos are Impronta's."

## 2. What already exists (build on it, don't invent)

The schema anticipated this fight. Most of the machinery exists **unused**:

| Piece | State today | Role in this plan |
|---|---|---|
| `media_assets.ownership_kind` (`talent\|agency\|platform`) + `owner_tenant_id` + check constraints | columns + constraints live, **0 agency rows** | The **owner key** |
| `media_assets.visible_on_master_profile` (default true) | column live, never toggled | Owner's grant to the talent's global surface |
| `media_assets.uploaded_by_user_id` / `created_by` | ~never populated | Provenance (who physically uploaded) |
| `agency_talent_media` (override / addition per tenant) | table + RLS live, 2 rows | **Per-hub curation** of a talent's photos |
| `agency_talent_overlays.cover_media_asset_id` + `portfolio_media_ids` | table live, 0 rows | **Per-hub face + gallery selection** |
| `talent_agency_permission_requests` (`requested_scopes`, approve subset) | table live, 0 rows | The **request/consent rail** (extend with media scopes) |
| `talent_agency_data_grants` (revocable per talent×tenant) | table live, 0 rows | Durable grant record |
| `media_folders.system_key` + `purpose='branding'` + `ownership_kind='agency'` writes | **shipped in this PR** (phase 0) | Proof that workspace-owned media works end to end |
| `attribution_note`, `watermark_override_json`, bake route | live | Watermarking released copies |

The one structural gap: **nothing new is needed at the "asset" layer.** What's missing is (a) writers stamping ownership, (b) a per-hub selection layer the renderers respect, (c) a grant object for cross-hub use, and (d) UX that makes all of it legible.

## 3. The model — three principles

### P1. Every asset has exactly one OWNER

`ownership_kind` + (`owner_tenant_id` | `owner_talent_profile_id`) is the single source of truth:

- **Talent uploads** (talent studio, claimed account) → `ownership_kind='talent'`.
- **Workspace uploads** (admin roster gallery, Drive import, staging, branding manager) → `ownership_kind='agency'`, `owner_tenant_id = tenant`. The subject stays `owner_talent_profile_id` (except brand imagery, which has no subject).
- **Platform assets** (starter kits, seeded demo imagery) → `'platform'`.

Ownership answers *"who controls where this may appear, and who can delete it."* It is **not** a legal copyright register — it models the working agreement, and `attribution_note` carries anything contractual ("© Studio Máro 2026, licensed to Impronta").

### P2. The two-key rule

> An asset may appear on surface S of hub H **only if** the **owner** allows H **and** the **subject** (the person in the photo) allows H.

Both keys default ON for the context that created the asset, so nothing breaks:

| | Owner key | Subject key |
|---|---|---|
| Agency uploads photo of rostered talent | Their own hub: **implicit** ✓. Other hubs: ✗ until released. Master profile: `visible_on_master_profile` (they already control this bit). | Implicit inside the managing hub (representation), **revocable per asset** ("hide this photo of me"). |
| Talent uploads own photo | Talent decides per hub: master profile always ✓; each hub gets it only when the talent selects/shares it there. | Trivially theirs. |

This single rule resolves **both** directions of the fire-dancer fight (§4).

### P3. Per-hub presentation is a SELECTION, not a copy

A hub profile's face + gallery = an ordered list of asset **pointers**, resolved per (tenant, talent):

```
resolveTalentMediaForHub(hubTenantId | 'master', talentProfileId):
  1. overlay.cover_media_asset_id / agency_talent_media rows for this hub (curation)
  2. else: global rank (card → hero → …) over assets PASSING the two-key rule for this hub
```

One resolver, used by: card thumbs (`talent-card-thumbs.ts`), profile pages, pitches, page-builder bindings, Discover. This mirrors the `is_publicly_listed` single-gate lesson (migration `20260803203521`): **one predicate, one place** — the 2026-08 incidents happened exactly where multiple readers re-derived visibility differently.

## 4. The fire dancer, resolved (all four variants)

**Setup:** Alejandra (Impronta, Agency plan) rosters the fire dancer, pays for a studio shoot, uploads 20 photos → `ownership_kind='agency'`, `owner_tenant_id=Impronta`, subject = fire dancer. Roster row `is_primary=true` (auto-exclusive on paid tiers).

**V1 — She claims her profile and ends exclusivity.**
Claim links `user_id` (consent moment; never touches `is_primary` — already shipped). Ending exclusivity flips the roster row; the Impronta membership survives as non-exclusive. Effects:
- Impronta's own site: **unchanged** — Impronta owns the 20 photos and its per-hub selection points at them. Alejandra's storefront never regresses.
- rivieramayawork.com rosters her: its selection resolver finds **zero grants** from Impronta → her profile there starts from **her own uploads** (or empty state prompting upload / release request). Alejandra's photos physically cannot appear there. **This is the default, with no admin action needed.**
- Tulala Digital master profile: agency-owned photos appear only while `visible_on_master_profile=true`. Alejandra can flip it off per asset ("agency site only") — the master page falls back to talent-owned media.

**V2 — She wants Impronta's best shot on her other hubs.**
Locked tile in her media library: *"Owned by Impronta · usable on Impronta only · Request release."* Request rides `talent_agency_permission_requests` with scope `media.release:<asset|all>` → Alejandra approves (optionally: watermark-baked copy via the existing bake route, expiry, specific hubs). Approval writes a **media grant**; revocation un-publishes on next resolve. Alejandra stays in control, and the ask/consent is auditable instead of a WhatsApp fight.

**V3 — Reverse veto: Alejandra would share, but the talent hates the logo-shirt photo.**
The subject key: on any photo of her, the talent can restrict scope to the owning hub ("only show this on Impronta") or request takedown. Enforcement: outside the owning hub the **subject grant is required and defaults OFF**, so the logo-shirt photo simply never travels — she doesn't need Alejandra's cooperation. Inside Impronta's hub, representation implies consent; a takedown request there is a human workflow (flag → agency resolves), not an automatic hide, because the agency curates its own site.

**V4 — Her Tulala Digital (master hub) page.**
The master profile is **talent-controlled** and may only select: her own assets + agency assets with `visible_on_master_profile=true` + released assets. A claimed talent with zero owned photos gets an onboarding prompt: upload your own or request releases — which is exactly the moment to upsell talent plans (Pro/Portfolio storage).

**Bonus — agency uploads for a talent (stays fully supported).**
Agencies keep uploading for their roster (this is most volume). Nothing changes in the flow; the rows just get stamped truthfully (`ownership_kind='agency'`, `uploaded_by_user_id`), which is what makes every later decision possible.

## 5. Data-model changes (small, mostly writers + one table)

**5a. Stamp ownership at every writer (no DDL).** Writers to fix (all currently omit ownership/uploader):
- `admin/media/actions.ts` — `actionUploadAndAssignMedia`, `actionRegisterUploadedAsset`, `actionBulkAssignStagedMedia` (rows built at :272-282), crop confirm, Drive import.
- `/api/talent/media/upload` + talent-self signed actions → `ownership_kind='talent'`.
- Review photos, offering media, reels/polaroids: same split by auth context (staff vs `requireTalentSelfAction`).

**5b. Backfill the 2,334 legacy rows.** Recommendation: **default everything to `ownership_kind='talent'`** (status quo semantics; least-anger principle: retroactively granting agencies ownership of photos without evidence would poison the claim funnel), then give workspaces a one-time **"mark as agency-owned"** bulk tool (per talent / per date-range / per shoot) that *notifies the talent* with a 14-day objection window (mirrors the exclusivity wind-down). Provenance hints we can surface in that tool: `talent_profiles.origin_workspace_id`, `created_by_agency_id`, unclaimed-at-upload-time. **[OWNER DECISION №1]**

**5c. One new table — `media_grants`** (phase 3; until then `visible_on_master_profile` + `agency_talent_media` carry the defaults):

```sql
create table public.media_grants (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references media_assets(id) on delete cascade,
  grant_kind text not null check (grant_kind in ('owner','subject')),
  scope text not null check (scope in ('tenant','master','all_hubs')),
  tenant_id uuid references agencies(id),         -- required when scope='tenant'
  granted_by uuid not null,                        -- profiles.id
  source_request_id uuid,                          -- talent_agency_permission_requests
  watermark_required boolean not null default false,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
```

Two-key check = `owner allows H` (owner's home hub implicit, else an unrevoked owner grant) AND `subject allows H` (subject's own asset implicit; managing-hub implicit; else an unrevoked subject grant). Package as **one SQL function + one TS resolver** so RLS, matview refreshers and app code share the predicate.

**5d. Storage note.** Paths already key off talent/tenant prefixes with RLS path-ownership checks; no bucket moves needed. Grants gate the *DB selection layer*, and public-bucket URLs are already world-readable (unchanged trade-off; watermark-bake remains the mitigation for leaked originals — and "downloads of originals" is **[OWNER DECISION №2]**, recommended: owner-only by default).

## 6. Surfaces & UX

**Workspace Media page** (exists; extended in phase 0 with the Brand & site lane):
- Lanes: All / Pending / **Brand & site** ✅ / By talent / Folders / *(phase 3)* **Shared by talent**.
- Ownership chips on tiles: "Uploaded by you", "Talent's own" (with subject-scope badge when restricted).
- The "mark as agency-owned" backfill tool (phase 1) lives here.

**Talent studio → Media** (talent-side, `/talent/*`):
- **My photos** — full control, per-hub visibility toggles, master-profile picker.
- **From your agencies** — one collection per rostering workspace: view + "usable on {Agency} only" locks + *Request release* + per-photo "Don't show this of me outside {Agency}" (subject veto).
- Master-profile gallery picker filters to usable assets and *explains* every locked tile (never a silent absence — the "I save and nothing changes" incident class).

**Roster drawer (agency side):** per-talent "Photos on this site" tab = the per-hub curation UI (`agency_talent_media` + overlay cover) with "use on master profile" toggles (`visible_on_master_profile`).

**Requests & notifications:** release requests + approvals + revocations ride the existing `user_notifications` + inbox rails; every grant/revoke lands in `media_asset_activity`.

## 7. Enforcement

- **Single resolver** `resolveTalentMediaForHub()` consumed by thumbs, profile SSR, pitches, PB bindings, Discover loader (`discover.ts` already funnels through `loadTalentCardThumbs` — one call-site swap).
- **RLS:** current `media_select` public arm stays (it gates on `is_publicly_listed` + approved); add the grant predicate to the *hub-scoped* read paths in phase 3. Service-role readers (Discover bridge) rely on the resolver — which is why there must be exactly one.
- **Cache/busting:** grants/curation writes bust `tagFor(tenant,'storefront')` and refresh demand/discover surfaces on their nightly crons; thumbs are resolved per request (no persistent cache).
- **Tests:** the projection-fence pattern (`listProjectedTokens`) applied to media: a static test asserting every media-rendering surface imports the resolver, so a new surface can't bypass the two-key rule silently.

## 8. Execution phases (each = 1-2 PR-sized slices, gates + live QA per house rules)

**Phase 0 — Brand library (SHIPPED with this PR).** Workspace-owned media proven end to end: `purpose='branding'` + `ownership_kind='agency'` rows, signed pipeline, Branding folder (`media_folders.system_key`), manager UI, favicon serving, token bridge. *This is the template for every later lane.*

**Phase 1 — Ownership truth (1 PR).** Stamp all writers (§5a); ownership chips on Media page; backfill default + agency claim tool with talent notification (§5b). Migration: none (columns exist). Risk: low — additive writes.

**Phase 2 — Per-hub faces (1-2 PRs).** Tenant-aware `resolveTalentMediaForHub` v1 (curation-aware, two-key not yet enforced beyond today's defaults); roster-drawer curation tab wiring `agency_talent_media` + `overlay.cover_media_asset_id`; swap the 5 `loadTalentCardThumbs` call-sites. QA: one talent on Impronta + hub + a QA workspace shows three different curated faces. Risk: medium (touches every card surface) — ship behind a flag defaulting to current behavior, flip after visual QA (the Card-Design cache lesson: verify with cold keys).

**Phase 3 — Two-key grants (2 PRs).** `media_grants` migration + SQL predicate + resolver enforcement; locked-tile UX in talent studio; release request/approve/revoke flows on the permission-request rail; master-profile picker filter. This is the fire-dancer milestone. Risk: the revocation path must un-publish everywhere — covered by the single resolver + tag busts; add an e2e that revokes and re-reads all five surfaces.

**Phase 4 — Polish & monetize (1 PR + product).** Watermark-on-release option (bake route), originals-download policy, `platform` ownership for starter kits, per-shoot "collections" sugar on folders, plan-tier hooks (talent storage quotas by Basic/Pro/Portfolio; agency release-with-watermark on Studio+).

**Standing rules for every phase:** one migration timestamp per agent; `db push` before merge; full `tsc` + lint; localhost QA on the impronta host with screenshots; merged-is-not-done (verify live + `deploy:smoke`).

## 9. Open decisions for you (each with my recommendation)

1. **Legacy backfill default** → talent-owned + agency claim tool with objection window (§5b). The alternative (agency-owned by provenance) is faster for Alejandra but risks claim-funnel trust.
2. **Original-file downloads** → owner-only by default; subjects get web-size; releases can include originals per grant.
3. **Does ending exclusivity auto-revoke anything?** → **No.** Grants are per-asset and persist; ending exclusivity only changes *defaults for future uploads*. Predictable, no surprise disappearances on either side.
4. **Hub kind:** can a hub (kind=hub) ever be an asset owner? → Yes technically (`owner_tenant_id`), but hubs should default to *never* auto-claiming ownership of roster uploads (they're distribution, not production). Matches the "hub is never the exclusive rep" stance.
5. **Pricing tie-in:** release-request volume + watermark-on-release as Studio+ features; talent media storage by talent plan. Worth a separate pricing pass before phase 4.

## 10. Appendix — grounding inventory (2026-08-10)

- 159 talent profiles · 253 live roster rows · 87 multi-tenant talents · 57 primary (exclusive) rows · 12 claimed · 2 hubs (tulala + 1) · 30 agencies.
- 2,334 talent media rows: 100% `ownership_kind='talent'`, `purpose='talent'`; uploader set on 6.
- `agency_talent_media`: 2 rows · `agency_talent_overlays`: 0 · `talent_agency_data_grants`: 0 · `talent_agency_permission_requests`: 0.
- Key code: thumbs resolver `_data-bridge/talent-card-thumbs.ts` (BUCKET + rank map, no tenant filter); Discover loader `_data-bridge/discover.ts` (matview + runtime photo resolve); media RLS `20260803203521_public_listing_single_gate.sql:246-274`; claim RPC `20260805232235` + `20260805234500`; exclusivity resolver `lib/agency/exclusivity-resolver.ts` (`EXCLUSIVE_PLAN_TIERS`); curation tables `20260601100600` + `agency_talent_media`.
- Phase 0 files (this PR): `lib/site-admin/server/brand-library.ts`, `lib/server-actions/admin-branding-media.ts`, `components/admin/media/branding-media-manager.tsx`, migration `20261112000000_branding_media_folder_system_key.sql`.
