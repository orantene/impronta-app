# Talent + Workspace + Client Connections — Autonomous Execution Plan

**Status:** in execution. Workspace, talent, and client foundations are now started; first one-click provider is YouTube.
**Date:** 2026-06-03
**Scope:** one shared connection product spine with three ownership lanes:

- **Workspace tenant connections:** agency/site services owned by `tenant_id`.
- **Talent connections:** social, media, trust, and calendar connections owned by `talent_profile_id`.
- **Client connections:** social and professional trust signals owned by `user_id`, with tenant visibility through existing client trust relationships.

This plan is designed for non-stop agent execution. Do not pause for product review between routine steps. Pause only for credentials, legal/compliance copy, destructive data changes, or provider App Review / external dashboard blockers.

---

## 0. Operating Rules For This Lane

1. **Start from trunk truth.** Work from `stable-work`, not `main`; verify cwd, branch, dirty files, and current migrations before editing.
2. **Do not overwrite dirty user work.** If relevant files are dirty, either work in a clean worktree from `stable-work` or explicitly diff and layer changes without reverting existing edits.
3. **One system, three owners.** Workspace, talent, and client integrations share catalog/resolver/UI patterns, but they do not share one DB table because tenant services are `tenant_id` owned, talent social/calendar connections are `talent_profile_id` owned, and client trust signals are `user_id` owned.
4. **Privacy-first consent.** Every OAuth/manual connection states what Tulala reads, what Tulala stores, what can be shown publicly, and what can be shared with agencies/coordinators.
5. **No fake badges.** A verified badge only appears from a real stored connection/verifier result. Placeholder copy is allowed only in disabled/coming-soon states.
6. **Manual fallback is a product feature.** If OAuth or App Review is blocked, talent can still paste verified links/embeds and choose what displays.
7. **Trust is separate from subscription.** Pro/Max can unlock richer layouts and auto-sync, but badges must never imply "pay to be trustworthy."
8. **Public data is selected, not sprayed.** Do not auto-publish every connected item. Default is connected-but-private, then the user chooses badges, selected items, and page placement.
9. **Client social proof is a trust signal first.** Client connections should make inquiries feel safer to talent/coordinators. They should not create a public marketing profile by default.

---

## 1. Product Shape

### Admin / Workspace

Primary home: `/{tenantSlug}/admin/settings/integrations`

Purpose:

- Site/runtime services: Maps, GA4, pixels, GTM, Search Console, captcha, email domain.
- Workspace social verification: YouTube can connect with Google OAuth, store verified channel metadata, and sync the public site `social_youtube` identity field.
- Link-through cards for existing Stripe Connect, AI provider, custom domain flows.
- Tenant-owned service credentials and public IDs.

This extends `web/docs/tenant-integrations-settings-2026-06-03.md`; do not mix talent social OAuth into the tenant table.

### Talent

Primary home: `/talent/settings` card named **Connections & verification**.

Secondary entry points:

- `/talent/profile` / profile drawer **Trust & verification** section.
- `/talent/site` / My pages **Connected content** panel.
- `/talent/calendar` **Calendar sync** card.

One drawer/component can be reused from all entry points:

- **Connect drawer:** connect/disconnect, provider status, scopes, consent copy.
- **Settings drawer:** per-provider toggles and display rules.
- **Content picker:** selected posts/videos/tracks/playlists/boards for public display.

### Client

Primary home: `/{tenantSlug}/client/settings` inside the existing **Trust level** section.

Secondary entry points:

- Client account menu / settings **Trust & verification** card.
- Inquiry/booking trust explanations where the client sees what will be shared.
- Admin/client detail read-only summary for staff reviewing inquiry quality.
- Talent-facing inquiry cards, limited to a trusted-client badge and selected account labels only.

One component can be reused from all client entry points:

- **Trust connections panel:** connect/disconnect, provider status, consent copy, and per-provider visibility toggles.
- **Share explanation popup:** what Tulala reads, what agencies/talent can see, and how to turn it off.
- **Proof summary:** verified account status for staff/talent, without exposing tokens or private social content.

