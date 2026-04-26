/**
 * Phase B.1 — site shell feature flag.
 *
 * Three-state gate that controls whether the public storefront uses the
 * snapshot-rendered site shell (header + footer) instead of the hard-coded
 * `PublicHeader` + `PublicCmsFooterNav`.
 *
 *   1. Env flag `ENABLE_SITE_SHELL`  ─ master switch. When `false` (default
 *      and unset), the snapshot shell is OFF for every tenant. This is the
 *      shipping default for B.1; B.2 may flip it to `tenants` for staged
 *      rollout.
 *   2. Allow-list `SITE_SHELL_TENANT_IDS` ─ comma-separated tenant ids that
 *      get the snapshot shell when the master switch is `tenants`. Empty
 *      = no tenant gets it. Used in B.2 to opt the impronta tenant in
 *      first; widen to all tenants only after a clean release.
 *   3. Shell row published ─ even when the env flags green-light a tenant,
 *      `loadPublishedShell` returning null falls through to the hard-coded
 *      header. Belt-and-suspenders so a tenant with no published shell row
 *      never renders empty chrome.
 *
 * Read at request time (Server Component bind point in
 * `agency-home-storefront.tsx` / future page wrappers). No client exposure.
 */

export type SiteShellMode = "off" | "tenants" | "all";

export function readSiteShellMode(): SiteShellMode {
  const raw = process.env.ENABLE_SITE_SHELL?.trim().toLowerCase();
  if (raw === "all" || raw === "true" || raw === "1") return "all";
  if (raw === "tenants") return "tenants";
  return "off";
}

function readShellTenantAllowlist(): ReadonlySet<string> {
  const raw = process.env.SITE_SHELL_TENANT_IDS?.trim();
  if (!raw) return new Set();
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0),
  );
}

/**
 * Should the snapshot-rendered shell take over for this tenant on this
 * request? Returns false in ALL of: master flag off; mode=tenants but
 * tenant not in allow-list. Caller must additionally honor the published-
 * shell-exists belt by checking `loadPublishedShell` for null.
 */
export function isSiteShellEnabledForTenant(tenantId: string): boolean {
  const mode = readSiteShellMode();
  if (mode === "off") return false;
  if (mode === "all") return true;
  // mode === "tenants"
  const allow = readShellTenantAllowlist();
  return allow.has(tenantId);
}
