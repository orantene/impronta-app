import { DirectoryInquiryModalProvider } from "@/components/directory/directory-inquiry-modal-context";
import { DirectoryInquirySheet } from "@/components/directory/directory-inquiry-sheet";
import { PublicDiscoveryStateProvider } from "@/components/directory/public-discovery-state";
import { PublicFlashHost } from "@/components/directory/public-flash-host";
import { buildDirectoryUiCopy } from "@/lib/directory/directory-ui-copy";
import { createTranslator } from "@/i18n/messages";
import { getRequestLocale } from "@/i18n/request-locale";

export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getRequestLocale();
  const t = createTranslator(locale);
  const dismissFlashAria = t("public.directory.ui.flash.dismissAria");
  const directoryUi = buildDirectoryUiCopy(t);

  return (
    <PublicDiscoveryStateProvider>
      <DirectoryInquiryModalProvider>
        <PublicFlashHost dismissAria={dismissFlashAria} />
        {children}
        <DirectoryInquirySheet ui={directoryUi} locale={locale} />
      </DirectoryInquiryModalProvider>
    </PublicDiscoveryStateProvider>
  );
}
