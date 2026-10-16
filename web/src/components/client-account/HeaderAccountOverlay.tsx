import { ClientAccountButton } from "@/components/client-account/ClientAccountButton";
import { isAppleAuthProviderEnabled } from "@/lib/auth/apple-provider-flag";

/**
 * The shared account slot for container-style theme headers (Gridline, the legacy kits),
 * which have no `site_header` regions to hold the `account` item (TUL-694). Same button,
 * pinned to the header's end edge; the header wrapper is the positioning context.
 */
export function HeaderAccountOverlay({ locale }: { locale: string }) {
  return (
    <div data-client-account-header-slot="" style={{ position: "absolute", insetBlock: 0, insetInlineEnd: 8, display: "flex", alignItems: "center", zIndex: 5 }}>
      <ClientAccountButton variant="header" locale={locale} appleSignInEnabled={isAppleAuthProviderEnabled()} />
    </div>
  );
}
