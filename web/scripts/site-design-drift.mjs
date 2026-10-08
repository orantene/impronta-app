#!/usr/bin/env node
// site-design-drift.mjs (TUL-135) — READ-ONLY, platform-wide.
// Lists every published talent_sites row that is
//   (a) BEHIND: theme_design_version < latest PUBLISHED release of its design
//       (talent_theme_releases.to_version; falls back to the highest version
//       any published site runs when a design has no release row), or
//   (b) STALE-PUBLISH: shell_published was stamped from an older design
//       version than the site is on (draft edits never touch shell_published,
//       so this is distinguishable from normal unpublished edits).
// Exit 1 when TAL-93900 or TAL-93938 is drifted. SELECT only.

import { loadEnvLocal } from "./load-env-local.mjs";
import { classifySite, formatDriftTable, isWatchedDrifted, latestVersions } from "./lib/site-design-drift.mjs";

loadEnvLocal();
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const REF = URL_?.match(/^https:\/\/([^.]+)\.supabase\.co/)?.[1];
if (!TOKEN || !REF) {
  console.error("[site-design-drift] missing SUPABASE_ACCESS_TOKEN or NEXT_PUBLIC_SUPABASE_URL.");
  process.exit(2);
}

async function select(sql) {
  if (!/^\s*select\b/i.test(sql)) throw new Error("read-only: SELECT only");
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  const body = await res.json();
  if (!res.ok || body?.message) throw new Error(body?.message ?? `HTTP ${res.status}`);
  return body;
}

const releases = await select("SELECT design_slug, to_version, status FROM public.talent_theme_releases");
const sites = await select(
  `SELECT p.profile_code, s.site_slug, s.theme_design_slug, s.theme_design_version, s.shell_published
     FROM public.talent_sites s JOIN public.talent_profiles p ON p.id = s.talent_profile_id
    WHERE s.status = 'published' AND s.theme_design_slug IS NOT NULL
    ORDER BY s.theme_design_slug, s.theme_design_version, p.profile_code`,
);

const latest = latestVersions(releases, sites);
const rows = sites.map((s) => ({ ...s, ...classifySite(s, latest) }));
const drifted = rows.filter((r) => r.behind || r.staleShell);

console.log("Latest per design: " + [...latest].map(([k, v]) => `${k}=${v.version} (${v.source})`).join(", "));
console.log(`${sites.length} published site(s); ${drifted.filter((r) => r.behind).length} behind, ${drifted.filter((r) => r.staleShell).length} stale publish.\n`);
console.log(drifted.length ? formatDriftTable(drifted) : "No drift.");

if (isWatchedDrifted(rows)) {
  console.error("\nFAIL: TAL-93900 or TAL-93938 is behind / stale.");
  process.exit(1);
}
