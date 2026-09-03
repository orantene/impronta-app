/**
 * The path tables. Data only, no logic: which prefixes and exact paths belong
 * to which surface group. `gate.ts` is the only reader.
 *
 * Extracted from `surface-allow-list.ts`; that file is now the barrel and
 * remains the import path for every consumer.
 */

export const STATIC_PATHS = [
  "/sitemap.xml",
  "/robots.txt",
  // Root Next.js metadata file-routes (`app/opengraph-image.tsx`,
  // `app/twitter-image.tsx`). They are host-aware (agency card vs. Tulala
  // card) and are referenced by absolute URL in every page's og:image /
  // twitter:image. Without an allow-list entry the marketing host treats the
  // single segment as a storefront slug and 404s, which silently breaks every
  // social-share preview. Allowed on all kinds; the route decides what to render.
  "/opengraph-image",
  "/twitter-image",
] as const;

/**
 * Self-contained brand/design prototypes under `/prototypes/*`. These are
 * standalone demo surfaces (no tenant reads, no auth, no platform chrome)
 * used to explore brand directions before committing them to the tenant
 * theme system. Allowed on every host kind so they're reachable from any
 * dev hostname without seeding `agency_domains`.
 */
export const PROTOTYPE_PREFIX = "/prototypes" as const;

/**
 * API paths reachable on every surface:
 *   - `/api/cron/*` → scheduler bearer-token protected
 *   - `/api/analytics/events` → write-only, name allow-listed
 *   - `/api/stripe/*` → Stripe webhook signature-protected; must NOT be gated
 *        by host-resolution because Stripe sends events to whatever public
 *        endpoint we register and the originating Host header may not match
 *        any seeded `agency_domains` row.
 *   - `/api/health/*` → read-only deploy diagnostics (e.g.
 *        `/api/health/guest-chat` reports only the BOOLEAN presence of the
 *        Upstash KV env vars — no secret values, no tenant data).
 *        Intentionally unauthenticated so `deploy:smoke` can probe the
 *        deployed runtime without a session; without this entry the proxy
 *        rewrote it to a 404 and the smoke check could never read the
 *        anti-spam signal.
 *   - `/api/dev/reset-guest` → QA/E2E fresh-guest-session reset (W0-H). Unlike
 *        the rest of `/api/dev/*` (bypassed in proxy.ts for dev + preview
 *        ONLY), this single route is also allowed through on production hosts
 *        because its own gate accepts either dev/preview OR an authenticated
 *        staff session — production staff need it to get a clean guest cookie
 *        while QA-ing the live guest chat panel. It clears only the
 *        `impronta_guest` cookie (no DB writes) and 404s (never 403) when
 *        neither gate passes, so listing it here does not advertise a
 *        capability.
 *   - `/api/media/asset/*` → gated media reads (execution plan 2026-08-15 §1
 *        P0-1). Host-agnostic on purpose: the surface a photo is being
 *        requested FOR is HMAC-signed into the URL, not inferred from the
 *        Host, so that a tenant reached at `tulala.digital/<slug>` and a
 *        `next/image` server-side refetch both evaluate against the right
 *        surface. The gate is the two-key predicate inside the route; an
 *        unsigned or tampered URL 404s, and the whole route 404s while gated
 *        media access is off
 *        (`platform_settings.media_private_access_enabled`, default false).
 *        Scoped to `/asset` rather than `/api/media` so the staff-only
 *        `/api/media/bake-watermark` keeps exactly the reachability it has
 *        today.
 * These never leak tenant data and have their own gates.
 */
