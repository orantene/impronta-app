import { MarketingShell } from "@/components/marketing/shell";

/**
 * Route group layout for all non-homepage marketing surfaces.
 *
 * The homepage (`/`) at `src/app/page.tsx` dispatches by host-kind and
 * renders `MarketingLanding` (which wraps its own shell), so it sits
 * outside this route group. Every other marketing page — /get-started,
 * /operators, /agencies, /how-it-works, /pricing, /faq, /legal/* — lives
 * inside `(marketing)` and inherits this shell (scoped tokens, header,
 * footer) automatically.
 *
 * Access is gated by `surface-allow-list.ts` at the middleware layer:
 * these paths only resolve on `kind="marketing"` hosts. On
 * agency/hub/app hosts they return 404 before reaching this layout.
 */
export default function MarketingRouteGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <MarketingShell>{children}</MarketingShell>;
}
