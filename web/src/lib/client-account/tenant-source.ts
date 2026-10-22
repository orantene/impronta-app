import type { ClientAccountHostKind } from "./flag";

/**
 * Which tenant a client account belongs to, decided from the HOST only.
 *
 * - talent_site (her own website): the talent's tenant, from the proxy-set
 *   talent-profile header. Flag name `talent`.
 * - hub / agency (the `/t/<code>` profile page is not a website): the tenant of
 *   the host itself, from the proxy-set tenant header. Flag matches the host
 *   kind (`agency` / `hub`) so CLIENT_ACCOUNT_HOSTS=agency enables the surface.
 * - app / marketing apex (tulala.digital, no tenant of its own, the public face
 *   of the Tulala hub): the platform hub tenant. Flag matches the host kind.
 * - anything else: null (fail closed).
 *
 * Nothing here reads a browser value or a profile code.
 */
export type AccountTenantSource =
  | { source: "talent_profile"; flag: ClientAccountHostKind }
  | { source: "host_tenant"; flag: ClientAccountHostKind }
  | { source: "platform_hub"; flag: ClientAccountHostKind };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function decideAccountTenantSource(input: {
  hostKind: string | null;
  talentProfileId: string | null;
  hostTenantId: string | null;
}): AccountTenantSource | null {
  const { hostKind } = input;
  if (hostKind === "talent_site") {
    return input.talentProfileId?.trim() ? { source: "talent_profile", flag: "talent" } : null;
  }
  if (hostKind === "hub" || hostKind === "agency") {
    return input.hostTenantId && UUID.test(input.hostTenantId.trim())
      ? { source: "host_tenant", flag: hostKind }
      : null;
  }
  if (hostKind === "app" || hostKind === "marketing") {
    return { source: "platform_hub", flag: hostKind };
  }
  return null;
}

/**
 * TUL-1317 / TUL-65: on the hub, app and marketing hosts the account is the client's WHOLE
 * account (one list across tenants, like `client_favorites`), so the saved roster filter and
 * the reviews tenant filter do not apply. The tenant here is the platform hub tenant; a
 * favourite or a review request on an agency's talent would never match it, which left Saved
 * and Reviews empty for a client whose data lives on other tenants.
 */
export function accountSpansTenants(hostKind: string | null): boolean {
  return hostKind === "hub" || hostKind === "app" || hostKind === "marketing";
}
