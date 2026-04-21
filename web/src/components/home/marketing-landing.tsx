import { MarketingHomePage } from "@/components/marketing/home-page";
import { MarketingShell } from "@/components/marketing/shell";

/**
 * Root page for `kind === "marketing"` — the product-sales surface.
 *
 * Renders the composed editorial homepage (hero → contrast → steps →
 * trust → audiences → features → tour → network → pricing → faq →
 * final cta) inside the marketing shell. The shell owns the scoped
 * design tokens (`data-platform-surface="marketing"`), header, and
 * footer — so tokens never leak into agency / hub / app surfaces.
 */
export function MarketingLanding() {
  return (
    <MarketingShell>
      <MarketingHomePage />
    </MarketingShell>
  );
}
