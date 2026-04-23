import Link from "next/link";
import { PLATFORM_BRAND } from "@/lib/platform/brand";

/**
 * "Powered by tulala." — the Tulala-on-tenant mark.
 *
 * Rendered in tenant storefront footers (agency home, profile pages, CMS
 * pages, posts, directory) as a discrete link back to the SaaS brand. The
 * wordmark is lowercase Fraunces with a forest-toned full-stop, matching
 * the marketing-site treatment so the mark reads the same everywhere.
 *
 * Not scoped to `data-platform-surface="marketing"` on purpose — this is
 * the only piece of Tulala chrome that lives on a tenant's own surface,
 * and it needs to inherit whatever the tenant's neutral text color is so
 * it doesn't clash with their theme. Only the "tulala." wordmark picks
 * up the brand accent for the period.
 */
export function PoweredByTulala({ className }: { className?: string }) {
  return (
    <Link
      href={`https://${PLATFORM_BRAND.domain}`}
      target="_blank"
      rel="noopener"
      className={`inline-flex items-baseline gap-1.5 text-[0.75rem] tracking-[0.02em] opacity-70 transition-opacity hover:opacity-100 ${className ?? ""}`}
      aria-label={`Powered by ${PLATFORM_BRAND.name} — ${PLATFORM_BRAND.tagline}`}
    >
      <span className="font-mono text-[0.625rem] uppercase tracking-[0.24em]">
        Powered by
      </span>
      <span
        aria-hidden
        className="inline-flex items-baseline leading-none"
        style={{
          fontFamily: "var(--font-geist-sans), ui-sans-serif, system-ui, -apple-system, sans-serif",
          fontWeight: 700,
          fontSize: "0.9375rem",
          letterSpacing: "-0.045em",
        }}
      >
        tulala
        <span style={{ color: "#1E3A2D" }}>.</span>
      </span>
    </Link>
  );
}
