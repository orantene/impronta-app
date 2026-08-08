import type { Metadata } from "next";
import { headers } from "next/headers";

import { PLATFORM_BRAND } from "@/lib/platform/brand";
import { getSiteUrl } from "@/lib/auth-flow";
import { getPublicHostContext } from "@/lib/saas";
import { resolveShellBrandLogoUrl } from "@/lib/site-admin/server/shell-brand-logo";
import { loadPublicBranding, loadPublicIdentity } from "@/lib/site-admin/server/reads";
import { loadPublicPageBySlug } from "@/lib/site-admin/server/pages-reads";
import { loadTenantWhitelabel } from "@/lib/brand/tenant-whitelabel";
import { loadTenantLocaleSettings } from "@/lib/site-admin/server/locale-resolver";
import { getRequestLocale, ORIGINAL_PATHNAME_HEADER } from "@/i18n/request-locale";
import { createTranslator } from "@/i18n/messages";
import { getMarketingCopy } from "@/lib/marketing/copy";
import { stripLocaleFromPathname } from "@/i18n/pathnames";

import { AuthLanguageToggle } from "./auth-language-toggle";
import {
  AuthBrandPanel,
  AuthFooter,
  AuthTopBar,
  type AuthShellBrand,
} from "./auth-shell-chrome";

/** Auth screens should not be indexed; page titles use the root template. */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/** What the layout needs beyond the brand object itself. */
type AuthShellResolution = {
  brand: AuthShellBrand;
  /** Resolved "Contact" target — see {@link resolveContactHref}. */
  contactHref: string;
};

/**
 * A brand accent we are willing to interpolate into a CSS gradient: 3- or
 * 6-digit hex only. Anything else (a token name, a `var()`, a function call, an
 * operator-typed string) resolves to `null` so nothing untrusted reaches the
 * style attribute and no malformed value can collapse the gradient.
 */
function normalizeHexAccent(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value) ? value : null;
}

/**
 * The tenant's brand accent, for the whitelabel brand panel's gradient.
 *
 * Reads through `loadPublicBranding` — the existing cached, `branding`-tagged
 * PUBLIC projection — so this adds no new query and no new table access. Two
 * sources, in the order the rest of the product uses them:
 *   1. `agency_branding.accent_color`, the column the admin-chrome whitelabel
 *      accent (`--tulala-accent`, PR #880) reads.
 *   2. `theme_json["color.accent"]`, the storefront theme-cascade token. This
 *      is the one that is actually populated for the live whitelabel tenant
 *      (Impronta: `#d4af37`), so skipping it would have shipped a "tinted"
 *      gradient that is never tinted.
 * `null` on any failure → the panel keeps its neutral gradient.
 */
async function resolveTenantAccent(tenantId: string): Promise<string | null> {
  const branding = await loadPublicBranding(tenantId).catch(() => null);
  if (!branding) return null;
  const themeJson = (branding.theme_json ?? {}) as Record<string, unknown>;
  return (
    normalizeHexAccent(branding.accent_color) ??
    normalizeHexAccent(themeJson["color.accent"])
  );
}

/**
 * ─────────────────────────── B7 RULING (2026-08-07) ───────────────────────────
 *
 * On a whitelabel host (improntamodels.com) the auth footer's three links used
 * to ALL point at https://tulala.digital/…, which reads as a brand leak. The
 * ruling splits them, and the split is intentional:
 *
 *   Terms + Privacy STAY on the platform host, on every host, forever.
 *     The account being created or signed into is a Tulala platform account and
 *     the agreement that binds the user is Tulala's, not the agency's. Pointing
 *     these at a tenant URL would misrepresent whose terms apply — a legal
 *     misstatement, which is strictly worse than a visible brand seam. If a
 *     future agency wants its own client terms, that is a SEPARATE link, added
 *     alongside these, never a replacement for them.
 *
 *   Contact becomes HOST-AWARE.
 *     A talent or client who reaches for "Contact" from improntamodels.com/login
 *     wants the AGENCY that represents them or that they are booking through.
 *     Tulala platform support is the wrong destination and the wrong brand. So
 *     on a whitelabel AGENCY host we point Contact at the tenant's own contact
 *     surface, and fall back to the platform only when the tenant has none.
 *
 * Do not collapse these back into one rule.
 * ──────────────────────────────────────────────────────────────────────────────
 *
 * Resolution order on a whitelabel agency host:
 *   1. The tenant's published `/contact` CMS page, in the CURRENT locale.
 *      `/contact` on an agency host is a CMS clean-URL: `proxy.ts` rewrites any
 *      single-segment path that is not in the agency allow-list to `/p/<slug>`,
 *      and the catch-all 404s when that slug is not PUBLISHED for that locale.
 *      So the published page must be confirmed BEFORE linking, or we ship a
 *      dead link — exactly the failure the platform-side `/contact` link had
 *      (which is why the platform target is `/about`). Host-local relative URL,
 *      never cross-host: D1 keeps auth host-local.
 *   2. `agency_business_identity.contact_email` as a `mailto:` — still the
 *      agency, not the platform. NOTE: no tenant has this column set today, so
 *      this rung is unexercised in production as shipped.
 *   3. The platform contact surface, `${getSiteUrl()}/about`.
 *
 * Gated to `kind === "agency"`: the CMS clean-URL rewrite in `proxy.ts` is
 * agency-hosts-only, so `/contact` on a HUB host would 404.
 */
