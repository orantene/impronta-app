import "server-only";

import { getAppUrl } from "@/lib/auth-flow";
import type { EmailBrand } from "@/lib/brand/resolve-tenant-brand";
import { PLAN_TIER_LABEL, isWorkspacePlanTier } from "@/lib/platform/plan-override";
import type { RecipientRole } from "./types";

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
 * Build an absolute URL on the app host (dashboard / messages surfaces).
 * Marketing-host links 404 on `/client/*`; transactional CTAs must land here.
 */
export function appPageUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${getAppUrl().replace(/\/$/, "")}${normalized}`;
}

/**
 * Map a recipient role → the inquiry/thread route that role can actually open.
 * Each role's inquiry surface lives at a DIFFERENT path; getting this wrong
 * yields a 404 deep-link (talent has NO `/talent/inquiries/{id}` route — theirs
 * is `/talent/inbox/{id}`; staff use `/admin/work/{id}`). Use this everywhere a
 * notification builds an inquiry CTA so the per-role paths stay correct in one
 * place instead of re-deriving (and re-breaking) them per call site.
 */
export function inquiryPathForRole(
  role: RecipientRole | undefined,
  inquiryId: string | null | undefined,
): string {
  // Each role's inquiry surface lives at a different base; a missing id falls
  // back to that role's list rather than building a `/.../null` deep-link.
  const base =
    role === "talent"
      ? "/talent/inbox"
      : role === "workspace_member" || role === "platform_admin"
        ? "/admin/work"
        : "/client/inquiries";
  return inquiryId ? `${base}/${inquiryId}` : base;
}

/**
 * Role-aware deep link with tenant slug when the canonical surface is
 * workspace-scoped (client messages, admin work). Used by digest emails and
 * any CTA that must land on the app host dashboard, not the marketing apex.
 */
export function inquiryDeepLinkForRole(
  role: RecipientRole | undefined,
  inquiryId: string | null | undefined,
  tenantSlug: string | null | undefined,
): string {
  if (role === "client") {
    if (tenantSlug && inquiryId) {
      return `/${tenantSlug}/client/messages?inquiry=${encodeURIComponent(inquiryId)}`;
    }
    if (inquiryId) return `/client/inquiries/${inquiryId}`;
    return tenantSlug ? `/${tenantSlug}/client/messages` : "/client";
  }
  if (role === "workspace_member" || role === "platform_admin") {
    if (tenantSlug && inquiryId) return `/${tenantSlug}/admin/work/${inquiryId}`;
    if (tenantSlug) return `/${tenantSlug}/admin/work`;
    return inquiryPathForRole(role, inquiryId);
  }
  return inquiryPathForRole(role, inquiryId);
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

/** Display label for a plan key. Same table as `PLAN_TIER_LABEL`. */
export function planLabel(plan: string | null | undefined): string {
  if (!plan) return "";
  const key = plan.trim().toLowerCase();
  return isWorkspacePlanTier(key) ? PLAN_TIER_LABEL[key] : plan;
}