export const SHARED_API_PREFIXES = [
  "/api/cron",
  "/api/analytics/events",
  "/api/stripe",
  "/api/health",
  "/api/dev/reset-guest",
  "/api/media/asset",
  // Public booking slots. The slot picker runs on EVERY public surface an
  // appointment can be booked from -- an agency storefront, a talent site, the
  // platform host -- so it cannot belong to one host kind. It derives its
  // tenant from the offering row rather than from Host, returns only free slot
  // starts (never a hold, booking or block), and is rate-limited per IP and
  // per tenant. Omitting it here is not a soft failure: the route never runs,
  // the fetch gets the branded HTML 404, and the picker renders no times at
  // all on every host.
  "/api/public/booking",
  // Tulala Agent intake + Account Strategist. Anonymous-first on marketing
  // (/get-started/agent) and authenticated on app (/account/brief/agent). Own
  // KV namespaces, own SSRF guard, own fail-closed gate. Not under `/api/ai`
  // because that prefix would also open directory search on the marketing host.
  "/api/tulala",
  // Social connection OAuth. The provider redirects the operator back to the
  // callback on whatever host the app registered, and `start` is opened from
  // whichever surface the operator was on. Each route resolves its own tenant
  // and session; this entry only lets the request reach that gate.
  "/api/connections/oauth",
  // Signed-in document downloads, linked from emails and from either admin
  // surface. Both answer 401 to an unauthenticated caller, so the handler is
  // the gate and this entry only lets the request arrive.
  "/api/receipt",
  "/api/payout-statement",
  // Builder autosave beacon. Fires from `navigator.sendBeacon` as the editor
  // page unloads, on any host the editor runs on, and is gated inside the
  // handler by `requireStaffApi`.
  "/api/site-admin/homepage-draft-beacon",
] as const;

/**
 * Compliance endpoints reachable on every surface, regardless of host kind:
 *   - `/unsubscribe/<token>`     → branded one-click unsubscribe page
 *   - `/api/unsubscribe/<token>` → RFC 8058 List-Unsubscribe POST target
 * The per-user token in the URL is the only credential; these carry no tenant
 * data and must never 404, since an unsubscribe link in an email can be opened
 * from any host context (platform apex, agency vanity domain, or app host).
 */
export const COMPLIANCE_PREFIXES = [
  "/unsubscribe",
  "/api/unsubscribe",
  // STANDING reviews — the emailed review-invite landing at
  // `/review/<invite_token>`. Like unsubscribe, the per-recipient token in the
  // URL is the only credential and the link can be opened from any host context
  // (platform apex, agency vanity domain, or app host), so it must never 404 on
  // a tenant host. Identity is auth-matched server-side inside the action; the
  // token is never trusted for identity.
  "/review",
  // Inquiry email loop — the "log in to continue the conversation" CTA from
  // the reply-mirror email. Like unsubscribe, the HMAC-signed token in the
  // URL is the only credential and the link can be opened from any host
  // context; the route exchanges it for a magic link and bounces to
  // /auth/confirm on the app host. Must never 404 on a tenant host.
  "/api/conversation/continue",
] as const;

/**
 * PWA fallback route reachable on every surface, regardless of host kind:
 *   - `/offline` → the service-worker offline fallback page (force-static,
 *                  no tenant/auth data). The SW pre-caches it during install
 *                  by fetching it over the network, so it must return 200 on
 *                  every host (app, agency subdomain, custom domain, hub).
 *                  Without this entry the proxy 404s it on tenant hosts and
 *                  the SW can never cache the fallback. Goes through the proxy
 *                  (unlike sw.js/manifest, which are static files exempted at
 *                  the matcher) so the force-dynamic root layout still gets its
 *                  locale + host headers.
 */
export const PWA_PATHS = ["/offline"] as const;

/**
 * P5 mobile-app groundwork — well-known deep-link association files, reachable
 * on every surface regardless of host kind:
 *   - `/.well-known/apple-app-site-association` → Apple Universal Links
 *   - `/.well-known/assetlinks.json`            → Android App Links (Digital
 *                                                  Asset Links)
 * Both are inert PLACEHOLDER stubs (see the route files under
 * `app/.well-known/*`) until a native app exists — no tenant data, no auth,
 * so host-agnostic is safe. iOS/Android verifiers fetch these over HTTPS
 * with no session; gating them behind host resolution would 404 them on
 * whichever host ends up hosting the real files.
 */
export const WELL_KNOWN_PREFIX = "/.well-known" as const;

