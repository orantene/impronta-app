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

/**
 * Builder Studio WS-A — separate gate for whether the EDITOR may open the
 * `site_shell` builder SURFACE (load / edit / save / publish the freeform shell
 * tree). This is DELIBERATELY independent from `isSiteShellEnabledForTenant`,
 * which gates whether the live storefront RENDERS the snapshot shell. A1 keeps
 * the two separate so editing the shell can be enabled for QA without flipping
 * live rendering on (and vice versa).
 *
 *   - Env flag `ENABLE_SITE_SHELL_EDIT` ─ master switch for the editor surface.
 *     When unset/`false` (the shipping default) the shell surface is NEVER
 *     reachable: `canEditShell` routing falls through to the legacy header-
 *     selection special-case + the existing `?edit=1` surfaces. Nothing about
 *     live header/footer rendering changes.
 *   - Allow-list `SITE_SHELL_EDIT_TENANT_IDS` ─ comma-separated tenant ids that
 *     get the editor surface when the master switch is `tenants`.
 *
 * With the default (OFF), `shouldRouteSiteShellSurface` returns false for every
 * tenant, so the A1 adapter + config are dormant code — built, unit-tested, but
 * never bound or routed at runtime.
 */
export function readSiteShellEditMode(): SiteShellMode {
  const raw = process.env.ENABLE_SITE_SHELL_EDIT?.trim().toLowerCase();
  if (raw === "all" || raw === "true" || raw === "1") return "all";
  if (raw === "tenants") return "tenants";
  return "off";
}

function readShellEditTenantAllowlist(): ReadonlySet<string> {
  const raw = process.env.SITE_SHELL_EDIT_TENANT_IDS?.trim();
  if (!raw) return new Set();
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0),
  );
}

/**
 * Should the editor route to the `site_shell` builder surface for this tenant?
 * Returns false in ALL of: master flag off (the default); mode=tenants but
 * tenant not in the edit allow-list. OFF by default → the shell surface never
 * mounts and live rendering is untouched.
 */
export function shouldRouteSiteShellSurface(tenantId: string): boolean {
  const mode = readSiteShellEditMode();
  if (mode === "off") return false;
  if (mode === "all") return true;
  // mode === "tenants"
  const allow = readShellEditTenantAllowlist();
  return allow.has(tenantId);
}