---

## 2. Consent And User Controls

Every talent provider has these controls where applicable:

| Control | Default | Meaning |
|---|---:|---|
| Connect account | off | OAuth/manual connection exists and can refresh metadata. |
| Show verified badge | off | Public profile can show connected-account proof. |
| Share with agencies | on for status only | Admin/coordinator can see connection health, not private content. |
| Show on public profile | off | Standard `/t/<profileCode>` can show selected profile card/link. |
| Use in My pages | off | Personal site can use selected content blocks. |
| Auto-refresh selected content | off | Pro/Max only; refreshes cached metadata/items. |
| Use for booking availability | off | Calendar only; reads busy/free state for booking logic. |
| Create booking events | off | Calendar only; writes holds/confirmed booking events. |

Consent popup copy must answer:

- What we read.
- What we store.
- What we never expose.
- What the talent can turn off later.
- Which surfaces can use it: profile badge, My pages, admin coordinator, booking calendar.

Every client provider has these controls where applicable:

| Control | Default | Meaning |
|---|---:|---|
| Connect account | off | OAuth/manual connection exists and can refresh metadata. |
| Use for trust verification | off | OAuth-verified ownership can count as a client trust signal. Manual links stay unverified. |
| Share with agencies | on for status only | Tenant staff can see connection health and account label for clients they already manage. |
| Share with talent on inquiries | on for status only | Talent can see a trusted-client social proof badge/account label, not private content. |
| Show on public profile | off | Reserved for future client/company profile surfaces; default is private. |
| Auto-refresh account proof | off | Refreshes account metadata when OAuth is available. |

Client consent popup copy must answer:

- What we read from the social/professional account.
- Whether it can affect trust verification.
- What agencies can see.
- What talent can see on an inquiry or booking request.
- What stays private and can be disconnected later.

---

## 3. Data Model

### Workspace Tables

Use the already-approved design in `tenant-integrations-settings-2026-06-03.md`:

- `tenant_integrations`
- `tenant_integration_secrets`

### Talent Tables

Add dedicated tables:

```sql
create table public.talent_integrations (
  id uuid primary key default gen_random_uuid(),
  talent_profile_id uuid not null references public.talent_profiles(id) on delete cascade,
  provider text not null,
  provider_account_id text,
  display_name text,
  handle text,
  profile_url text,
  connection_method text not null default 'manual'
    check (connection_method in ('manual','oauth')),
  status text not null default 'not_configured'
    check (status in ('not_configured','connected','expired','revoked','error','disabled','review_needed')),
  scopes text[] not null default '{}',
  public_badge_enabled boolean not null default false,
  agency_visible boolean not null default true,
  public_profile_enabled boolean not null default false,
  personal_site_enabled boolean not null default false,
  auto_refresh_enabled boolean not null default false,
  calendar_availability_enabled boolean not null default false,
  calendar_write_enabled boolean not null default false,
  settings jsonb not null default '{}'::jsonb,
  metadata_cache jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  last_error text,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (talent_profile_id, provider, provider_account_id)
);

create table public.talent_integration_secrets (
  id uuid primary key default gen_random_uuid(),
  talent_integration_id uuid not null references public.talent_integrations(id) on delete cascade,
  secret_field text not null,
  ciphertext text not null,
  last4 text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (talent_integration_id, secret_field)
);

create table public.talent_integration_items (
  id uuid primary key default gen_random_uuid(),
  talent_integration_id uuid not null references public.talent_integrations(id) on delete cascade,
  talent_profile_id uuid not null references public.talent_profiles(id) on delete cascade,
  provider text not null,
  provider_item_id text not null,
  item_type text not null,
  title text,
  caption text,
  thumbnail_url text,
  embed_url text,
  source_url text not null,
  published_at timestamptz,
  is_featured boolean not null default false,
  is_visible boolean not null default false,
  sort_order integer not null default 0,
  metrics_cache jsonb not null default '{}'::jsonb,
  metadata_cache jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (talent_integration_id, provider_item_id)
);
```

