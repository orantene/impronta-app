import { ClientAccountButton } from "@/components/client-account/ClientAccountButton";
import { isAppleAuthProviderEnabled } from "@/lib/auth/apple-provider-flag";

import type { headerItemAttrs } from "./header-site-chrome";

/**
 * Header `account` item (TUL-61). Rendered only when the host flag put `account`
 * on siteChrome; the caller decides. Kept out of Component.tsx (800-line cap).
 */
export function HeaderAccountItem({ attrs, locale }: { attrs: ReturnType<typeof headerItemAttrs>; locale: string }) {
  return (
    <div {...attrs} className="site-header__ritem site-header__account">
      <ClientAccountButton
        variant="header"
        locale={locale}
        appleSignInEnabled={isAppleAuthProviderEnabled()}
      />
    </div>
  );
}
