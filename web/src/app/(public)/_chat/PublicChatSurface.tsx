/**
 * PublicChatSurface — the public discovery/inquiry provider stack + guest-chat
 * launcher, as a standalone wrapper.
 *
 * WHY THIS EXISTS: routes under `app/(public)/` inherit these providers from
 * `(public)/layout.tsx`. The AGENCY HOME is NOT one of them — it is served by
 * `app/page.tsx` (the route-group root, outside `(public)/`), which renders the
 * builder-authored home through `CmsPublicPage` with no layout wrapper. So a
 * builder home had neither the launcher nor the discovery/inquiry providers its
 * embedded roster/favorites UI + the launcher's cart rely on.
 *
 * This mirrors `(public)/layout.tsx` exactly (same provider order, same SSR seed
 * reads, same modal hosts) and adds the floating launcher, so the builder home
 * reaches full parity with the legacy `AgencyHomeStorefront`. Reuse it anywhere
 * a public surface renders OUTSIDE the `(public)` layout and needs the launcher.
 *
 * DOUBLE-MOUNT GUARD: only use this for surfaces that are NOT already under
 * `(public)/layout.tsx` (which supplies the same providers) and that do not
 * already mount the launcher themselves. The builder home (app/page.tsx) is the
 * intended caller.
 */

import { MergeGuestFavorites } from "@/components/client/merge-guest-favorites";
import { DirectoryInquiryModalProvider } from "@/components/directory/directory-inquiry-modal-context";
import { DirectoryInquirySheet } from "@/components/directory/directory-inquiry-sheet";
import { FavoritesModal } from "@/components/directory/favorites-modal";
import { FavoritesDrawerProvider } from "@/components/directory/favorites-drawer-context";
import {
  DiscoveryStateBridge,
  PublicDiscoveryStateProvider,
} from "@/components/directory/public-discovery-state";
import { PublicFlashHost } from "@/components/directory/public-flash-host";
import { buildDirectoryUiCopy } from "@/lib/directory/directory-ui-copy";
import { createTranslator } from "@/i18n/messages";
import { getRequestLocale } from "@/i18n/request-locale";
import { getPublicHostContext } from "@/lib/saas/scope";
import {
  getFavoriteTalentIds,
  getSavedTalentIds,
} from "@/lib/public-discovery";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { loadPublicBranding, loadPublicIdentity } from "@/lib/site-admin/server/reads";
import { AgencyChatLauncherMount } from "@/app/(public)/_chat/AgencyChatLauncherMount";

export async function PublicChatSurface({
  children,
  sourcePage,
}: {
  children: React.ReactNode;
  /** Attribution + per-surface gate for the launcher ("/" for the home). */
  sourcePage: string;
}) {
  const locale = await getRequestLocale();
  const t = createTranslator(locale);
  const dismissFlashAria = t("public.directory.ui.flash.dismissAria");

  const ctx = await getPublicHostContext();
  const tenantId =
    ctx.kind === "agency" || ctx.kind === "hub" ? ctx.tenantId : null;

  const tenantBrand = tenantId
    ? (await loadPublicIdentity(tenantId))?.public_name ?? null
    : null;
  const directoryUi = buildDirectoryUiCopy(t, tenantBrand);

  const [savedIds, favoriteIds, actor, publicBranding] = await Promise.all([
    getSavedTalentIds(),
    getFavoriteTalentIds(),
    getCachedActorSession(),
    tenantId ? loadPublicBranding(tenantId) : Promise.resolve(null),
  ]);

  const favoriteIcon = publicBranding?.favorite_icon ?? "bookmark";

  return (
    <PublicDiscoveryStateProvider
      initialSavedIds={savedIds}
      initialFavoriteIds={favoriteIds}
    >
      <DiscoveryStateBridge
        savedIds={savedIds}
        favoriteIds={favoriteIds}
        favoriteIcon={favoriteIcon}
      />
      {actor.user ? <MergeGuestFavorites serverFavoriteIds={favoriteIds} /> : null}
      <DirectoryInquiryModalProvider>
        <FavoritesDrawerProvider>
          <PublicFlashHost dismissAria={dismissFlashAria} />
          {children}
          <DirectoryInquirySheet ui={directoryUi} locale={locale} />
          <FavoritesModal
            signupHref="/login"
            locale={locale}
            initialFavoriteIdsCount={favoriteIds.length}
            isAuthenticated={Boolean(actor.user)}
          />
          {/* Floating "Message {agency}" launcher — self-gates on the tenant's
              guest-chat settings (enabled + the per-surface flag for sourcePage). */}
          <AgencyChatLauncherMount sourcePage={sourcePage} />
        </FavoritesDrawerProvider>
      </DirectoryInquiryModalProvider>
    </PublicDiscoveryStateProvider>
  );
}
