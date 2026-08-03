# Tenant-Connected Google Search Console & Analytics — Findings & Build Plan

_Investigation date: 2026-08-03. No code written. All paths relative to `web/`._

## TL;DR

- **Analytics is essentially already done.** Tenants can already set their own GA4, GTM, Meta / TikTok / LinkedIn pixels through a real, reachable admin screen; it is not DB-only and it is **not** plan-gated. Consent Mode v2 is wired.
- **Search Console is the real gap.** There is no per-tenant verification mechanism — only one global platform token hard-coded into the root `<head>` on every host.
- **The per-tenant sitemap has a load-bearing bug.** The page _selection_ is correctly tenant-scoped, but every emitted URL (and robots' `Sitemap:` / `Host:` lines) is anchored to the fixed platform apex, not the tenant's own host. GSC will reject such a sitemap. This must be fixed before any GSC work matters.
- **Recommended design:** a dedicated `search_console` catalog integration with one public verification-token field, emitted as a real `<meta name="google-site-verification">` in the storefront's document `<head>` via the existing per-tenant `generateMetadata`. Fix the sitemap/robots host-origin bug first. Defer the Search Console API/OAuth and granular consent to later phases.

---

## Q1 — Can a tenant set their own GA4 today?

**Yes, fully, and it is reachable in the UI. Not DB-only, not plan-gated.**

**Admin screen (reachable):**
- Route: `src/app/(workspace)/[tenantSlug]/admin/settings/page.tsx` → flat settings shell.
- Flat settings, "Integrations" group: `src/components/admin/shell/internal/page-modules/WorkspacePageView.tsx:663-669` — group id `"integrations"` (union at `:108-122`), rendered via `extra: <IntegrationsSection />`. **No `meetsPlan()`/role guard at the group level**, so the group always shows (contrast the domain/branding rows at `:358-436`, which do gate).
- Category rendering: `src/components/admin/shell/internal/page-modules/IntegrationsSection.tsx:33-69` groups cards by category; the `analytics` group is `:44-47`.
- Editor drawer with Save: `src/components/admin/integrations/IntegrationConfigDrawer.tsx:385` (`integration.fields.map(...)`), saves public IDs via `saveIntegrationConfig` at `:117`.

**Catalog entries** (`src/lib/integrations/catalog.ts`):
- GA4 — key `ga4`, field `measurement_id` — `:270-293` (validator `testGa4MeasurementId` `:107`).
- Meta Pixel `:295-318`, TikTok `:320-343`, LinkedIn `:345-368`, GTM `:370-393`.
- **None of the five carry an `entitlement`**, so they render and save unconditionally (role-gated only). Only `custom_code` (`entitlement: "custom_css_allowed"`, `:406`) and `email_domain` (`white_label_email`, `:485`) are entitlement-gated.

**Plan tiers:** the platform tiers are `free` / `studio` / `agency` / `network` (`src/lib/access/plan-catalog.ts:20-22`, `:127`). Custom analytics/pixels are available on **all** of them. The two entitlement flags live in the platform-written `agency_entitlements` table (`src/lib/integrations/repository.ts:291-312`; "Platform writes only" per the table migration).

**Persistence:** dedicated `tenant_integrations` table, `config_json` column, keyed on `(tenant_id, integration_key)` — **not** an `agencies.settings` blob.
- Write action: `saveIntegrationConfig` — `src/app/(workspace)/[tenantSlug]/admin/settings/integration-actions.ts:299-360` (role gate `requireSettingsManager` `:304`; per-field `test()` validation `:324-332`; `setIntegrationConfig` `:351`).
- Repository upsert: `src/lib/integrations/repository.ts:89-124`, `setIntegrationConfig` merge at `:153-183`.

**Runtime injection (already live):**
- `src/app/layout.tsx:177` calls `resolveTenantAnalytics(publicScope.tenantId)` on storefront requests; `AnalyticsScripts` rendered `:213-223`.
- Resolver `src/lib/integrations/analytics-resolver.ts:76-143` reads the five rows, gated on `status === "connected"` (`:50-54`), each ID re-sanitized.
- GA4 resolution chain: tenant `config_json.measurement_id` → platform-DB default (`platformConfigField`, `:99-105`) → env `NEXT_PUBLIC_GA_MEASUREMENT_ID` (applied in the component, `analytics-scripts.tsx:39,74-76`). The other four are tenant-only, no fallback.

**One caveat worth surfacing to tenants:** the GA4 `tenant_id` custom dimension emitted at `analytics-scripts.tsx:83-92,138` only appears in GA4 Explore if the matching custom dimension is registered once in the GA4 Admin UI — a manual step, noted in the code comment. This matters only for tenants who _inherit_ the platform GA property; tenants on their own GA4 property don't need it.

---

## Q2 — Search Console per-domain ownership verification

**This is the real gap. Nothing tenant-specific exists.** The only verification token today is the platform's, hard-coded in the root layout and served on **every** host:
- `src/app/layout.tsx:120-125` — `metadata.verification.google = "AT_7Nj7…"`, the token for the `https://tulala.digital/` URL-prefix property. It leaks onto every tenant subdomain and custom domain (harmless — Google ignores tokens that don't match the property it's checking — but it is not a per-tenant mechanism).
- No `<meta name="google-site-verification">` HTML-file route, no `google<hash>.html` file, no per-tenant verification field anywhere.

### The domain model (what verification has to work across)

Host → tenant resolution runs in `src/proxy.ts` (there is **no** `src/middleware.ts`):
- `resolveTenantContext` → `src/lib/saas/host-context.ts:158-273` queries `agency_domains` on `hostname` where `status IN ('active','ssl_provisioned','verified')`.
- `agency_domains.kind` distinguishes `subdomain` vs `custom` (switch `host-context.ts:210-266`); both map to a `kind:"agency"` host context; `is_primary` picks the canonical host; `domainKind` is preserved (`:256`).
- Read back via `getPublicHostContext()` (`src/lib/saas/scope.ts:440-472`) — the agency context carries `tenantId`, `hostname`, `tenantSlug`.

### Comparing the three verification paths

| Option | Subdomain (`x.tulala.digital`) | Custom domain (`brand.com`) | Verdict |
|---|---|---|---|
| **HTML meta tag via `TenantCustomCodeHead`** | Works only if tenant has `custom_css_allowed`; **and the tag lands in `<body>`, not `<head>`** (`src/components/integrations/tenant-custom-code.tsx:25-40` injects via a `display:contents` div high in `<body>`). Google requires the tag in `<head>`. | Same two problems. | ✗ Entitlement-gated **and** wrong placement. Unreliable for GSC. |
| **Dedicated verification field → real `<head>` meta tag** | ✓ Uniform. Tenant creates a URL-prefix property for their exact storefront URL, pastes the token. No DNS needed. | ✓ Same uniform flow. | ✓ **Recommended.** Correct placement, not entitlement-gated, one controlled field. |
| **Search Console API (OAuth)** | ✓ Full automation (auto-verify + auto-submit sitemap + pull metrics back) | ✓ Same | Best UX, heaviest build. Later phase. |

**On the DNS constraint you flagged:** correct — a subdomain tenant cannot add a DNS TXT record for `tulala.digital` (the platform owns the apex zone). The platform _could_ add a TXT for the subdomain on their behalf, but that is per-tenant DNS ops, not self-serve. The **HTML meta tag in `<head>` avoids DNS entirely and is uniform across both host types**, which is why it wins. For **custom-domain** tenants, a GSC _Domain property_ via DNS TXT is strictly better (covers http/https/all subdomains) and they _can_ do it themselves — so we should offer DNS TXT as an optional power-user alternative, but not require it.

**Why a dedicated field beats reusing custom code:** (1) `TenantCustomCodeHead` is entitlement-gated behind `custom_css_allowed`, so lower-tier tenants couldn't verify; (2) it renders in `<body>`, and Google's HTML-tag method specifically requires the tag in the homepage `<head>`; (3) a single typed token field is safer and gives us a clean status/verified state to show, versus free-form HTML.

**Correct insertion point (already exists):** `src/app/(public)/layout.tsx:29-37` is a per-tenant `generateMetadata` that already resolves tenant context and returns tenant-specific metadata (the title template). Extending it to set `verification.google` from the tenant's stored token lands the tag in the real document `<head>` on every storefront page (including the homepage GSC checks), and Next's child-over-parent metadata merge cleanly overrides the root platform token on tenant hosts.

---

## Q3 — Should tenants get their own sitemap, and is the agency-host branch correct?

**Yes they should — and the branch is _almost_ right but currently broken at the origin.**

**What's correct:** `src/app/sitemap.ts` builds a genuinely per-tenant page set on the agency branch (`:187` onward):
- Static storefront paths `/contact`, `/directory`, `/models` (`:195`, `:202-210`).
- Homepage `/`, gated on the tenant's own `noindex` / `include_in_sitemap` flags (`:246-299`).
- CMS pages `/p/<slug>` (`:308-326`) and posts `/posts/<slug>` (`:328-343`), scoped by `publicScope.tenantId` via RPC.
- Talent roster `/t/<code>` scoped `.eq("created_by_agency_id", publicScope.tenantId)` (`:352-375`) — explicitly to avoid advertising the whole platform.

**The bug:** every URL is built with `new URL(path, base)` where `base = publicSiteMetadataBase()` — and that function returns the **fixed** `NEXT_PUBLIC_SITE_URL` (`https://tulala.digital`), ignoring the request host:
- `src/lib/seo/locale-alternates.ts:8-12` — `new URL(process.env.NEXT_PUBLIC_SITE_URL)`.
- `sitemap.ts:116` consumes it; `robots.ts:12-14,26` consumes it for both the `Sitemap:` line and the `Host:` line.

So a tenant on `agency.tulala.digital` (or a custom domain) serves a sitemap whose URLs point at `tulala.digital/...`, and a robots.txt advertising `tulala.digital`. **GSC rejects a sitemap whose URLs are not on the property's own host** — so today a per-tenant sitemap cannot be submitted successfully. The resolved host _is_ available (`hostContext.hostname`, `scope.ts:451` / `proxy.ts:636`) but never consumed.

**Fix:** in `sitemap.ts` and `robots.ts`, derive `base` from `hostContext.hostname` for `agency` (and `hub`) kinds, keeping the platform apex only for `marketing`. This is independently valuable SEO correctness and is a hard prerequisite for GSC. After the fix, sitemap submission can be manual (tenant pastes `https://<their-host>/sitemap.xml` in GSC) or automated later via the API.

---

## Q4 — Privacy / consent obligations

**Consent Mode v2 is wired** (`src/components/analytics/analytics-scripts.tsx`):
- `ga-consent-default` runs `beforeInteractive` (`:101-124`), defaults all four signals (`analytics_storage`, `ad_storage`, `ad_user_data`, `ad_personalization`) to **denied**, reads `localStorage['impronta_analytics_consent']`, `wait_for_update:500`.
- GA4 + GTM run under Consent Mode; Meta/TikTok/LinkedIn are **hard-gated** to `granted` (`:191-194`, `:209-211`, `:236-238`).
- Banner writes the key: `src/components/analytics/analytics-consent-banner.tsx:7`.

**So the technical baseline is covered.** The remaining obligations are product/legal, not a missing technical control:
1. **Tenant-set GA4/pixels make the tenant an independent data controller** on their storefront. Their own privacy policy must disclose the tools they enable. We should surface a reminder + a tenant privacy-policy URL field, and ideally show which trackers are active.
2. **The consent banner is platform-global and platform-branded.** A tenant's storefront showing the platform's cookie banner and policy links may be branding-wrong and legally thin. Consider a tenant-configurable banner (copy + policy URL).
3. **Consent is single on/off, not per-purpose granular.** GDPR best practice is granular categories (analytics vs advertising). Fine for MVP; a later hardening item.
4. **Controller/processor relationship:** when the platform injects the tenant's analytics, the platform is arguably a processor for the tenant's collection. A DPA clause should cover it. Legal, not code.

Net: Consent Mode v2 covers the technical baseline; gaps are tenant-specific disclosure/banner branding, granular consent, and a DPA note.

---

## Recommendation — simplest correct design

1. **Fix the sitemap/robots host-origin first** (SEO correctness + GSC prerequisite).
2. **Ship a dedicated `search_console` integration**: one public `verification_token` field in the existing catalog, no entitlement, emitted as a real `<meta name="google-site-verification">` in the storefront `<head>` via the existing `(public)/layout.tsx` `generateMetadata`. Uniform across subdomains and custom domains, no DNS required.
3. **Keep GA4/pixels as-is** — already correct and reachable.
4. **Defer** the Search Console API/OAuth automation and granular consent to later phases.

Reject the custom-code meta-tag path (entitlement-gated + `<body>` placement). Offer DNS-TXT Domain-property verification only as an optional alternative for custom-domain tenants.

---

## Phased build plan

**Phase 0 — Sitemap/robots host correctness (prerequisite, independently valuable).**
- In `sitemap.ts` (`:116`) and `robots.ts` (`:12-14,26`), compute `base` from `hostContext.hostname` for `agency`/`hub` kinds; keep apex for `marketing`. Guard the null-hostname case.
- Tests: an agency host emits URLs on its own host and a same-host `Sitemap:`/`Host:`; marketing unchanged.

**Phase 1 — Self-serve GSC verification (meta tag).**
- Catalog: add `search_console` (new `seo` category or under `analytics`), field `verification_token` (public, `connection:"manual"`, no entitlement), validator that accepts either the raw ~43-char token or a pasted full `<meta>` tag and extracts `content`.
- Resolver: add `resolveTenantSearchConsole(tenantId)` returning the token when `status==="connected"`.
- Head injection: in `(public)/layout.tsx` `generateMetadata` (`:29-37`), set `verification: { google: token }` when a tenant token exists; this overrides the root platform token on tenant hosts. Scope the root token (`layout.tsx:120-125`) so it is not emitted on tenant hosts.
- Admin UI: the GSC card appears automatically (catalog-driven) in the Integrations group, with subdomain-vs-custom-domain instructions and a note about the DNS-TXT alternative for custom domains.

**Phase 2 — Sitemap submission convenience.**
- Surface the tenant's own `https://<host>/sitemap.xml` in the SEO/Integrations panel with copy on submitting it in GSC. (Relies on Phase 0.)

**Phase 3 — Search Console API / OAuth automation (optional, demand-driven).**
- Add an `oauth` connection like the existing `youtube` integration (`catalog.ts:512-534`), Google scopes for the Site Verification API + Search Console API, reusing the credential vault. Auto-verify, auto-add the site, auto-submit the sitemap, and pull Search performance metrics into the dashboard.

**Phase 4 — Consent / privacy hardening.**
- Tenant-configurable cookie-banner copy + privacy-policy URL; per-category granular consent; DPA/controller-processor documentation. Legal + product.
</content>
</invoke>