/**
 * Post-checkout landing pages reachable on every surface, regardless of host
 * kind. Stripe builds `success_url` / `cancel_url` from the request origin
 * (see `client-pipeline.ts`), so after a client pays, Stripe redirects them to
 * `/checkout/success` (or `/checkout/cancel`) on whatever host they started
 * from (app, agency subdomain, custom domain, hub). These pages read only the
 * returned checkout session and carry no cross-tenant data. Without this entry
 * a paying customer hits a branded 404 the instant they complete payment.
 */
export const CHECKOUT_PREFIX = "/checkout" as const;

/**
 * Public embed loader + roster widget reachable on every surface. They are
 * dropped as a `<script>` / `<iframe>` on partner sites (frame-ancestors *), so
 * the originating Host header is an external partner domain that never matches a
 * seeded `agency_domains` row and must pass the surface gate host-agnostically:
 *   - `/embed.js`                → the loader script (exact match; the `.js`
 *                                  suffix is NOT one of the matcher's image-only
 *                                  extension bypasses, so it reaches this gate)
 *   - `/embed`, `/embed/roster/*`→ the iframe roster widget
 * Tenant scope is enforced inside each route handler.
 */
export const EMBED_PREFIX = "/embed" as const;

export const EMBED_EXACT_PATHS = ["/embed.js"] as const;

export const AUTH_PREFIXES = [
  "/login",
  "/register",
  "/join",
  "/forgot-password",
  "/update-password",
  "/auth",
  // Tenant-scoped registration entry points. Without these, hitting
  // `https://<tenant>.tulala.digital/talent/register` or its custom-domain
  // equivalent (e.g. `improntamodels.com/talent/register`) 404'd at the
  // middleware allow-list. The route file at
  // `web/src/app/(auth)/talent/register/page.tsx` exists and works; this
  // adds it to the agency-host allow-list so the talent-acquisition funnel
  // is reachable from the tenant's own canonical host.
  "/talent/register",
  "/client/register",
  // Talent profile-claim landing (`(auth)/claim/page.tsx`). Claim-invite
  // emails are branded per workspace and link relative to the AGENCY host
  // (`improntamodels.com/register?invitation=…` → `/claim?invitation=…`), so
  // the claim must resolve there. Without this entry the invited talent
  // finished signup and landed on the storefront 404 — caught by real-browser
  // QA on the custom domain (2026-08-05). Same class as /talent/register above.
  "/claim",
] as const;

export const AGENCY_STOREFRONT_PREFIXES = [
  "/directory",
  "/book",
  "/t",
  "/p",
  "/posts",
  "/models",
  // `/contact` removed — CMS clean-URL rewrite in middleware.ts maps
  // single-segment paths to /p/{slug} so any CMS page slug gets a clean
  // root URL without maintaining an explicit entry here.
  // Phase 9 — operator-issued share links. Token-gated viewer that
  // renders a frozen homepage revision snapshot to an unauthenticated
  // visitor. Tenant scope is enforced inside the route handler via the
  // signed `tid` claim cross-checked against the resolved host.
  "/share",
  "/me", // F5 customer home; storefront surface, tenant-scoped in lib/me/load-me.ts
] as const;

export const AGENCY_API_PREFIXES = [
  "/api/directory",
  "/api/ai",
] as const;

export const APP_WORKSPACE_PREFIXES = [
  "/admin",
  "/client",
  "/talent",
  "/onboarding",
  "/invite",
  // Emailed team-invite redemption links (`/team-invite/[id]/route.ts`) resolve
  // an invite token then redirect to join/login. The email builds the link from
  // the app/agency host, so without this entry the link 404s at the surface gate
  // before the route handler can run.
  "/team-invite",
  // Editor template preview (`/template-preview/[key]/page.tsx`) is embedded by
  // every template picker in the site editor — app/agency workspace context.
  "/template-preview",
  // QA-1 fix — bare `/account` server-redirects the actor to their
  // role-scoped account page (/admin/account, /client/account, or
  // /talent/account). Reachable wherever the role-scoped pages are
  // reachable (agency + app hosts). Without this entry the surface
  // allow-list 404s the request before Next routing can run the
  // redirect, so the operator hits a blank "Not found" page.
  "/account",
  // Phase 3.11 — Tulala HQ platform super_admin console.
  // Lives at /platform/admin/* on the app host (no tenant slug).
  // Gated inside layout.tsx to app_role === 'super_admin'.
  "/platform",
  // Phase 9 — operator-issued share links (CMS revisions + Pitch landings).
  // Allowed on app/hub hosts too so links sent via WhatsApp resolve when the
  // recipient lands on app.tulala.digital or a localhost dev mirror. Tenant
  // scope is enforced inside the route handler via the signed JWT claims.
  "/share",
] as const;

