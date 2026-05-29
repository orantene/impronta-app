import "server-only";

import type { EmailBrand } from "@/lib/brand/resolve-tenant-brand";

/**
 * Render-only helpers for the notification catalog — URL + date formatting
 * shared by the catalog entries (now split across `catalog.ts` and
 * `catalog-entries-*.ts`). Kept dependency-light (only the `EmailBrand` type)
 * so every entry module can import them without pulling in the registry.
 */

/**
 * Build an absolute URL on the recipient's branded host. `brand.homeHref` is
 * the agency's primary custom domain when set (tenant resolved from host →
 * bare paths work), else the platform site URL.
 */
export function pageUrl(brand: EmailBrand, path: string): string {
  return `${brand.homeHref.replace(/\/$/, "")}${path}`;
}

/**
 * Resolve a redeem target to an absolute URL: pass an absolute URL through,
 * else hang a bare path off the recipient's branded host. Mirrors the legacy
 * `href = redeemUrl.startsWith("http") ? redeemUrl : siteUrl()+redeemUrl`
 * behaviour the direct-send helpers used.
 */
export function redeemHref(brand: EmailBrand, target: string): string {
  return target.startsWith("http") ? target : pageUrl(brand, target);
}

/** Format an ISO timestamp as a short "5 Jun 2026" label, or undefined. */
export function formatDateLabel(iso: string | null): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
