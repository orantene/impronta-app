/**
 * Pure decision logic for scripts/check-staging-nav-and-talent-host.mjs.
 * No I/O, so it is unit-testable (scripts/lib/staging-nav-host-checks.test.mjs).
 */
import { PREFIX } from "./group6-fixtures.mjs";

/** `app.tulala.digital` / `app.staging.tulala.digital` absolute workspace URL (TUL-1247). */
const ABS_APP_WORKSPACE = /^https?:\/\/app(?:\.staging)?\.tulala\.digital\/w\//i;

function blocks(html, tag) {
  const out = [];
  const re = new RegExp(`<${tag}\\b[\\s\\S]*?</${tag}>`, "gi");
  let m;
  while ((m = re.exec(html)) !== null) out.push(m[0]);
  return out;
}

/** href values inside every <header> and <nav> block of the page. */
export function headerNavHrefs(html) {
  const hrefs = new Set(); // a <nav> inside a <header> is seen twice
  for (const block of [...blocks(String(html ?? ""), "header"), ...blocks(String(html ?? ""), "nav")]) {
    const re = /<a\b[^>]*?\bhref\s*=\s*("([^"]*)"|'([^']*)')/gi;
    let m;
    while ((m = re.exec(block)) !== null) hrefs.add((m[2] ?? m[3] ?? "").trim());
  }
  return [...hrefs];
}

/** Header/nav links that are an absolute app-host /w/... URL (the TUL-1247 bug). */
export function absoluteAppWorkspaceLinks(html) {
  return headerNavHrefs(html).filter((h) => ABS_APP_WORKSPACE.test(h));
}

/** Verdict for one tenant-site page. `status` is the HTTP status of the fetch. */
export function decideNavCheck(status, html) {
  if (status !== 200) return { ok: false, reason: `page status ${status}, expected 200` };
  const bad = absoluteAppWorkspaceLinks(html);
  if (bad.length) return { ok: false, reason: `${bad.length} header/nav link(s) are absolute app-host /w/ URLs` };
  const total = headerNavHrefs(html).length;
  if (total === 0) return { ok: false, reason: "no header/nav links found (page shape unexpected)" };
  return { ok: true, reason: `${total} header/nav links, none absolute app-host /w/` };
}

/** The staging wildcard alias *.staging.tulala.digital already exists (PM); no root-domain env var exists in web/src. */
export const STAGING_TALENT_ROOT = "staging.tulala.digital";

/**
 * Talent-host probe plan. Only `TALENT_SITE_SUBDOMAINS_ENABLED === "true"` (exact string,
 * web/src/lib/access/talent-site-subdomains.ts) gates talent subdomain routing.
 */
export function talentHostPlan(env) {
  if (String(env.TALENT_SITE_SUBDOMAINS_ENABLED ?? "") !== "true") {
    return { skip: true, reason: "TALENT_SITE_SUBDOMAINS_ENABLED not set (must be exactly \"true\")" };
  }
  const host = `${PREFIX}-limpieza.${STAGING_TALENT_ROOT}`;
  return {
    skip: false,
    host,
    probes: [{ path: "/", expect: [200], label: "T1 site home" }],
  };
}

/**
 * Posts live under the owner workspace (tenant scope; the talent scope cannot exist on staging, see the seed).
 * They render on the workspace site: <hub>/w/qa-fixture-g6-ws/blog/<slug>. Code (posts-public-model): published 200;
 * expired still renders with a notice (200, noindex); taken down and missing answer 404.
 */
export const WORKSPACE_POST_BASE = "https://staging.tulala.digital/w/qa-fixture-g6-ws";
export const WORKSPACE_POST_PROBES = [
  { path: `/blog/${PREFIX}-guia-limpieza`, expect: [200], label: "published post (es)" },
  { path: `/blog/${PREFIX}-oferta-vencida`, expect: [200], label: "expired post (renders with notice)" },
  { path: `/blog/${PREFIX}-articulo-oculto`, expect: [404], label: "taken-down post" },
  { path: `/blog/${PREFIX}-no-such-post`, expect: [404], label: "missing post" },
];

/** The site host "resolves" when its home answers 200; anything else means routing is not live there. */
export function siteHostResolves(status) {
  return status === 200;
}

export function decideProbe(probe, status) {
  return { ok: probe.expect.includes(status), expected: probe.expect.join("/"), status };
}
