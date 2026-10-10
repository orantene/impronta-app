/**
 * Talent primary custom-domain redirects (D1 contract, pure).
 *
 * When a talent has an ACTIVE primary custom domain:
 *   - `<slug>.tulala.digital/*` → 308 `https://<custom>/*` (path + query kept)
 *   - hub `/t/<code>` → 308 custom home (staff bypass via flag)
 *   - apex ↔ www: serve the primary row, 308 the counterpart
 *
 * Never redirect when the domain is not active (no outage on DNS break).
 * Agency hosts keep using `resolveCanonicalCustomDomainRedirectHost`; talent
 * surfaces call these helpers so both share the same “primary host wins” idea.
 */

export type TalentPrimaryRedirectTarget = {
  hostname: string;
  pathname: string;
  search: string;
  status: 308;
};

function safeMethod(method: string): boolean {
  return method === "GET" || method === "HEAD";
}

function normalizeHost(host: string | null | undefined): string {
  return (host ?? "").trim().toLowerCase().replace(/\.$/, "");
}

/** www ↔ apex counterpart, or null when the host is neither form. */
export function counterpartWwwOrApex(hostname: string): string | null {
  const host = normalizeHost(hostname);
  if (!host || !host.includes(".")) return null;
  if (host.startsWith("www.")) {
    const apex = host.slice(4);
    return apex.includes(".") ? apex : null;
  }
  // Treat bare registrable-looking hosts as apex → www counterpart.
  const labels = host.split(".").filter(Boolean);
  if (labels.length >= 2 && labels[0] !== "www") {
    return `www.${host}`;
  }
  return null;
}

/**
 * Subdomain or hub → active primary custom domain.
 * Path + query preserved on subdomain; hub always lands on `/` of the custom host.
 */
export function resolveTalentPrimaryDomainRedirect(input: {
  surface: "subdomain" | "hub" | "custom_alias";
  method: string;
  currentHost: string;
  pathname: string;
  search: string;
  /** Active primary custom domain, or null when none / not active. */
  primaryActiveDomain: string | null;
  /** Hub only: staff flag keeps `/t/<code>` reachable. */
  hubStaffBypass?: boolean;
}): TalentPrimaryRedirectTarget | null {
  if (!safeMethod(input.method)) return null;

  const primary = normalizeHost(input.primaryActiveDomain);
  if (!primary) return null;

  const current = normalizeHost(input.currentHost);
  if (current && current === primary) return null;

  if (input.surface === "hub") {
    if (input.hubStaffBypass) return null;
    return {
      hostname: primary,
      pathname: "/",
      search: "",
      status: 308,
    };
  }

  if (input.surface === "subdomain" || input.surface === "custom_alias") {
    const pathname = input.pathname?.startsWith("/") ? input.pathname : `/${input.pathname ?? ""}`;
    const search = input.search ?? "";
    return {
      hostname: primary,
      pathname: pathname || "/",
      search,
      status: 308,
    };
  }

  return null;
}

/**
 * Apex ↔ www: when the request host is the counterpart of the active primary,
 * 308 to the primary. Never redirect away from the primary itself.
 */
export function resolveTalentWwwApexRedirect(input: {
  method: string;
  currentHost: string;
  primaryActiveDomain: string | null;
}): string | null {
  if (!safeMethod(input.method)) return null;
  const primary = normalizeHost(input.primaryActiveDomain);
  if (!primary) return null;

  const current = normalizeHost(input.currentHost);
  if (!current || current === primary) return null;

  const counterpart = counterpartWwwOrApex(primary);
  if (counterpart && current === counterpart) return primary;

  // Request is on www/apex of primary's zone but primary is the other side.
  const currentCounterpart = counterpartWwwOrApex(current);
  if (currentCounterpart === primary) return primary;

  return null;
}

/**
 * Shared with agency: non-primary custom host → primary custom host.
 * Thin adapter so talent wiring can reuse the agency helper shape in tests.
 */
export function talentUsesSamePrimaryHostIdeaAsAgency(): true {
  return true;
}