async function resolveContactHref(params: {
  isTenant: boolean;
  hostKind: string;
  tenantId: string;
  locale: string;
  contactEmail: string | null;
}): Promise<string> {
  const platformContact = `${getSiteUrl()}/about`;
  if (!params.isTenant || params.hostKind !== "agency") return platformContact;

  const contactPage = await loadPublicPageBySlug(
    params.tenantId,
    params.locale,
    "contact",
  ).catch(() => null);
  if (contactPage) {
    // Non-default locales are served under a `/<locale>` prefix on the tenant's
    // own host (same rule as `withLocalePath`), so a Spanish visitor must get
    // `/es/contact`. Linking the bare path from `/es/login` would bounce
    // through the proxy's locale canonicalization instead of landing directly.
    const localeSettings = await loadTenantLocaleSettings(params.tenantId).catch(
      () => null,
    );
    const tenantDefaultLocale = localeSettings?.defaultLocale ?? "en";
    return params.locale && params.locale !== tenantDefaultLocale
      ? `/${params.locale}/contact`
      : "/contact";
  }

  const email = params.contactEmail?.trim();
  if (email && email.includes("@")) return `mailto:${email}`;

  return platformContact;
}

/**
 * Auth Shell v2 — see `auth-shell-chrome.tsx` for the layout contract and
 * `web/docs/auth-shell-domain-architecture-2026-08-07.md` §4 for the ruling.
 *
 * Resolve the brand identity to render in the auth chrome.
 *
 * Registration and sign-in are Tulala-platform surfaces by default — everyone
 * signs into the same platform. The tenant's own brand only takes over when the
 * agency is on a whitelabel tier (Agency / Network): then a talent or client
 * signing in on that agency's host sees the agency brand, not Tulala.
 *
 * - On a WHITELABEL agency/hub host, show the tenant's `public_name` (falling
 *   back to the platform brand if it hasn't been set yet, so the wordmark is
 *   never a stale constant from another tenant), its real uploaded logo, and
 *   its own tagline.
 * - On a non-whitelabel agency/hub host, and on app / marketing / unknown
 *   hosts, show the platform brand (Tulala) with the marketing hero's proof
 *   chips.
 *
 * Every read here is `.catch(() => …)`-guarded: the brand panel is decoration,
 * and a branding read failure must never take the sign-in form down with it.
 */
