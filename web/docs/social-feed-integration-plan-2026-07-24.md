# Social feed integrations — Instagram + TikTok (execution plan)

Date: 2026-07-24
Goal: a client connects Instagram and TikTok with one click in Settings → Integrations,
and a page-builder block shows their real, auto-updating feed.

---

## 1. What exists today (verified, not assumed)

| Thing | State |
|---|---|
| Instagram | **Does not exist.** No catalog entry, no block, nothing. |
| `tiktok_pixel` | Exists but is an **ads conversion tracker** — an invisible script. Shows no content. |
| `meta_pixel` | Same: Facebook/Instagram **ads tracking**, not a feed. Easy to mistake for "Instagram connected". |
| `youtube` | **The precedent to copy.** Real OAuth connect + verified channel + mirrored to the public site. |
| Builder blocks | 28 kinds. `embed` whitelists YouTube/Vimeo/Spotify/SoundCloud only — single players, not feeds. `social_links` renders link icons. |
| Live feed fetching | **Nothing in the codebase fetches any social feed.** |

Existing machinery we reuse (all already built, all proven by the YouTube flow):

- `lib/connection-oauth/providers.ts` — provider registry (currently 1 entry: `youtube`)
- `app/api/connections/oauth/start/route.ts` — OAuth start (139 lines)
- `app/api/connections/oauth/callback/google/route.ts` — callback (313 lines)
- `lib/connection-oauth/state.ts` — signed OAuth state (CSRF)
- `lib/integrations/catalog.ts` — already supports `connection: "oauth"`
- `lib/integrations/repository.ts` — encrypted secret vault (`setSecret` / `getDecryptedSecret` / `setIntegrationConfig`)
- `lib/integrations/workspace-social-sync.ts` — mirrors a verified channel to the public site

**Implication:** the OAuth spine is a solved problem here. The new work is provider
generalization, token refresh, a cache layer, and the block itself.

---

## 2. The two hard external constraints

These are not code problems and cannot be worked around. Both need the **owner**, not the agent.

### 2.1 Instagram

Basic Display API was **shut down December 2024**. The current path is
**Instagram API with Instagram Login**: the user authenticates with Instagram
directly, no Facebook account in the loop.

- Requires an Instagram **Business or Creator** account (personal accounts cannot be used)
- Scope needed: **`instagram_business_basic`** (profile + media). Do NOT request
  messaging/publishing/insights scopes — they slow App Review and we don't need them.
- Requires **Meta App Review**: privacy policy at a real domain, business verification,
  and a screencast showing exactly how each permission's data is used. Takes weeks.

### 2.2 TikTok

- Endpoint: `POST /v2/video/list/`, scope **`video.list`**
- Requires TikTok **App Review** (production audit): privacy policy URL, demo video
  covering every requested scope, data-handling description.

### 2.3 The decision only the owner can make

**Who owns the app registration?**

- **Tulala owns one app** (recommended) → tenants get true one-click connect, exactly like
  the YouTube flow. Requires the owner to register + submit both apps for review.
- **Per-tenant apps** → every agency does their own App Review. Realistically nobody will.
  This kills the feature.

Nothing in Phase 2/3 below can ship without the owner completing 2.3 and the reviews.
Phase 1 is deliberately built to be useful while that is pending.

---

## 3. Phased plan

### Phase 0 — Owner action (blocking, parallel with Phase 1)

Not agent work. Sequenced first because review latency is the long pole.

1. Create a Meta app; enable **Instagram API with Instagram Login**
2. Create a TikTok developer app; request **`video.list`**
3. Complete business verification + publish a privacy policy URL
4. Submit both for App Review with screencasts
5. Hand over 4 env vars:
   `INSTAGRAM_OAUTH_CLIENT_ID` / `INSTAGRAM_OAUTH_CLIENT_SECRET`
   `TIKTOK_OAUTH_CLIENT_KEY` / `TIKTOK_OAUTH_CLIENT_SECRET`

I will write the exact app config (redirect URIs, scopes, review copy) as a checklist
so this is fill-in-the-blanks, not research.

### Phase 1 — Featured-post block (ships immediately, zero approval)