/**
 * Admin / talent dashboards make Google-Places-backed canonical-location
 * picker calls, so the four `/api/location-*` routes are app-host only.
 * They are hyphenated (not a URL segment), so they're matched exactly.
 */
export const APP_API_PREFIXES = [
  "/api/admin",
  "/api/ai",
  // Directory API can serve path-based tenant previews on the canonical app
  // host; the route handler resolves and enforces tenant scope itself.
  "/api/directory",
  // Phase B-4 + Phase E (2026-05-14) — client-side dashboard API routes
  // for the new InquiryDrawer + Messages tabs + Offer actions. RLS gates
  // tenant scope inside the route; middleware just lets the path through.
  "/api/client",
  // D2 (2026-05-14) — Discover engine API. Cross-tenant talent browse for
  // any authenticated client (Standard tier baseline). Tenant scope is
  // deliberately bypassed inside the route via service-role since Discover
  // surfaces is_discoverable=true talents platform-wide. See
  // web/docs/discover-and-unified-inquiry-2026-05-14.md §7.
  "/api/discover",
  // Talent self-service dashboard API (e.g. /api/talent/media/library — the
  // Max-tier page-builder media picker, /api/talent/tax-summary). The route
  // handlers enforce talent-self / managing-staff auth themselves; the proxy
  // just lets the app-host path through.
  "/api/talent",
  // HQ support investigation bundle (session or SUPPORT_INVESTIGATION_TOKEN).
  "/api/platform",
] as const;

export const APP_API_EXACT_PATHS = [
  "/api/location-place-details",
  "/api/location-country-details",
  "/api/location-countries",
  "/api/location-cities",
] as const;

/**
 * Canonical public talent surface (`/t/[profileCode]`). Agency hosts render the
 * agency-skinned roster view; app + marketing Tulala hosts render the platform
 * profile (Max snapshot when published). Hub also allows `/t` for tulala.digital.
 */
export const CANONICAL_TALENT_PREFIX = "/t" as const;

/**
 * Guest full-window conversation surface (`/c/[inquiryId]`) — U1 mini→full
 * expansion. Reachable wherever a guest may be when they click "Open full
 * conversation" (agency storefronts, hub, app, marketing). Ownership is gated
 * server-side by the x-impronta-guest cookie inside getGuestFullThread — the
 * allow-list just lets the path through.
 */
export const CANONICAL_GUEST_THREAD_PREFIX = "/c" as const;

/**
 * QR & Links Q1 — the tracked-link resolver (`/q/[code]`). Agency and hub only:
 * those carry a tenant, and a code means nothing without an owner to look it up
 * under (`casarizo.com/q/t7` and `otherplace.com/q/t7` differ). Without this
 * entry the proxy 404s every scan before Next routing runs.
 */
export const CANONICAL_LINK_PREFIX = "/q" as const;

/**
 * Marketing-only public pages. These render the public SaaS marketing site
 * (sold product, not tenant storefront). They never read tenant data and
 * never require auth. Keep this list scoped; everything else 404s on the
 * marketing host to preserve the surface boundary.
 */
