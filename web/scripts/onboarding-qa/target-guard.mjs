/**
 * Host allow-list + target resolution for the onboarding journey spec
 * (e2e/onboarding/choices-journey.spec.ts). Pure: no I/O, no network, no logging
 * of secrets. The spec and the unit test both import it.
 *
 * Rules:
 *   - A hostname is ALLOWED only if it is localhost / 127.0.0.1, or matches
 *     ^staging-qa-[a-z0-9-]+\.tulala\.digital$ (the isolated staging hosts), or
 *     is listed (exact, lower-case) in JOURNEY_ALLOWED_HOSTS (comma separated).
 *   - A hostname is FORBIDDEN, even if listed in JOURNEY_ALLOWED_HOSTS, when it
 *     is tulala.digital, app.tulala.digital, improntamodels.com (or any
 *     subdomain of it), or any other *.tulala.digital host that does not start
 *     with "staging-qa-".
 *   - There are NO default origins. JOURNEY_TARGET=local is the only way to get
 *     the localhost defaults (the onboarding-qa dev.sh stack).
 */

export const STAGING_HOST_RE = /^staging-qa-[a-z0-9-]+\.tulala\.digital$/;
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);
const FORBIDDEN_EXACT = new Set(["tulala.digital", "app.tulala.digital", "improntamodels.com"]);

function norm(hostname) {
  return String(hostname ?? "").trim().toLowerCase().replace(/\.$/, "");
}

export function isForbiddenHost(hostname) {
  const h = norm(hostname);
  if (FORBIDDEN_EXACT.has(h)) return true;
  if (h.endsWith(".improntamodels.com")) return true;
  if (h.endsWith(".tulala.digital") && !h.startsWith("staging-qa-")) return true;
  return false;
}

export function allowedHostList(env = process.env) {
  return String(env.JOURNEY_ALLOWED_HOSTS ?? "")
    .split(",")
    .map(norm)
    .filter(Boolean);
}

export function isAllowedHost(hostname, env = process.env) {
  const h = norm(hostname);
  if (!h || isForbiddenHost(h)) return false;
  if (LOCAL_HOSTS.has(h)) return true;
  if (STAGING_HOST_RE.test(h)) return true;
  return allowedHostList(env).includes(h);
}

function hostnameOf(origin) {
  try {
    return new URL(origin).hostname;
  } catch {
    return null;
  }
}

/** Throws unless EVERY named origin has an allow-listed, non-forbidden hostname. */
export function assertAllowedOrigins(origins, env = process.env) {
  for (const [name, value] of Object.entries(origins)) {
    if (value == null || value === "") continue;
    const host = hostnameOf(value);
    if (!host) throw new Error(`[journey-guard] ${name} is not a valid URL`);
    if (isForbiddenHost(host)) throw new Error(`[journey-guard] refusing ${name}: host "${host}" is production / Impronta / not a staging-qa host`);
    if (!isAllowedHost(host, env)) throw new Error(`[journey-guard] refusing ${name}: host "${host}" is not in the allow-list (localhost, staging-qa-*.tulala.digital, JOURNEY_ALLOWED_HOSTS)`);
  }
}

function stripSlash(s) {
  return String(s).replace(/\/+$/, "");
}

/**
 * Resolve and validate the targets. Returns
 * { local, marketing, app, talentHostTemplate }. Throws on any violation.
 * talentHostTemplate is e.g. "staging-qa-{slug}.tulala.digital" (staging only).
 */
export function resolveJourneyTargets(env = process.env) {
  const local = env.JOURNEY_TARGET === "local";
  let marketing = env.JOURNEY_MARKETING_ORIGIN;
  let app = env.JOURNEY_APP_ORIGIN;
  if (local) {
    marketing ??= "http://localhost:3105";
    app ??= "http://localhost:3106";
  }
  if (!marketing || !app) {
    throw new Error("[journey-guard] JOURNEY_MARKETING_ORIGIN and JOURNEY_APP_ORIGIN are required (no defaults). Set JOURNEY_TARGET=local only for the localhost dev stack.");
  }
  marketing = stripSlash(marketing);
  app = stripSlash(app);
  const template = env.JOURNEY_TALENT_HOST_TEMPLATE || null;
  if (!local && !template) {
    throw new Error("[journey-guard] JOURNEY_TALENT_HOST_TEMPLATE is required off-local, e.g. staging-qa-{slug}.tulala.digital");
  }
  if (template) {
    if (!template.includes("{slug}")) throw new Error("[journey-guard] JOURNEY_TALENT_HOST_TEMPLATE must contain {slug}");
    // Check the template with a probe slug: the resulting hostname must pass.
    assertAllowedOrigins({ JOURNEY_TALENT_HOST_TEMPLATE: `https://${template.replace("{slug}", "probe")}` }, env);
  }
  assertAllowedOrigins({ JOURNEY_MARKETING_ORIGIN: marketing, JOURNEY_APP_ORIGIN: app, PLAYWRIGHT_BASE_URL: env.PLAYWRIGHT_BASE_URL }, env);
  return { local, marketing, app, talentHostTemplate: template };
}

/** Hostname for a talent site slug under the configured template. */
export function talentHostFor(slug, template, env = process.env) {
  if (!/^[a-z0-9-]+$/.test(String(slug))) throw new Error("[journey-guard] unexpected slug characters");
  const host = template.replace("{slug}", slug);
  if (!isAllowedHost(host, env)) throw new Error(`[journey-guard] refusing talent host "${host}"`);
  return host;
}

/**
 * Headers to add to a request to `url`: the Vercel deployment-protection bypass,
 * only when the secret is set AND the URL's host is allow-listed. The value is
 * never logged or returned anywhere else.
 */
export function bypassHeadersFor(url, env = process.env) {
  const secret = env.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (!secret) return {};
  const host = hostnameOf(url);
  if (!host || !isAllowedHost(host, env) || LOCAL_HOSTS.has(norm(host))) return {};
  return { "x-vercel-protection-bypass": secret };
}
