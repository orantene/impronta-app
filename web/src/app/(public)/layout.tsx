import type { Metadata } from "next";
import { MergeGuestFavorites } from "@/components/client/merge-guest-favorites";
import { DirectoryInquiryModalProvider } from "@/components/directory/directory-inquiry-modal-context";
import { DirectoryInquirySheet } from "@/components/directory/directory-inquiry-sheet";
import { FavoritesModal } from "@/components/directory/favorites-modal";
import { FavoritesDrawerProvider } from "@/components/directory/favorites-drawer-context";
import { PublicDiscoveryStateProvider } from "@/components/directory/public-discovery-state";
import { PublicFlashHost } from "@/components/directory/public-flash-host";
import { DiscoveryStateBridge } from "@/components/directory/public-discovery-state";
import { buildDirectoryUiCopy } from "@/lib/directory/directory-ui-copy";
import { createTranslator } from "@/i18n/messages";
import { getRequestLocale } from "@/i18n/request-locale";
import { getPublicHostContext } from "@/lib/saas/scope";
import { resolveTenantSiteVerification } from "@/lib/integrations/site-verification-resolver";
import {
  getFavoriteTalentIds,
  getSavedTalentIds,
} from "@/lib/public-discovery";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { loadPublicBranding, loadPublicIdentity } from "@/lib/site-admin/server/reads";
import { storefrontShowsTalentDiscovery } from "@/lib/saas/storefront-discovery";

/**
 * Per-tenant title template. The ROOT layout sets `%s · Tulala`; on a tenant
 * storefront that suffix leaks the SaaS brand onto the agency's own pages
 * (live example: "Contact · Tulala", "Contacto · Tulala" on improntamodels.com).
 * Override the template here with the tenant's `public_name` so every
 * storefront page reads "… · {Agency}". Non-tenant hosts (marketing/app) return
 * `{}` and keep the platform default — byte-identical behavior off-tenant.
 */
export async function generateMetadata(): Promise<Metadata> {
  const ctx = await getPublicHostContext();
  const isTenant = ctx.kind === "agency" || ctx.kind === "hub";
  if (!isTenant) return {};

  // Resolve brand (title suffix) and the tenant's Search Console token in
  // parallel. The token is emitted as a real <meta name="google-site-
  // verification"> in the storefront <head>; being defined here, it overrides
  // the root layout's platform token on tenant hosts (Next merges metadata
  // child-over-parent), so each storefront can prove its own ownership.
  const [identity, verification] = await Promise.all([
    loadPublicIdentity(ctx.tenantId),
    resolveTenantSiteVerification(ctx.tenantId),
  ]);
  const tenantBrand = identity?.public_name?.trim() || null;

  const metadata: Metadata = {};
  if (tenantBrand) {
    metadata.title = { template: `%s · ${tenantBrand}`, default: tenantBrand };
  }
  if (verification.googleToken) {
    metadata.verification = { google: verification.googleToken };
  }
  return metadata;
}

export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getRequestLocale();
  const t = createTranslator(locale);
  const dismissFlashAria = t("public.directory.ui.flash.dismissAria");
  // Tenant-aware brand: directory cards / inquiry sheet show the tenant's
  // `public_name` instead of the platform-neutral i18n fallback.
  const ctx = await getPublicHostContext();
  const tenantBrand =
    ctx.kind === "agency" || ctx.kind === "hub"
      ? (await loadPublicIdentity(ctx.tenantId))?.public_name ?? null
      : null;
  const directoryUi = buildDirectoryUiCopy(t, tenantBrand);

  // SSR seed both lists so the bookmark+plane badges in the header render
  // with the right counts on first paint (no flicker from 0 → N).
  const tenantId =
    ctx.kind === "agency" || ctx.kind === "hub" ? ctx.tenantId : null;

  const [rawSavedIds, rawFavoriteIds, actor, publicBranding, talentDiscoveryEnabled] =
    await Promise.all([
      getSavedTalentIds(),
      getFavoriteTalentIds(),
      getCachedActorSession(),
      tenantId ? loadPublicBranding(tenantId) : Promise.resolve(null),
      storefrontShowsTalentDiscovery(tenantId),
    ]);

  // A `business` storefront seeds NOTHING. These lists are keyed on
  // `client_user_id` with no tenant column, so seeding them here is what put a
  // visitor's saved talent from an agency onto a restaurant's page with a live
  // count. Empty is not cosmetic: the counts are what made it look real.
  const savedIds = talentDiscoveryEnabled ? rawSavedIds : [];
  const favoriteIds = talentDiscoveryEnabled ? rawFavoriteIds : [];

  const favoriteIcon = publicBranding?.favorite_icon ?? "bookmark";

  return (
    <div className="flex min-h-full flex-1 flex-col bg-background">
      <PublicDiscoveryStateProvider
        initialSavedIds={savedIds}
        initialFavoriteIds={favoriteIds}
        talentDiscoveryEnabled={talentDiscoveryEnabled}
      >
        <DiscoveryStateBridge savedIds={savedIds} favoriteIds={favoriteIds} favoriteIcon={favoriteIcon} />
        {/* Runs once per session for authed visitors — sweeps any guest-mode
            cart + inquiries + localStorage favorites into the authed account. */}
        {actor.user ? <MergeGuestFavorites serverFavoriteIds={favoriteIds} /> : null}
        <DirectoryInquiryModalProvider>
          <FavoritesDrawerProvider>
            <PublicFlashHost dismissAria={dismissFlashAria} />
            {children}
            {/* Talent-only surfaces. The providers stay mounted so any child
                hook keeps working; only the talent UI goes. */}
            {talentDiscoveryEnabled ? (
              <>
                <DirectoryInquirySheet ui={directoryUi} locale={locale} />
                <FavoritesModal
                  signupHref="/login"
                  locale={locale}
                  initialFavoriteIdsCount={favoriteIds.length}
                  isAuthenticated={Boolean(actor.user)}
                />
              </>
            ) : null}
          </FavoritesDrawerProvider>
        </DirectoryInquiryModalProvider>
      </PublicDiscoveryStateProvider>
    </div>
  );
}
