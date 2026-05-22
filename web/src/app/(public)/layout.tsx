import { MergeGuestFavorites } from "@/components/client/merge-guest-favorites";
import { DirectoryInquiryModalProvider } from "@/components/directory/directory-inquiry-modal-context";
import { DirectoryInquirySheet } from "@/components/directory/directory-inquiry-sheet";
import { FavoritesDrawer } from "@/components/directory/favorites-drawer";
import { FavoritesDrawerProvider } from "@/components/directory/favorites-drawer-context";
import { PublicDiscoveryStateProvider } from "@/components/directory/public-discovery-state";
import { PublicFlashHost } from "@/components/directory/public-flash-host";
import { DiscoveryStateBridge } from "@/components/directory/public-discovery-state";
import { buildDirectoryUiCopy } from "@/lib/directory/directory-ui-copy";
import { createTranslator } from "@/i18n/messages";
import { getRequestLocale } from "@/i18n/request-locale";
import { getPublicHostContext } from "@/lib/saas/scope";
import {
  getFavoriteTalentIds,
  getSavedTalentIds,
} from "@/lib/public-discovery";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { loadPublicIdentity } from "@/lib/site-admin/server/reads";

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
  const [savedIds, favoriteIds, actor] = await Promise.all([
    getSavedTalentIds(),
    getFavoriteTalentIds(),
    getCachedActorSession(),
  ]);

  return (
    <div className="flex min-h-full flex-1 flex-col bg-background">
      <PublicDiscoveryStateProvider>
        <DiscoveryStateBridge savedIds={savedIds} favoriteIds={favoriteIds} />
        {/* Runs once per session for authed visitors — sweeps any guest-mode
            cart + inquiries + localStorage favorites into the authed account. */}
        {actor.user ? <MergeGuestFavorites serverFavoriteIds={favoriteIds} /> : null}
        <DirectoryInquiryModalProvider>
          <FavoritesDrawerProvider>
            <PublicFlashHost dismissAria={dismissFlashAria} />
            {children}
            <DirectoryInquirySheet ui={directoryUi} locale={locale} />
            <FavoritesDrawer signupHref="/login" />
          </FavoritesDrawerProvider>
        </DirectoryInquiryModalProvider>
      </PublicDiscoveryStateProvider>
    </div>
  );
}
