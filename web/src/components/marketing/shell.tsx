import { MarketingHeader } from "./header";
import { MarketingFooter } from "./footer";

/**
 * The outer layout for every platform marketing surface (homepage + sub-pages).
 *
 * Wraps content in `data-platform-surface="marketing"` so the Rostra platform
 * design tokens and typography (see globals.css) apply inside this subtree
 * only — never leaking into tenant storefronts or workspace chrome.
 */
export function MarketingShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      data-platform-surface="marketing"
      className="flex min-h-screen flex-col"
      style={{ background: "var(--plt-bg)", color: "var(--plt-ink)" }}
    >
      <MarketingHeader />
      <main className="flex-1 pt-[var(--plt-header-h,64px)] sm:pt-[72px]">{children}</main>
      <MarketingFooter />
    </div>
  );
}
