/**
 * The ONE place that decides which root domain public Tulala URLs are built on
 * (TUL-1843, TUL-1845). Production is `tulala.digital`. A non-production
 * deployment (isolated staging) serves everything under its own root, e.g.
 * `staging.tulala.digital`, so a link built from a `tulala.digital` literal
 * sends a staging visitor to PRODUCTION.
 *
 * Resolution order, first hit wins:
 *  1. `VERCEL_ENV=production` -> `tulala.digital` (a stray variable can never
 *     move production URLs);
 *  2. `TALENT_SITE_ROOT_DOMAIN` (server only), validated by
 *     `resolveTalentSiteRootDomain`;
 *  3. the hostname of `NEXT_PUBLIC_SITE_URL` when it is a single-purpose
 *     environment root under `tulala.digital` (inlined at build time, so a
 *     client component resolves the same value as the server);
 *  4. `tulala.digital`.
 *
 * Pure: takes the env as an argument so it is unit-testable. No `server-only`,
 * so client components may import it.
 */

import { TULALA_APEX_HOST } from "./tulala";
import { resolveTalentSiteRootDomain } from "@/lib/talent-site/site-public-url";

type RootEnv = Readonly<Record<string, string | undefined>>;

/** First labels that name a surface of an environment, never the environment root itself. */
const SURFACE_LABELS = new Set(["www", "app", "hub", "pay", "docs", "support", "marketing"]);

export function resolvePublicRootDomain(env: RootEnv = process.env): string {
  if (env.VERCEL_ENV === "production") return TULALA_APEX_HOST;

  const talent = resolveTalentSiteRootDomain(env);
  if (talent !== TULALA_APEX_HOST) return talent;

  const raw = (env.NEXT_PUBLIC_SITE_URL ?? "").trim();
  if (!raw) return TULALA_APEX_HOST;
  let host: string;
  try {
    host = new URL(raw).hostname.toLowerCase();
  } catch {
    return TULALA_APEX_HOST;
  }
  if (host === TULALA_APEX_HOST || !host.endsWith(`.${TULALA_APEX_HOST}`)) {
    return TULALA_APEX_HOST;
  }
  const first = host.slice(0, -(TULALA_APEX_HOST.length + 1)).split(".")[0] ?? "";
  return SURFACE_LABELS.has(first) ? TULALA_APEX_HOST : host;
}

/** `https://<root>`: the origin of this environment's public (marketing/hub) host. */
export function resolvePublicRootOrigin(env: RootEnv = process.env): string {
  return `https://${resolvePublicRootDomain(env)}`;
}

/** `<label>.<root>`, e.g. `acme.tulala.digital` or `acme.staging.tulala.digital`. */
export function publicSubdomainHost(label: string, env: RootEnv = process.env): string {
  return `${label}.${resolvePublicRootDomain(env)}`;
}

/**
 * Re-home a stored `*.tulala.digital` hostname onto this environment's root.
 * Staging data carries production-pattern hostnames; rendering them verbatim
 * links a staging page to production. Custom domains, hosts already under the
 * environment root, and production itself pass through unchanged.
 */
export function rehomeToPublicRoot(hostname: string, env: RootEnv = process.env): string {
  const root = resolvePublicRootDomain(env);
  const lower = hostname.trim().toLowerCase();
  if (root === TULALA_APEX_HOST) return hostname;
  if (lower === root || lower.endsWith(`.${root}`)) return hostname;
  if (lower === TULALA_APEX_HOST) return root;
  if (lower.endsWith(`.${TULALA_APEX_HOST}`)) {
    return `${lower.slice(0, -TULALA_APEX_HOST.length)}${root}`;
  }
  return hostname;
}
