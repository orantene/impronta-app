/**
 * Resolve a host that can serve public payment links.
 *
 * Talents work on `app.tulala.digital`, but `/pay` and `/link` are gated off
 * the app/marketing surfaces (`surface-allow-list` / talent-site routing).
 * Minting with `window.location.origin` therefore hands clients a 404
 * (GAP-JOR-3: `app.tulala.digital/pay/<code>`).
 *
 * Preference (pay-link host rules / PICK: P):
 * 1. Keep a requested origin that already serves checkout.
 * 2. Tenant live agency website (`agency_domains` subdomain / custom) → `/pay`.
 * 3. Talent's published free website (`talent_sites.site_slug`) → `/pay`.
 * 4. Platform fallback `pay.tulala.digital` → `/link/{code}`.
 *
 * Never invent a fake free-site hostname (e.g. `tulala.tulala.digital`) for
 * hub-without-website sellers.
 *
 * Pure helper — no `server-only` imports so unit tests can load it.
 */
import { TULALA_APEX_HOST, TULALA_WWW_HOST } from "@/lib/brand/tulala";
import { PAY_PLATFORM_ORIGIN } from "@/lib/payments/pay-link-url";
import { isLiveDomainStatus } from "@/lib/saas/workspace-live-url";
import { talentSitePublicUrl } from "@/lib/talent-site/site-public-url";

type DomainRow = {
  hostname: string | null;
  kind: string | null;
  is_primary: boolean | null;
  status: string | null;
};

type TalentSiteRow = {
  site_slug: string | null;
  status: string | null;
};

/** Minimal admin client surface used here (service-role Supabase). */
type AdminLike = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (
        col: string,
        val: string,
      ) => PromiseLike<{
        data: Array<DomainRow | TalentSiteRow> | null;
        error: { message?: string } | null;
      }>;
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

export type ResolveAgendaPayPublicOriginOpts = {
  /** When set, a published free talent website can supply a branded `/pay` host. */
  talentProfileId?: string | null;
};

export async function resolveAgendaPayPublicOrigin(
  admin: AdminLike,
  tenantId: string,
  requestedOrigin: string,
  opts: ResolveAgendaPayPublicOriginOpts = {},
): Promise<string> {
  const cleaned = requestedOrigin.trim().replace(/\/$/, "");
  if (cleaned && !payOriginNeedsTenantHost(cleaned)) return cleaned;

  const { data, error } = await admin
    .from("agency_domains")
    .select("hostname, kind, is_primary, status")
    .eq("tenant_id", tenantId);
  if (!error) {
    const rows = ((data ?? []) as DomainRow[]).filter(
      (r) =>
        r.hostname?.trim() &&
        isLiveDomainStatus(r.status) &&
        (r.kind === "subdomain" || r.kind === "custom"),
    );
    if (rows.length > 0) {
      const primary =
        rows.find((r) => r.is_primary) ?? rows.find((r) => r.kind === "custom") ?? rows[0];
      return `https://${String(primary.hostname).trim().toLowerCase()}`;
    }
  }

  const talentId = opts.talentProfileId?.trim();
  if (talentId) {
    const site = await admin
      .from("talent_sites")
      .select("site_slug, status")
      .eq("talent_profile_id", talentId);
    if (!site.error) {
      const published = ((site.data ?? []) as TalentSiteRow[]).find(
        (r) => r.status === "published" && r.site_slug?.trim(),
      );
      const vanity = published
        ? talentSitePublicUrl(String(published.site_slug).trim())
        : null;
      if (vanity) return vanity;
    }
  }

  // No active pay-capable website → platform fallback (PICK: P).
  return PAY_PLATFORM_ORIGIN;
}
