import type { ReactNode } from "react";

import type { AccountPreviewMode } from "@/lib/client-account/account-preview";
import { HeaderAccountItem } from "./HeaderAccountItem";
import type { headerItemAttrs } from "./header-site-chrome";

type Attrs = ReturnType<typeof headerItemAttrs>;

/** Static sample of the account button for the Builder Lab canvas (no popover, no fetch). */
function HeaderAccountPreview({ attrs, signedIn }: { attrs: Attrs; signedIn: boolean }) {
  return (
    <div {...attrs} className="site-header__ritem site-header__account" data-account-preview={signedIn ? "signed-in" : "signed-out"}>
      <span
        aria-hidden
        style={{ width: 44, height: 44, borderRadius: 999, border: "1px solid var(--token-color-line, rgba(0,0,0,.14))", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 600 }}
      >
        {signedIn ? "AB" : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="8" r="4" /><path d="M4 20c1.5-3.5 4.5-5 8-5s6.5 1.5 8 5" /></svg>
        )}
      </span>
    </div>
  );
}

export function renderAccountItem(mode: AccountPreviewMode, key: string, attrs: Attrs, locale: string): ReactNode {
  if (mode === "off") return null;
  if (mode === "live") return <HeaderAccountItem key={key} attrs={attrs} locale={locale} />;
  return <HeaderAccountPreview key={key} attrs={attrs} signedIn={mode === "signed-in"} />;
}
