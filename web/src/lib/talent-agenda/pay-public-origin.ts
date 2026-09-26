/**
 * Resolve a host that can serve public payment links.
 *
 * Talents work on `app.tulala.digital`, but `/pay` and `/link` are gated to
 * agency/hub hosts only (`surface-allow-list`). Minting with
 * `window.location.origin` therefore hands clients a 404.
 *
 * Prefer the tenant's live branded website domain (subdomain / custom).
 * When none is active, fall back to the platform pay host
 * (`pay.tulala.digital` → `/link/{code}`). Never invent a fake free-site
 * hostname (e.g. `tulala.tulala.digital`) for hub-without-website sellers.
 *
 * Pure helper — no `server-only` imports so unit tests can load it.
 */
import { TULALA_APEX_HOST, TULALA_WWW_HOST } from "@/lib/brand/tulala";
import { PAY_PLATFORM_ORIGIN } from "@/lib/payments/pay-link-url";
import { isLiveDomainStatus } from "@/lib/saas/workspace-live-url";

type DomainRow = {
  hostname: string | null;
  kind: string | null;
  is_primary: boolean | null;
  status: string | null;
};

/** Minimal admin client surface used here (service-role Supabase). */
type AdminLike = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (
        col: string,
        val: string,
      ) => PromiseLike<{ data: DomainRow[] | null; error: { message?: string } | null }>;
    };
  };
};

const APP_HOSTS: ReadonlySet<string> = new Set([
  "app.tulala.digital",
  "app.local",
  "localhost",
  "127.0.0.1",
]);

const MARKETING_HOSTS: ReadonlySet<string> = new Set([
  TULALA_APEX_HOST,
  TULALA_WWW_HOST,
]);

export function payOriginNeedsTenantHost(origin: string): boolean {
  try {
    const host = new URL(origin).hostname.toLowerCase();
    if (APP_HOSTS.has(host)) return true;
    if (MARKETING_HOSTS.has(host)) return true;
    // Preview / vercel.app also cannot serve tenant /pay.
    if (host.endsWith(".vercel.app")) return true;
    return false;
  } catch {
    return true;
  }
}

export async function resolveAgendaPayPublicOrigin(
  admin: AdminLike,
  tenantId: string,
  requestedOrigin: string,
): Promise<string> {
  const cleaned = requestedOrigin.trim().replace(/\/$/, "");
  if (cleaned && !payOriginNeedsTenantHost(cleaned)) return cleaned;

  const { data, error } = await admin
    .from("agency_domains")
    .select("hostname, kind, is_primary, status")
    .eq("tenant_id", tenantId);
  if (error) {
    return PAY_PLATFORM_ORIGIN;
  }

  const rows = (data ?? []).filter(
    (r) =>
      r.hostname?.trim() &&
      isLiveDomainStatus(r.status) &&
      (r.kind === "subdomain" || r.kind === "custom"),
  );
  if (rows.length === 0) {
    // No active pay-capable website → platform fallback (PICK: P).
    return PAY_PLATFORM_ORIGIN;
  }
  const primary =
    rows.find((r) => r.is_primary) ?? rows.find((r) => r.kind === "custom") ?? rows[0];
  return `https://${String(primary.hostname).trim().toLowerCase()}`;
}
