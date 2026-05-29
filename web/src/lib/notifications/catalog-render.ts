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

/**
 * Format integer minor units (cents) + an ISO-4217 code as a display amount,
 * e.g. (225000, "eur") → "EUR 2,250.00". Returns "" for a missing/non-finite
 * amount so the template's FieldTable row drops out (no "undefined" / "NaN").
 */
export function formatMoneyCents(
  cents: number | null | undefined,
  currency: string | null | undefined,
): string {
  if (cents == null || !Number.isFinite(cents)) return "";
  const amount = (cents / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const code = (currency ?? "").trim().toUpperCase();
  return code ? `${code} ${amount}` : amount;
}

/** Title-case a plan tier key for display ("agency" → "Agency"). */
const PLAN_LABELS: Record<string, string> = {
  free: "Free",
  studio: "Studio",
  agency: "Agency",
  network: "Network",
};
export function planLabel(plan: string | null | undefined): string {
  if (!plan) return "";
  return PLAN_LABELS[plan.trim().toLowerCase()] ?? plan;
}
