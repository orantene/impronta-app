#!/usr/bin/env node
/**
 * Strip stale COLOUR overrides from a talent's page-level `theme.__design` tokens.
 *
 * Why: a page's own `__design` tokens (written by earlier editors and by clones, e.g. the Jor
 * clone's pale accent #F4D7E2) are layered over the site's palette at render time. The renderer
 * now ignores page colours the site already sets (`layerPage` in site-theme-tokens.ts), so this is
 * data hygiene for the page rows that still carry them. Non-colour tokens are left alone.
 *
 * Safety: only the QA users below can be touched, a dry run is the default, and nothing but the
 * `color.*` keys of `theme.__design.tokens` / `tokensDraft` changes.
 *
 * Run (from web/):
 *   node --env-file=.env.local scripts/theme-releases/strip-page-color-overrides.mjs --code TAL-93900
 *   node --env-file=.env.local scripts/theme-releases/strip-page-color-overrides.mjs --code TAL-93900 --apply
 */
const QA_CODES = new Set(["TAL-93900", "TAL-93901"]);
const args = process.argv.slice(2);
const opt = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const code = opt("--code");
const apply = args.includes("--apply");
if (!code || !QA_CODES.has(code)) {
  console.error(`REFUSE: --code must be one of ${[...QA_CODES].join(", ")} (QA users only)`);
  process.exit(1);
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
const rest = (path, init) => fetch(`${url}/rest/v1/${path}`, { headers, ...init });

const prof = await (await rest(`talent_profiles?profile_code=eq.${code}&select=id,profile_code`)).json();
if (prof.length !== 1) throw new Error(`profile ${code} not found`);
const id = prof[0].id;
const pages = await (await rest(`talent_pages?talent_profile_id=eq.${id}&select=id,slug,theme`)).json();

for (const page of pages) {
  const design = page.theme?.__design;
  if (!design) continue;
  const strip = (tokens) =>
    Object.fromEntries(Object.entries(tokens ?? {}).filter(([k]) => !k.startsWith("color.")));
  const removed = Object.keys({ ...(design.tokens ?? {}), ...(design.tokensDraft ?? {}) }).filter((k) => k.startsWith("color."));
  if (removed.length === 0) {
    console.log(`${page.slug}: no colour overrides`);
    continue;
  }
  console.log(`${page.slug}: removing ${[...new Set(removed)].join(", ")}`);
  console.log("  accent before:", design.tokens?.["color.accent"], design.tokensDraft?.["color.accent"]);
  if (!apply) continue;
  const next = {
    ...page.theme,
    __design: { ...design, tokens: strip(design.tokens), tokensDraft: strip(design.tokensDraft) },
  };
  const res = await rest(`talent_pages?id=eq.${page.id}`, { method: "PATCH", body: JSON.stringify({ theme: next }) });
  console.log(`  ${res.ok ? "written" : "FAILED " + res.status}`);
}
console.log(apply ? "applied" : "dry run (add --apply to write)");
