/**
 * SaaS hostname parsing — edge-safe.
 *
 * Determines whether the incoming hostname is the platform root, a tenant
 * subdomain of the platform root, or some other hostname (custom domain or
 * unknown — treated as fail-hard in Phase 4).
 *
 * Root domain comes from `SAAS_ROOT_DOMAIN` env var; defaults cover common dev
 * and preview hosts so this works without configuration in local/Vercel runs.
 */

export type TenantHostnameMatch =
  | { kind: "root"; rootDomain: string }
  | { kind: "subdomain"; slug: string; rootDomain: string }
  | { kind: "custom"; hostname: string }
  | { kind: "unknown" };

const DEFAULT_ROOT_DOMAINS = [
  "studiobooking.io",
  "impronta.local",
  "localhost",
] as const;

function stripPort(host: string): string {
  const colon = host.indexOf(":");
  return colon === -1 ? host : host.slice(0, colon);
}

function normalize(host: string): string {
  return stripPort(host.trim().toLowerCase());
}

/**
 * Returns the configured root domains in precedence order.
 * `SAAS_ROOT_DOMAIN` (comma-separated) takes priority; defaults are always
 * appended so localhost/preview still work.
 */
function getConfiguredRootDomains(): string[] {
  const raw = process.env.SAAS_ROOT_DOMAIN ?? process.env.NEXT_PUBLIC_SAAS_ROOT_DOMAIN;
  const configured = raw
    ? raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)
    : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of [...configured, ...DEFAULT_ROOT_DOMAINS]) {
    if (!seen.has(r)) {
      seen.add(r);
      out.push(r);
    }
  }
  return out;
}

export function parseTenantHostname(
  hostInput: string | null | undefined,
): TenantHostnameMatch {
  if (!hostInput) return { kind: "unknown" };
  const host = normalize(hostInput);
  if (!host) return { kind: "unknown" };

  const roots = getConfiguredRootDomains();

  // Preview deployments (vercel.app) → treat as root so previews serve the
  // platform hub without needing custom domain setup. Overrideable with env.
  if (host.endsWith(".vercel.app")) {
    return { kind: "root", rootDomain: host };
  }

  for (const root of roots) {
    if (host === root || host === `www.${root}`) {
      return { kind: "root", rootDomain: root };
    }
    if (host.endsWith(`.${root}`)) {
      const prefix = host.slice(0, host.length - root.length - 1);
      // Reject multi-label subdomains like `foo.bar.studiobooking.io` — only
      // flat `{slug}.{root}` is a tenant surface. (Multi-label could still be
      // a CNAME'd custom domain; resolved via the `custom` branch below.)
      if (!prefix.includes(".")) {
        return { kind: "subdomain", slug: prefix, rootDomain: root };
      }
    }
  }

  return { kind: "custom", hostname: host };
}

export function getDefaultRootDomain(): string {
  return getConfiguredRootDomains()[0] ?? "studiobooking.io";
}
