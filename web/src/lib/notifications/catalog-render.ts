import "server-only";

import { getAppUrl } from "@/lib/auth-flow";
import { APP_WORKSPACE_PREFIXES } from "@/lib/saas/path-groups";
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
 * Is this href the platform MARKETING apex (tulala.digital), as opposed to an
 * agency's own domain or the app host?
 *
 * Compared host-only and www-insensitively: the value comes from
 * NEXT_PUBLIC_SITE_URL and from stored domains, and one of them carrying a
 * trailing slash or a www must not change the answer.
 */
function isMarketingHome(href: string): boolean {
  const site = (process.env.NEXT_PUBLIC_SITE_URL ?? "").trim();
  if (!site) return false;
  const host = (u: string) => {
    try {
      return new URL(u).host.replace(/^www\./, "").toLowerCase();
    } catch {
      return "";
    }
  };
  const a = host(href);
  return a !== "" && a === host(site);
}

/**
 * Build an absolute URL on the recipient's branded host — landing on a host
 * that actually serves the path.
 *
 * `brand.homeHref` is the agency's primary custom domain when it has one, and
 * otherwise the platform MARKETING apex. That fallback is where this used to
 * break: the surface allow-list does not serve `workspaces` paths on a
 * marketing host, so `tulala.digital/client/inquiries/<id>` is 404ed by the
 * middleware before the route is ever reached. Verified against production —
 * /client/inquiries, /talent/inbox and /admin/account all return 404 there,
 * while app.tulala.digital redirects them to login with a ?next= back to the
 * page. Exactly one tenant currently has a primary custom domain, so this was
 * the CTA that most recipients got.
 *
 * The same class of bug is already recorded one file over: APP_WORKSPACE_PREFIXES
 * carries a comment explaining that the emailed team-invite link 404ed at the
 * surface gate for this reason. Rather than patch a second call site, the rule
 * lives here, where every catalog entry already goes through.
 *
 * A branded agency host keeps its own domain — those hosts do serve workspace
 * paths, and brand continuity in the link is worth keeping. Only the marketing
 * fallback is redirected to the app host. Public paths (`/`, `/help`, `/login`,
 * storefront pages) are untouched and stay on the brand.
 */
export function pageUrl(brand: EmailBrand, path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const needsAppHost =
    APP_WORKSPACE_PREFIXES.some(
      (prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`),
    ) && isMarketingHome(brand.homeHref);
  const base = needsAppHost ? getAppUrl() : brand.homeHref;
  return `${base.replace(/\/$/, "")}${normalized}`;
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