export const MARKETING_PAGE_PREFIXES = [
  // INTENTIONALLY marketing-host only — do not add this to AUTH_PREFIXES or
  // any agency/app/hub group. "/get-started" ("Start your business, free")
  // creates a brand-new tenant/workspace; it is the operator-acquisition
  // funnel for Tulala itself, not a tenant-facing surface. Showing it on an
  // existing agency's own branded domain (e.g. improntamodels.com) would
  // invite that agency's own visitors to go start a competing workspace.
  // The 404 on every agency/app/hub host is the correct, checked behavior —
  // see surface-allow-list.test.ts ("marketing host: non-marketing hosts
  // must 404 marketing pages") and the "Auth surface matrix" section of
  // `scripts/post-deploy-smoke-test.mjs` (P3), which asserts BOTH halves:
  // 200 on tulala.digital, 404 on improntamodels.com.
  "/get-started",
  "/discover-agencies",
  "/operators",
  "/agencies",
  "/organizations",
  "/how-it-works",
  "/network",
  "/integrations",
  "/pricing",
  "/faq",
  "/waitlist",
  "/legal",
  // Self-served operational pages — both public, no auth required.
  // `/status` runs HTTP probes on every page load (see (marketing)/status/page.tsx).
  // `/help` is a four-role docs hub (operators / agencies / talents / clients).
  "/status",
  "/help",
  // The human support promise page. Named separately from `/help` because it
  // is positioning, not documentation.
  "/support",
  // Talent-category landing pages (`/for/models`, `/for/musicians`, ...).
  // Two segments on purpose: a single-segment `/models` would collide with
  // the tenant-slug namespace, `/for/*` never can.
  "/for",
  // Educational resource articles + glossary (`/resources/*`).
  "/resources",
  // The feature hub: the index, every `/features/{slug}`, and its
  // `opengraph-image` route.
  "/features",
  // The same hub in Spanish, at Spanish slugs (`/funciones/citas-y-reservas`).
  // A separate tree rather than a locale prefix because the search term is the
  // URL: that is the whole reason a Spanish slug earns its keep.
  "/funciones",
  "/compare", // head-to-head comparisons
  "/comparar", // ...and the Spanish-slugged tree
  // Documentation shell. Published as a "coming soon" skeleton and marked
  // noindex until it has real content, so it is reachable from the feature
  // pages that link to it without being offered to search.
  "/docs",
  // Global Talent Directory — public, platform-wide cross-tenant browse of
  // the discoverable set (talent_discover_index matview). Reads no per-tenant
  // private data, requires no auth. `/directory` is already reserved in
  // PATH_BASED_TENANT_RESERVED_PREFIXES so it never resolves as a tenant slug.
  "/directory",
  // The directory's INTERNAL route path. `/directory` is a proxy.ts rewrite to
  // the `(marketing)/global-directory` route, so Next generates that page's
  // metadata file-routes under the internal path: the og:image resolves to
  // `/global-directory/opengraph-image-<hash>`. Without this entry that asset
  // 404s and the directory unfurls with no card at all (same failure mode as
  // the root `/opengraph-image` before it was allow-listed). Serving the page
  // itself at both paths is safe: it emits a canonical of `/directory`, so
  // crawlers consolidate, and only `/directory` is in the sitemap.
  "/global-directory",
  // "Agencia de talento" landing page — Spanish-first demand keyword page
  // (100-1K/mo, LOW competition in Mexico). Single page, no sub-routes.
  "/agencia-de-talento",
  // Brand entity + trust page — what Tulala is, what it believes, what it
  // builds, who it's for.
  "/about",
  // Platform contact form at App Router (public)/contact. Marketing hosts
  // serve it. Agency hosts do NOT allow this prefix — `/contact` there is a
  // tenant-ownable CMS slug (clean-URL rewrite → /p/contact): 200 if the
  // page exists, 404 if not, never this marketing form.
  "/contact",
  // "Contratar modelos" landing page — Spanish-first demand-side hire page
  // for models, the one category the directory has real supply for today.
  // Single page, no sub-routes.
  "/contratar-modelos",
  // Website-tier landing pair: `/websites` (EN) and `/sitios-web` (Spanish-
  // first SEO sibling), same relationship as `/agencies` <-> `/agencia-de-
  // talento`. Both are single pages with no sub-routes; each owns an
  // `opengraph-image` file-route under its own prefix, which these entries
  // cover.
  "/websites",
  "/sitios-web",
] as const;

/**
 * Marketing-host APIs. Do not widen to `/api/ai` — directory search / draft
 * stay agency+app only. The guest chat route authorizes via the signed
 * guest cookie + ticket ownership; this entry only lets the POST reach it.
 */
export const MARKETING_API_PREFIXES = ["/api/ai/guest-support-chat"] as const;