RLS:

- Talent owner can select/insert/update own `talent_integrations`.
- Tenant staff can select talent connection status for rostered talent when `agency_visible = true`; no secret access.
- Public/anon can never select integration tables directly.
- Secrets are service-role only, encrypted with the existing credential vault.

Trust badges:

- On successful verified provider connection, create/update `talent_profile_trust_badges` with `badge_kind = 'social_account'` or `media_authentic`.
- Calendar sync is not a public trust badge by default; it is admin/booking confidence unless product later chooses a public availability badge.
- Badge scope:
  - `scope = 'platform'` for platform-verified account ownership.
  - `scope = 'agency'` only when an agency manually verifies/approves the connection for its own roster.

### Client Tables

Add dedicated tables for client-owned proof:

```sql
create table public.client_integrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider_key text not null,
  provider_account_id text,
  provider_account_label text,
  connection_method text not null default 'manual'
    check (connection_method in ('manual','oauth')),
  status text not null default 'not_connected'
    check (status in ('not_connected','pending','connected','needs_reauth','error','disabled')),
  scopes text[] not null default '{}'::text[],
  consent_version text not null default 'client-connections-v1',
  trust_signal_enabled boolean not null default false,
  agency_visible boolean not null default true,
  talent_visible boolean not null default true,
  public_profile_enabled boolean not null default false,
  auto_refresh_enabled boolean not null default false,
  settings_json jsonb not null default '{}'::jsonb,
  metadata_cache jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  last_verified_at timestamptz,
  last_error text,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider_key)
);

create table public.client_integration_secrets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider_key text not null,
  secret_field text not null,
  ciphertext text not null,
  last4 text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider_key, secret_field)
);
```

RLS:

- Client owner can select/insert/update own `client_integrations`.
- Tenant staff can select client connection status only when `agency_visible = true` and an existing `client_trust_state` row links that `user_id` to a tenant they staff.
- Talent-facing reads should come from inquiry/booking loaders, not direct anon/public access to integration tables.
- Public/anon can never select integration tables directly.
- Secrets are service-role only, encrypted with the existing credential vault.

Trust signals:

- Manual links can be stored and shared, but they are `manual_unverified`.
- OAuth/API verification can mark `metadata_cache.verification_status = 'oauth_verified'`.
- Only verified provider ownership may set or strengthen client trust signals; it should feed the existing `client_trust_state` evaluator per tenant.
- Social verification should complement Stripe/payment verification, not replace funded Silver/Gold logic.

---

## 4. Provider Catalog

### Phase 1 Providers

| Provider | Connection | First value | Public default |
|---|---|---|---|
| Google Calendar | OAuth | Availability conflict detection | private |
| Manual social/media links | Manual | Immediate showcase fallback | selected links only |
| YouTube | OAuth or manual channel URL | Video proof | selected videos/playlist |
| Spotify | Manual artist/playlist first, OAuth later | Music identity | selected player |
| SoundCloud | Manual URL / oEmbed first | Audio demo | selected player |

### Phase 2 Providers

| Provider | Connection | First value | Risk |
|---|---|---|---|
| Instagram | OAuth after Meta review | Creator/Business media + profile proof | App Review, professional-account requirement |
| TikTok | OAuth Display API | Creator profile + own videos | Display API scope/review |
| Vimeo | OAuth/manual | Premium showreel | lower urgency |
| Facebook Pages | OAuth | business proof/photos/events | App Review |
| Pinterest | OAuth | boards/pins for visual talent | approval/business account |

### Later / Optional

| Provider | Reason |
|---|---|
| LinkedIn | trust link first; API approval/restriction heavy |
| Twitch | niche for streamers/DJs/hosts |
| X | optional; API economics and lower booking value |

---

## 5. Execution Phases

### Phase A — Trunk + Plan Alignment

1. Verify `stable-work` and decide whether to use this checkout or a clean worktree.
2. Keep the existing tenant integration doc as the workspace lane.
3. Add this plan as the talent/workspace connection umbrella.
4. Identify dirty files that overlap with Talent Settings, My pages, profile shell, and trust drawers.

