import Link from "next/link";
import { PLATFORM_BRAND } from "@/lib/platform/brand";
import { TulalaWordmark } from "@/components/brand/tulala-logo";

/**
 * "Powered by tulala." — the Tulala-on-tenant mark.
 *
 * Rendered in tenant storefront footers (agency home, profile pages, CMS
 * pages, posts, directory) as a discrete link back to the SaaS brand. Uses
 * the canonical monoline wordmark from `@/components/brand/tulala-logo`.
 *
 * Not scoped to `data-platform-surface="marketing"` on purpose — this is
 * the only piece of Tulala chrome that lives on a tenant's own surface,
 * and it needs to inherit whatever the tenant's neutral text color is so
 * it doesn't clash with their theme (letter strokes ride `currentColor`).
 * The full-stop stays forest rather than brand orange so it never fights
 * a tenant's own accent palette.
 */
export function PoweredByTulala({ className }: { className?: string }) {
  return (
    <Link
      href={`https://${PLATFORM_BRAND.domain}`}
      target="_blank"
      rel="noopener"
      className={`inline-flex items-center gap-1.5 text-[0.75rem] tracking-[0.02em] opacity-70 transition-opacity hover:opacity-100 ${className ?? ""}`}
      aria-label={`Powered by ${PLATFORM_BRAND.name} — ${PLATFORM_BRAND.tagline}`}
    >
      <span className="font-mono text-[0.625rem] uppercase tracking-[0.24em]">
        Powered by
      </span>
      <TulalaWordmark height={13} dotColor="#1E3A2D" className="translate-y-[0.5px]" />
    </Link>
  );
}
