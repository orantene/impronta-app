/**
 * A11Y-2 — Shared "Skip to content" landmark link.
 *
 * Renders as the FIRST focusable element on every public surface so keyboard
 * and screen-reader users can skip past repeated navigation to the main content
 * landmark. Visually hidden by default; becomes visible on keyboard focus via
 * the Tailwind `focus:not-sr-only` pattern.
 *
 * Usage:
 *   Place <SkipToContent /> as the first child inside the outermost public
 *   layout wrapper, BEFORE any header/nav. The matching `id="main-content"` on
 *   the <main> element must exist on the same page for the anchor to work.
 *
 * All four public surfaces adopt the same component:
 *   - Storefront CMS pages  (/p/[[...slug]])
 *   - Agency homepage       (agency-home-storefront.tsx)
 *   - Talent profile        (/t/[profileCode]/page.tsx)
 *   - Talent Max site       (render-max-site.tsx — both /t/site and /_talent-site)
 */
export function SkipToContent() {
  return (
    <a
      href="#main-content"
      className={[
        // Hidden until focused
        "sr-only",
        // Visible on keyboard focus — absolute positioned to top-left
        "focus:not-sr-only",
        "focus:absolute",
        "focus:left-4",
        "focus:top-4",
        "focus:z-[9999]",
        // Chip appearance — on-brand but minimal (no gold/rust per admin-aesthetics)
        "focus:inline-flex",
        "focus:items-center",
        "focus:rounded-md",
        "focus:bg-white",
        "focus:px-4",
        "focus:py-2",
        "focus:text-sm",
        "focus:font-medium",
        "focus:text-foreground",
        "focus:shadow-md",
        "focus:ring-2",
        "focus:ring-ring",
        "focus:outline-none",
      ].join(" ")}
    >
      Skip to content
    </a>
  );
}