Acceptance:

- Exact branch/cwd reported.
- No user dirty work overwritten.
- Plan doc committed only from `stable-work` when ready.

### Phase B — Workspace Integration Foundation

1. Implement `tenant_integrations` + `tenant_integration_secrets`.
2. Add `web/src/lib/integrations/catalog.ts`, `repository.ts`, `resolve.ts`.
3. Start with `google_maps` only, then analytics IDs.
4. Add Admin Settings → Integrations route and hub cards.
5. Add workspace YouTube as the first OAuth social integration.
6. Sync connected workspace YouTube profile URL into the canonical site identity social field, with disconnect/manual fallback clearing only the matching integration-owned value.

Acceptance:

- Maps can resolve platform default or tenant custom value.
- Workspace YouTube can connect through Google OAuth and store encrypted tokens in `tenant_integration_secrets`.
- Verified workspace YouTube can appear on the public site through existing header/footer identity reads.
- Secrets never reach the client.
- `npm run typecheck && npm run lint && npm run ci`.
- `npm run test:tenant-isolation`.

### Phase C — Talent Integration Foundation

1. Add talent integration tables and RLS.
2. Add `web/src/lib/talent-integrations/catalog.ts`, `repository.ts`, `consent.ts`, `badges.ts`.
3. Add loaders/actions for:
   - list connections
   - connect manual provider
   - update toggles
   - disconnect/revoke
   - feature/unfeature items
4. Add unit/security tests near the repository/actions.

Acceptance:

- Talent owner can manage own connection rows.
- Tenant staff can only read rostered connection summaries.
- No anon read.
- Service-role-only secret read.
- Badge sync creates no fake badge.

### Phase C2 — Client Trust Connection Foundation

1. Add client integration tables and RLS.
2. Add `web/src/lib/client-integrations/catalog.ts`, `repository.ts`, and `actions.ts`.
3. Add loaders/actions for:
   - list client trust connections
   - connect manual provider
   - update trust/visibility toggles
   - disconnect/revoke
4. Add client settings entry point under **Trust level**.
5. Keep staff/talent views read-only and derived from tenant trust or inquiry context.

Acceptance:

- Client can manage own connection rows.
- Tenant staff can only read client connection summaries for tenants that already have a `client_trust_state` relationship.
- Talent-facing use shows a trust proof summary, not private social content.
- Manual links do not upgrade trust by themselves.
- Secret rows are inaccessible outside service role.

### Phase D — Talent UI Entry Points

1. Add Talent Settings card: **Connections & verification**.
2. Reuse entry from profile Trust & verification drawer.
3. Add My pages **Connected content** panel.
4. Add provider settings drawer with consent popup and per-provider toggles.
5. Add admin roster/profile read-only connection summary.

Acceptance:

- Settings, Trust, and My pages open the same provider management experience.
- Talent can choose whether connected media appears on profile or personal site.
- Admin can see only connection status/health unless talent shared more.
- UI uses existing shell tokens and drawer patterns.

### Phase E — Manual Fallback + Page Display

1. Convert current manual social links/embedded media into the new connection summary where possible.
2. Support manual YouTube, Vimeo, Spotify, SoundCloud, Instagram, TikTok URLs as `manual` connections/items.
3. Write selected embeds into existing `talent_sites` snapshots or profile `embedded_media` only through approved actions.
4. Keep public render allowlists intact.

Acceptance:

- A talent can add a manual YouTube/Spotify/SoundCloud item.
- Talent can switch "Show on my page" on/off.
- Public page renders only selected safe embeds.
- No unrelated page-builder rewrite.

### Phase F — Google Calendar

1. Add Google OAuth flow for Calendar scopes.
2. Store refresh token encrypted.
3. Add calendar list picker and selected-calendar settings.
4. Sync free/busy into booking availability logic.
5. Optional write mode: create Tulala holds/confirmed booking events.
6. Add webhook/push sync only after polling path is stable.

