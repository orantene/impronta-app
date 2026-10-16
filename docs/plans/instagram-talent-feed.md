# Instagram feed for talents (paid): audit and plan

TUL-562 · Sprint Instagram · written 2026-10-10 against `origin/main` `164577ab4`.

Goal: a talent on a paid plan connects Instagram once (from Settings or from the
page builder) and their recent posts render in a styled `social_feed` widget on
their own site. Later the widget ships inside theme templates, with a
placeholder until Instagram is connected.

Plans describe intent. Where this file and the code disagree, the code wins.

## 1. Test identity (read this first)

The sprint brief names "test talent TAL-93938 / jorg-beauty-qa". Those are two
different profiles:

| Profile | Site slug | Managing agency | Plan |
|---|---|---|---|
| TAL-93900 | `jorg-beauty-qa` | none (independent) | `talent_portfolio` |
| TAL-93938 | `book-jorgelina` | yes (`created_by_agency_id` set) | `talent_portfolio` |

`docs/plans/live-qa-runbook.md` names TAL-93938 as **the real Jorgelina**, and
agents must never touch it. This sprint tests on **TAL-93900 /
`jorg-beauty-qa`**, on the isolated stack with seeded data.

## 2. What exists today (verified)

**OAuth start.** `web/src/app/api/connections/oauth/start/route.ts` accepts
`owner=talent`. It guards with `requireTalentSelf`, signs a state with
`subjectId = talent_profiles.id`, and returns to `/talent/settings` by default.
Instagram requests only `instagram_business_basic`
(`web/src/lib/connection-oauth/providers.ts`).

**OAuth callback (Instagram / TikTok).**
`web/src/lib/connection-oauth/social-callback-handler.ts` is shared by both
vendors. It **refuses every owner except `workspace`** with
`connection_error=unsupported_owner`. Its persistence helper,
`connectWorkspaceSocialAccount` (`social-connect.ts`), writes only to the
tenant tables: `tenant_integrations` plus the tenant vault, through
`lib/integrations/repository.ts`.

**Talent-owned storage already exists.** `talent_integrations` (unique on
`talent_profile_id, provider_key`, with status `not_connected | pending |
connected | needs_reauth | error | disabled`) and `talent_integration_secrets`
(encrypted, unique on `talent_profile_id, provider_key, secret_field`). The
repository is `web/src/lib/talent-integrations/repository.ts`. The Google /
YouTube callback already stores talent connections this way
(`storeTalentYouTubeConnection` in
`web/src/app/api/connections/oauth/callback/google/route.ts`). The talent
catalog (`lib/talent-integrations/catalog.ts`) lists `instagram` with
`verify_account`, `profile_link` and `public_profile_badge`, but not
`personal_site_embed` or `media_import`.

**Talent Settings UI.** `components/talent/connections/TalentConnectionsDrawer.tsx`
can start OAuth only for `youtube` (`connectOAuth` early-returns for any other
key). Instagram is manual-link only there.

**Token refresh cron.** `app/api/cron/refresh-social-tokens/logic.ts` sweeps
`tenant_integrations` only. It has classified failures, backoff and a
needs-reconnect notification to workspace owners/admins.

**Feed cache + cron.** `lib/social-embed/feed-cache.ts` writes
`tenant_social_feed_items` (FK `tenant_id → agencies`, RLS staff-only, service
role reads for render). `sweepSocialFeeds` selects from `tenant_integrations`
only. Reads never call a vendor.

**Builder block.** `social_feed` (`lib/site-admin/builder-node/social-feed.tsx`,
`render.tsx`, `social-feed-source.ts`). `source: "connected"` reads
`dataSources.socialFeeds[provider]` and falls back to the block's authored
`items` when that list is empty. `collectSocialFeedProviders` only collects
`source === "connected"`; a `"mixed"` source never triggers a cache read.

**Paid gate.** The four gallery presets carry `requiresPaidPlan`
(`add-gallery/registry-catalog-elements.ts`). `paidPlanInsertBlockMessage`
(`add-gallery/paid-plan-gate.ts`) checks the **workspace builder plan**, and the
tenant publish preflight (`edit-mode/publish-preflight-action.ts`) enforces the
same rule server-side.

## 3. One talent connection, end to end (what actually happens)

1. Talent opens Settings → Connections. Instagram offers a manual link only;
   there is no OAuth button.
2. Starting the flow by hand (`/api/connections/oauth/start?owner=talent&provider=instagram`)
   passes the guard and reaches Meta.
3. Meta redirects to `/api/connections/oauth/callback/instagram`. The handler
   verifies the state, then stops at the owner check: **`unsupported_owner`**.
   Nothing is stored.
4. Even if a token were stored on `talent_integrations`, neither cron reads that
   table, so it would never refresh and never fill a cache.
5. Even if a cache existed, the talent site render does not read it:
   - **Independent talent** (TAL-93900, no agency): `render-max-site.tsx` →
     `loadPersonalMaxNativeSources`, which never loads `socialFeeds`. A
     connected block always shows its manual items.
   - **Agency-managed talent**: `loadBuilderNodeDataSources(blocks, agencyTenantId, …)`
     reads the **agency's** cache. A connected block on the talent's own site
     would show the agency's Instagram, not the talent's.
   - Builder canvas preview (`preview-my-content.server.ts`) has the same split.
6. In the talent builder, `TalentPageBuilderScreen` never passes
   `workspacePlan`, so it normalises to `free` and **every talent, paid or not,
   is refused the four feed presets** with "Upgrade in Settings, Plan & billing".

