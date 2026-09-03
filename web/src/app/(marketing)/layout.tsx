import { MarketingShell } from "@/components/marketing/shell";
import { DirectoryInquiryModalProvider } from "@/components/directory/directory-inquiry-modal-context";

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
 *
 * ─── WHY DirectoryInquiryModalProvider IS HERE ──────────────────────────────
 *
 * SEV-1, 2026-09-03. Pages in this group render `AgencyChatLauncherMount`,
 * which renders `DirectoryInquiryUrlSync`, which calls
 * `useDirectoryInquiryModal`. That hook throws when no provider is above it.
 * `(public)/layout.tsx` mounts the provider; this group mounted nothing, so
 * every affected page threw ON HYDRATION and the error boundary painted
 *
 *     "Something went wrong. Please try again. If this keeps happening,
 *      the agency may need to check configuration."
 *
 * over a page whose HTML had already been delivered correctly.
 *
 * That shape is why it survived: the server response is perfect, so curl is
 * perfect, `deploy:smoke` is perfect, and a crawler that does not execute
 * JavaScript sees a perfect page with a correct SEO title. The only observer
 * that ever saw the failure was a human with a browser. Reproduced on
 * production at `/w/ines-oussaifi-studio` (3 of 3 loads) and
 * `/global-directory`.
 *
 * The blast radius was not one page. Path-based tenant storefronts
 * (`/w/<slug>`) resolve through this group, while host-based ones
 * (`improntamodels.com`) resolve through `(public)` — so every path-based
 * tenant's storefront was a coin flip between their site and an apology that
 * blamed them for a configuration problem, which is exactly where newly
 * onboarded businesses land.
 *
 * SCOPE OF THIS FIX, deliberately narrow. The provider takes no props and does
 * no I/O, so mounting it costs nothing on marketing pages that never open an
 * inquiry. It stops the crash. It does NOT restore the inquiry SHEET, which
 * additionally requires `PublicDiscoveryStateProvider` and per-visitor
 * saved/favorite reads — two queries this group should not levy on /pricing,
 * /faq and /legal/*. Pages that want the sheet mount it themselves alongside
 * the discovery-state provider they already have (`/global-directory` does).
 *
 * FOLLOW-UP, not done here on purpose: whether a path-based tenant storefront
 * belongs in `(marketing)` at all. It probably does not — it is a tenant
 * surface wearing a marketing group's clothes — but moving it has routing and
 * SEO consequences and is not a change to make while onboarding is live.
 * Raised with Workspace & Dashboards, who own the route-group boundary.
 *
 * The guard that catches this class lives in
 * `e2e/hydration-error-boundary.spec.ts`: it EXECUTES the page and asserts the
 * error boundary is absent, because nothing that reads a server response can
 * ever see this.
 */
export default function MarketingRouteGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <DirectoryInquiryModalProvider>
      <MarketingShell>{children}</MarketingShell>
    </DirectoryInquiryModalProvider>
  );
}
