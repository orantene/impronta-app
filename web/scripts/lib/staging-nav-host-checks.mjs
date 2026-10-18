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

const TRUTHY = new Set(["1", "true", "yes", "on"]);

/** Talent-host probe plan, or a skip when the staging env values are empty. */
export function talentHostPlan(env) {
  const root = String(env.TALENT_SITE_ROOT_DOMAIN ?? "").trim().replace(/^\.+|\.+$/g, "");
  const enabled = TRUTHY.has(String(env.TALENT_SITE_SUBDOMAINS_ENABLED ?? "").trim().toLowerCase());
  if (!root || !enabled) {
    return { skip: true, reason: "env not set: TALENT_SITE_ROOT_DOMAIN and TALENT_SITE_SUBDOMAINS_ENABLED must both be set" };
  }
  const host = `${PREFIX}-limpieza.${root}`;
  return {
    skip: false,
    host,
    probes: [
      { path: "/", expect: [200], label: "T1 site home" },
      { path: `/blog/${PREFIX}-guia-limpieza`, expect: [200], label: "published post (es)" },
      { path: `/blog/${PREFIX}-cleaning-guide`, expect: [200], label: "published post (en)" },
      // Code (posts-public-model): expired still renders with a notice (200, noindex); taken down answers 404.
      { path: `/blog/${PREFIX}-oferta-vencida`, expect: [200], label: "expired post (renders with notice)" },
      { path: `/blog/${PREFIX}-articulo-oculto`, expect: [404], label: "taken-down post" },
      { path: `/blog/${PREFIX}-no-such-post`, expect: [404], label: "missing post" },
    ],
  };
}

export function decideProbe(probe, status) {
  return { ok: probe.expect.includes(status), expected: probe.expect.join("/"), status };
}