async function resolveAuthBrand(
  locale: string,
  t: ReturnType<typeof createTranslator>,
): Promise<AuthShellResolution> {
  const copy = getMarketingCopy(locale);
  const ctx = await getPublicHostContext();

  if (ctx.kind === "agency" || ctx.kind === "hub") {
    const [identity, whitelabel] = await Promise.all([
      loadPublicIdentity(ctx.tenantId).catch(() => null),
      loadTenantWhitelabel(ctx.tenantId).catch(() => false),
    ]);
    if (whitelabel) {
      const label = identity?.public_name?.trim() || PLATFORM_BRAND.name;
      // Same resolver the storefront header/footer use, so the auth chrome
      // shows the tenant's REAL logo rather than a bare text wordmark. A talent
      // arrives here from a fully-branded email and storefront; a text-only
      // header read as "some other site" (owner feedback, 2026-08-06 claim-flow
      // QA). Null → letterspaced wordmark fallback.
      const [logoUrl, accent, contactHref] = await Promise.all([
        resolveShellBrandLogoUrl({ tenantId: ctx.tenantId }).catch(() => null),
        resolveTenantAccent(ctx.tenantId).catch(() => null),
        resolveContactHref({
          isTenant: true,
          hostKind: ctx.kind,
          tenantId: ctx.tenantId,
          locale,
          contactEmail: identity?.contact_email ?? null,
        }).catch(() => `${getSiteUrl()}/about`),
      ]);
      const tagline =
        identity?.tagline?.trim() || identity?.footer_tagline?.trim() || null;
      return {
        brand: {
          label,
          isTenant: true,
          logoUrl,
          accent,
          tagline,
          // The agency's own tagline rides the lockup (panel eyebrow + footer);
          // the heading stays a neutral member-access line that is true for
          // talent AND clients, both of whom sign in here. Using the tagline as
          // the heading printed it twice on the panel.
          panelHeading: t("public.auth.shell.tenantHeading"),
          panelLead: t("public.auth.shell.tenantLead").replace("{brand}", label),
          // Account-level facts, NOT agency claims — see `panelPoints` on
          // `AuthShellBrand`. Every line here is true of the Tulala account the
          // visitor is signing into, for talent and clients alike, so nothing
          // is asserted on the agency's behalf. They exist because the panel
          // was otherwise half empty (B5).
          panelPoints: [
            t("public.auth.shell.tenantPoints.roles"),
            t("public.auth.shell.tenantPoints.thread"),
            t("public.auth.shell.tenantPoints.secure"),
          ],
          // Still no proof chips on a tenant brand: the mobile top bar stays a
          // compact lockup, and we do not make claims on an agency's behalf.
          proofChips: [],
          backLabel: t("public.auth.shell.back").replace("{site}", label),
        },
        contactHref,
      };
    }
  }

  return {
    brand: {
      label: PLATFORM_BRAND.name,
      isTenant: false,
      logoUrl: null,
      // Platform gradient is the marketing hero's; it takes no tenant accent.
      accent: null,
      tagline: copy.brand.descriptor,
      panelHeading: copy.hero.titleLine1,
      panelLead: copy.footer.description,
      // The exact three chips the marketing hero shows, from the same copy keys,
      // in BOTH slots: panel bullets and mobile top bar (unchanged behaviour).
      panelPoints: copy.hero.trust,
      proofChips: copy.hero.trust,
      backLabel: t("public.auth.shell.back").replace(
        "{site}",
        PLATFORM_BRAND.name,
      ),
    },
    contactHref: `${getSiteUrl()}/about`,
  };
}

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [locale, ctx, h] = await Promise.all([
    getRequestLocale(),
    getPublicHostContext(),
    headers(),
  ]);
  const t = createTranslator(locale);
  const { brand, contactHref } = await resolveAuthBrand(locale, t);

  // For agency/hub hosts: use the tenant's locale settings.
  // For platform/marketing hosts: `loadTenantLocaleSettings("")` returns the
  // platform fallback (single "en", switcher hidden) — the footer still renders
  // a toggle via `AuthLanguageToggle`, which hides itself when
  // `supportedLocales.length <= 1`, so no toggle shows on the platform host.
  const localeSettings =
    ctx.kind === "agency" || ctx.kind === "hub"
      ? await loadTenantLocaleSettings(ctx.tenantId)
      : await loadTenantLocaleSettings("");
  const originalPath = h.get(ORIGINAL_PATHNAME_HEADER) ?? "/";
  const { pathnameWithoutLocale } = stripLocaleFromPathname(originalPath);

  // On a whitelabel agency host the footer carries the agency's name; otherwise
  // it stays the Tulala platform line — the same copyright rail the marketing
  // footer uses (legal name + localized positioning).
  const brandLine = brand.isTenant
    ? `© ${new Date().getFullYear()} ${brand.label}.`
    : `© ${new Date().getFullYear()} ${PLATFORM_BRAND.legalName}. ${getMarketingCopy(locale).footer.legalLine}`;

  return (
    <div
      className="site-theme-platform flex min-h-full flex-1 flex-col"
      data-platform-surface="marketing"
      style={{ background: "var(--plt-bg)" }}
    >
      <div className="flex flex-1 flex-col lg:grid lg:grid-cols-[minmax(0,44%)_minmax(0,56%)] lg:items-start">
        <AuthBrandPanel brand={brand} />

        <div className="flex min-h-full flex-1 flex-col lg:min-h-dvh">
          <AuthTopBar brand={brand} />

          <main className="flex flex-1 flex-col items-center justify-center px-5 py-10 sm:px-8 sm:py-14">
            <div className="w-full max-w-[440px]">{children}</div>
          </main>

          <AuthFooter
            brand={brand}
            brandLine={brandLine}
            legal={{
              terms: t("public.auth.shell.terms"),
              privacy: t("public.auth.shell.privacy"),
              contact: t("public.auth.shell.contact"),
            }}
            contactHref={contactHref}
            languageToggle={
              <AuthLanguageToggle
                activeLocale={locale}
                pathnameWithoutLocale={pathnameWithoutLocale}
                availableLocales={localeSettings.supportedLocales}
                defaultLocale={localeSettings.defaultLocale}
                showLanguageSwitcher={localeSettings.showLanguageSwitcher}
                label={t("public.auth.language")}
              />
            }
          />
        </div>
      </div>
    </div>
  );
}