**Honest scope: this does NOT auto-update.** It renders specific posts the operator
picks. It is a "feature this post" block, not a feed. Shipped first because it is
genuinely useful, unblocked, and shares the renderer/layout/lightbox code Phase 3 needs.

- New builder node kind `social_post` (registry + inspector + renderer)
- Paste an Instagram or TikTok post/Reel URL → server-side oEmbed fetch, cached
- Grid of 1–N featured posts, responsive, lightbox, lazy-loaded
- Mobile-overflow-safe (publish gate already blocks horizontal overflow)
- No OAuth, no tokens, no review

**Deliverable:** operator can put real Instagram/TikTok content on a page today.

### Phase 2 — One-click connect in Settings → Integrations

Unblocks the moment Phase 0 env vars land; review approval only gates *public* use.

1. **Generalize the OAuth registry.** `ConnectionOAuthProvider.oauthProvider` is currently
   the literal `"google"`, and the start route hard-gates on it
   (`provider.oauthProvider !== "google"`). Widen to a union
   (`"google" | "instagram" | "tiktok"`) and split the callback per provider.
   *This is the only invasive refactor in the plan — it touches a working money-adjacent
   auth path, so it lands as its own PR with tests.*
2. Two new `catalog.ts` entries, `connection: "oauth"`, `category: "social"`,
   modelled on the `youtube` entry (which already has the manual-fallback pattern).
3. Callback stores: encrypted long-lived token (vault) + public handle/label (`config_json`).
4. **Token refresh cron.** Instagram long-lived tokens expire in **60 days**; TikTok
   refresh tokens also rotate. Without this the feed silently dies two months after launch.
   Reuse the existing `/api/cron/*` + `CRON_SECRET` pattern (already smoke-tested).
5. Status in the Integrations card: Connected / Action needed / **Reconnect needed**
   (token expired is a distinct, actionable state — not a generic error).

### Phase 3 — The live feed block

- Extend `social_post` into `social_feed`: source = connected Instagram / TikTok / manual
- **Cache layer is mandatory**, not optional: a public storefront hitting Meta per page
  view will hit rate limits and be slow. Store the last N posts in Postgres, refresh on a
  cron, serve the page from cache. Feed must render from cache even when the API is down.
- Layouts: grid · carousel · masonry (reuse existing `carousel` / `masonry` primitives)
- Per-post moderation (hide specific posts — every paid plugin has this)
- Video + Reels support, lightbox, alt text from captions for a11y
- Graceful degradation: expired token → last cached posts + an admin-only warning,
  never a broken public page

### Phase 4 — Connect from inside the block

The "or from the widget" half of the ask. Deferred deliberately: it is pure UX sugar on
top of Phase 2, and building it earlier would mean building it twice.

- Empty state in the block inspector: "Connect Instagram" → same OAuth start route,
  returns to the editor with the block bound
- Requires an editor-return `redirect_uri` + state round-trip, which is why it comes
  after the Phase 2 refactor is stable

---

## 4. Sequencing + risk

| Phase | Blocked on | Ships |
|---|---|---|
| 0 | Owner (Meta/TikTok registration + review) | weeks of review latency |
| 1 | Nothing | immediately |
| 2 | Phase 0 env vars | after 0 |
| 3 | Phase 2 | after 2 |
| 4 | Phase 3 | last |

**Biggest risk:** App Review rejection. Mitigated by requesting the *minimum* scope
(`instagram_business_basic`, `video.list`) and nothing else.

**Second risk:** the 60-day Instagram token expiry. It is invisible at launch and breaks
every connected tenant simultaneously later. Phase 2.4 (refresh cron) is therefore
**not optional** and must ship with Phase 2, not after it.

**Third risk:** the OAuth registry refactor (2.1) touches a live, working auth path.
Isolated into its own PR, with the YouTube flow re-verified before merge.

---

## 5. What I need from the owner to start Phase 2

Only 2.3: **does Tulala own one Meta/TikTok app for all tenants, or does each tenant
register their own?** Everything else in Phase 0 I can spec as a checklist.

Phase 1 needs nothing and can start now.
