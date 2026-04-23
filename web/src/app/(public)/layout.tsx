import { DirectoryInquiryModalProvider } from "@/components/directory/directory-inquiry-modal-context";
import { DirectoryInquirySheet } from "@/components/directory/directory-inquiry-sheet";
import { PublicDiscoveryStateProvider } from "@/components/directory/public-discovery-state";
import { PublicFlashHost } from "@/components/directory/public-flash-host";
import { buildDirectoryUiCopy } from "@/lib/directory/directory-ui-copy";
import { createTranslator } from "@/i18n/messages";
import { getRequestLocale } from "@/i18n/request-locale";
import { getPublicHostContext } from "@/lib/saas/scope";
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

  return (
    <div className="flex min-h-full flex-1 flex-col bg-background">
      <PublicDiscoveryStateProvider>
        <DirectoryInquiryModalProvider>
          <PublicFlashHost dismissAria={dismissFlashAria} />
          {children}
          <DirectoryInquirySheet ui={directoryUi} locale={locale} />
        </DirectoryInquiryModalProvider>
      </PublicDiscoveryStateProvider>
    </div>
  );
}
