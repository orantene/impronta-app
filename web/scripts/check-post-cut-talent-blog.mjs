#!/usr/bin/env node
/**
 * Post-cut recheck (read-only, GET only). Sends the staging gate header from ~/.tulala-qa.env; never prints it.
 * For the talent host: home (nav links), /blog list, /blog/<slug> per seeded state. Prints status codes + text assertions.
 *
 * Usage (from web/): node scripts/check-post-cut-talent-blog.mjs [--host <talent host>] [--slug-prefix <prefix>]
 *   --host defaults to the T1 host qa-fixture-g6-limpieza.staging.tulala.digital; use the host the seed printed for the talent that owns the posts.
 * Exit 1 on any FAIL.
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { PREFIX, parseEnvText } from "./lib/group6-fixtures.mjs";
import { headerNavHrefs, absoluteAppWorkspaceLinks } from "./lib/staging-nav-host-checks.mjs";

const arg = (n, d) => {
  const i = process.argv.indexOf(n);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
const host = arg("--host", `${PREFIX}-limpieza.staging.tulala.digital`);
if (!/^[a-z0-9.-]+\.staging\.tulala\.digital$/i.test(host)) {
  console.error("[post-cut] --host must be a *.staging.tulala.digital host");
  process.exit(2);
}
let token;
try {
  token = parseEnvText(readFileSync(join(homedir(), ".tulala-qa.env"), "utf8")).STAGING_GATE_CI_TOKEN;
} catch {
  token = undefined;
}
if (!token) {
  console.error("[post-cut] STAGING_GATE_CI_TOKEN missing in ~/.tulala-qa.env");
  process.exit(2);
}
const headers = { "x-staging-gate-token": token };
const P = `${PREFIX}-t-`;
let failed = 0;
const say = (ok, line) => {
  if (!ok) failed += 1;
  console.log(`[post-cut] ${ok ? "PASS" : "FAIL"} ${line}`);
};
async function get(path) {
  const res = await fetch(`https://${host}${path}`, { redirect: "manual", headers });
  const body = res.status === 200 ? await res.text() : "";
  return { status: res.status, body };
}
const has = (body, re) => re.test(body);

try {
  const home = await get("/");
  say(home.status === 200, `home / -> ${home.status} (expect 200)`);
  if (home.status === 200) {
    const hrefs = headerNavHrefs(home.body);
    const bad = absoluteAppWorkspaceLinks(home.body);
    say(hrefs.length > 0, `nav: ${hrefs.length} header/nav links found`);
    say(bad.length === 0, `nav: ${bad.length} absolute app-host /w/ links (expect 0) [TUL-1247]`);
    say(hrefs.some((h) => /\/blog\b/.test(h)), "nav: has a /blog link [TUL-1003/1006]");
  }

  const list = await get("/blog");
  say(list.status === 200, `/blog -> ${list.status} (expect 200)`);
  if (list.status === 200) {
    say(has(list.body, new RegExp(`${P}guia-limpieza`)), "/blog lists the published es post");
    say(!has(list.body, new RegExp(`${P}articulo-oculto`)), "/blog hides the taken-down post");
  }

  const probes = [
    ["published es", "guia-limpieza", [200], /Guia rapida para mantener tu casa limpia/],
    ["published en", "cleaning-guide", [200], /A quick guide to keeping your home clean/],
    ["expired (renders with notice)", "oferta-vencida", [200], /Oferta de temporada/],
    ["taken down", "articulo-oculto", [404], null],
    ["missing", "no-such-post", [404], null],
  ];
  for (const [label, slug, expect, text] of probes) {
    const r = await get(`/blog/${P}${slug}`);
    say(expect.includes(r.status), `/blog/${P}${slug} ${label} -> ${r.status} (expect ${expect.join("/")})`);
    if (text && r.status === 200) say(has(r.body, text), `  text assertion: title present`);
  }
} catch (e) {
  say(false, `request failed: ${e.message}`);
}
console.log(`[post-cut] ${failed === 0 ? "done, no failures" : `${failed} failure(s)`}`);
process.exit(failed === 0 ? 0 : 1);