Acceptance:

- Private event titles/descriptions never display to clients/admin by default.
- Booking conflict checks use busy/free windows.
- Talent can disconnect and stop future sync.
- Existing `talent_bookings`, `talent_holds`, and `talent_availability_blocks` remain the app calendar truth.

### Phase G — YouTube + Spotify + SoundCloud

1. YouTube: channel connect/list, selected videos/playlists.
2. Spotify: artist/playlist/track picker or manual URL first.
3. SoundCloud: oEmbed/manual track or playlist first.
4. Cache selected item metadata in `talent_integration_items`.

Acceptance:

- Selected media appears on My pages.
- Talent can remove items without disconnecting provider.
- Page render is stable when provider metadata is stale or missing.

### Phase H — Instagram + TikTok

1. Add provider applications and test users.
2. Add consent-copy screens for professional-account requirements.
3. Build OAuth callback + token storage.
4. Pull account profile and own media only.
5. App Review package includes screen recordings of:
   - connect
   - select media
   - show/hide public badge
   - disconnect

Acceptance:

- No hashtag scraping.
- No full social inbox.
- No auto-publish.
- Personal accounts handled with manual link fallback.

### Phase I — Trust + Coordinator Value

1. Wire verified connection badges into existing trust badge loaders.
2. Add coordinator/roster "proof health" cards:
   - connected social proof
   - connected client trust proof
   - recent media selected
   - calendar synced recently
   - stale profile warning
3. Add media-kit source hooks after selected media is stable.

Acceptance:

- Badge labels reflect stored verified state.
- Admin view distinguishes "connected" from "publicly shown".
- Trust copy never implies paid trust.

---

## 6. Default Provider Settings

### Google Calendar

Read:

- calendar list
- free/busy blocks
- event start/end only for selected calendars

Store:

- selected calendar IDs
- busy windows/cache
- sync health

Never show:

- private event titles
- descriptions
- guests
- locations unless explicitly created by Tulala

### Instagram

Read:

- professional account profile
- own media metadata
- optional insights only after review

Store:

- handle, profile URL, avatar, selected media cache

Public display:

- badge, selected posts/reels only

### TikTok

Read:

- creator profile
- own public video metadata

Store:

- handle, avatar, profile URL, selected video cache

Public display:

- badge, selected videos only

### YouTube / Vimeo

Read:

- channel/profile
- selected videos/playlists/showcases

Public display:

- selected videos/playlists/showreel

### Spotify / SoundCloud

Read:

- selected artist/track/playlist metadata

Public display:

- selected player, tracks, playlists

---

## 7. QA Gates

Default gate per repo contract:

```bash
npm run typecheck && npm run lint
```

Run full CI for all phases touching migrations, RLS, server actions, tenant scope, auth/OAuth, or i18n:

```bash
npm run ci
```

Run tenant isolation before push for tenant/RLS/admin scope work:

```bash
npm run test:tenant-isolation
```

Browser QA must verify:

- Client can open social verification from Settings / Trust level.
- Client can connect a manual profile link and keep trust usage off.
- Client can toggle agency/talent visibility separately.
- Talent can open Connections from Settings.
- Talent can open provider settings from Trust/Profile editing.
- Talent can show/hide selected content on My pages.
- Public page reflects selected content only.
- Admin can see connection health without private token/content leakage.
- Talent inquiry view can see only client-approved trust proof.
- Disconnect removes sync and public badge/item display.

DB QA must verify:

- RLS for owner, tenant staff, anon.
- Secret rows inaccessible outside service role.
- Badge sync is idempotent.
- Calendar privacy rules hold.

---

## 8. Stop Conditions

Only stop and ask for human input when:

- A provider dashboard credential/client secret is required.
- A provider App Review step requires owner account action.
- A legal/privacy text decision is needed beyond the standard consent template.
- A migration would delete or rewrite existing production data.
- Current branch/worktree state makes safe implementation impossible.

Otherwise, continue in phase order and make conservative product decisions consistent with this plan.