## 4. The gaps

1. Callback refuses talent owners. (Step 3)
2. No talent persistence path for Instagram tokens. (Step 3)
3. Token refresh and feed sweep ignore `talent_integrations`. (Step 3)
4. No talent-keyed feed cache, and the talent site render never reads one;
   agency-managed talents would show the agency's feed. (Step 3)
5. No Instagram OAuth entry point in talent Settings. (Step 2)
6. Talent builder gate is keyed on the workspace plan, so paid talents are
   refused. There is no inline connect in the inspector. (Step 4)
7. Visitors see the block's sample items when nothing is connected; there is no
   owner-only CTA and no theme-matched placeholder. (Steps 5–6)
8. Meta credentials (`INSTAGRAM_APP_ID` / `INSTAGRAM_APP_SECRET`) are **not**
   in the local env. A real OAuth round trip needs Oran. **NEEDS ORAN: Meta app
   credentials / test IG Business or Creator account.**

## 5. Data model change

**New table `talent_social_feed_items`**, a sibling of
`tenant_social_feed_items`, keyed by `talent_profile_id` (FK `talent_profiles`,
`ON DELETE CASCADE`), unique on `(talent_profile_id, provider, external_id)`,
with the same columns, read index and `hidden` moderation flag. RLS: the talent
owner may read and hide their own rows; no anon policy. Public render reads
through the service role exactly like the tenant cache.

Why a sibling and not a nullable `talent_profile_id` on the tenant table:
`tenant_id` is `NOT NULL` with an FK to `agencies` and is part of the upsert
conflict target. Loosening it would touch every existing writer, reader and
RLS policy on a live table. A sibling table is additive and cannot change
workspace behaviour.

**No change to `talent_integrations` / `talent_integration_secrets`.** Tokens go
to the secrets table (`access_token`). Handle, account id, account type,
`token_expires_at`, `feed_last_synced_at`, refresh-failure bookkeeping and
`needs_reconnect` go to `settings_json` / `metadata_cache`, which mirrors the
tenant `config_json` keys. Status uses the existing `connected | needs_reauth |
error` values.

Migration: write the file in Step 3 but **do not apply it**. **NEEDS GROK PM:
migration.** It must be applied to production before that PR merges.

## 6. Plan (one PR per step)

**Step 2: Settings connect card.** An Instagram card in talent Settings,
Spanish first, ES/EN localised. Free plan (`talent_basic`): upsell to the paid
plan. Paid: connect → connected (`@handle`, last sync, Sync now, Disconnect) →
error/expired (Reconnect). Reuses the existing start route with
`owner=talent&provider=instagram`. The card ships with Step 3's server actions,
or is dark-launched behind the same paid check until Step 3 lands.

**Step 3: Talent feed pipeline.** *(NEEDS GROK PM REVIEW: money/auth, auth tokens)*
- Callback: accept `owner=talent`. Re-check `requireTalentSelf` and that the
  state's `subjectId` equals the session's talent profile, then store through a
  new `connectTalentSocialAccount` (talent secrets + `talent_integrations`).
  The Business/Creator gate is unchanged.
- Token refresh + feed sweep: add a talent pass over
  `talent_integrations where provider_key='instagram'`, with the same windows,
  failure classification and backoff. The needs-reconnect notification goes to
  the talent's own user.
- Cache: `refreshTalentFeed` / `readCachedTalentFeedItems` against
  `talent_social_feed_items`.
- Render: talent sites resolve `socialFeeds` from the talent cache by
  `talentProfileId`, on both the independent and the agency-managed path, and
  in the builder canvas preview. Never the agency cache, never a vendor call.
- Disconnect: delete the tokens and the talent's cached rows.

**Step 4: Builder connect inline.** *(NEEDS GROK PM REVIEW: money/auth, plan gate)*
- Feed the talent builder a paid flag derived from the talent plan
  (`talent_basic` = free, everything else = paid). Fail closed, same as
  `isPaidBuilderPlan`. Free talents keep the existing refusal message, with an
  upsell link.
- Inspector: when a `social_feed` block is `source: "connected"` and the talent
  has no live connection, show "Conecta tu Instagram". It opens the start route
  in popup mode (`popup=1`, already supported) with a `returnTo` carrying the
  page slug and block id, so the builder reopens on the same block.

**Step 5: Widget design.** Theme tokens (radius, colours, fonts), a carousel or
reel indicator, the `@handle` header, a "Ver en Instagram" CTA, alt text from
captions, fixed aspect boxes so there is no layout shift, lazy media. Checked on
`jorg-beauty-qa`'s theme plus two other templates.

**Step 6: Placeholder.** When there is no connection or the cache is empty:
visitors get either a quiet theme-matched placeholder grid with no technical
copy, or no block at all (recommended: hide for visitors). The owner preview
shows a "Conectar Instagram" CTA. Visitors never see sample items or an empty
box.

**Step 7: Theme templates.** An optional Instagram section in templates that
already have a gallery or "Trabajo reciente" band. Off by default behind a
per-template flag, and uses the Step 6 placeholder until connected.

## 7. Testing

- Unit: callback owner branches, talent store helper, talent sweep passes,
  render resolution (independent, agency-managed, preview), and the talent paid
  flag.
- Isolated stack (fxlank) with TAL-93900: seed a fake connection plus fixture
  feed items, then go through Settings, the cache, inserting the block, the
  site showing posts, disconnect, and the placeholder. Screenshots at 1280 and
  390.
- A real Meta OAuth round trip waits on Oran's credentials and a test IG
  Business or Creator account.
