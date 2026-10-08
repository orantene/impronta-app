#!/usr/bin/env node
// ============================================================================
// upgrade-site-designs.mjs — bring published talent sites up to the latest
// RELEASED version of their design, keeping every talent edit.
// ============================================================================
//
//   --dry-run (default)          READ-ONLY. Per site: profile_code, from -> to
//                                version, tokens / sections changed, edits kept.
//   --apply --site <code>        Upgrade ONE site: draft written through the app's
//                                own draft writer (history entry, draft_rev CAS),
//                                then published through the service-role publish
//                                path ONLY when the live site already equals the
//                                draft. Otherwise: "needs publish".
//   --apply --all --confirm-all  Every site below the latest release. DO NOT RUN
//                                until the dry run has been reviewed.
//   --design <slug>              Limit to one design (default: all).
//
// "Latest" = highest PUBLISHED (optin/default) release in
// public.talent_theme_releases. Draft / demo-only versions are never a target.
//
// Reads go through the Supabase Management API (same auth as
// apply-migration.mjs: SUPABASE_ACCESS_TOKEN + NEXT_PUBLIC_SUPABASE_URL). The
// merge needs each talent's hydration tokens, which the app computes with the
// service-role client (SUPABASE_SERVICE_ROLE_KEY, read-only in a dry run).
//
// Run from web/:
//   TSX_TSCONFIG_PATH=scripts/demo-talents/tsconfig.json \
//     node --require ./scripts/register-server-only-test.cjs --import tsx \
//     --env-file=.env.local scripts/upgrade-site-designs.mjs [flags]
// (the tsconfig swaps the cookie-bound server client for the service-role one,
//  the same stub the demo-talents scripts use.)

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const APPLY = flag("--apply");
const ALL = flag("--all");
const SITE = opt("--site");
const DESIGN = opt("--design");

if (flag("--dry-run") && APPLY) fail("--dry-run and --apply are exclusive.");
if (APPLY && !SITE && !ALL) fail("--apply needs --site <profile_code> (or --all --confirm-all).");
if (APPLY && ALL && !flag("--confirm-all")) fail("--apply --all also needs --confirm-all. Not to be run until the dry run is reviewed.");

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!TOKEN || !SUPABASE_URL) fail("missing SUPABASE_ACCESS_TOKEN or NEXT_PUBLIC_SUPABASE_URL (use --env-file=.env.local).");
const REF = SUPABASE_URL.match(/^https:\/\/([^.]+)\.supabase\.co/)?.[1];
if (!REF) fail("could not parse project ref from NEXT_PUBLIC_SUPABASE_URL");

function fail(msg) {
  console.error(`[upgrade-site-designs] ${msg}`);
  process.exit(1);
}

/** Read-only SQL through the Management API. */
async function select(sql) {
  if (!/^\s*select\b/i.test(sql)) throw new Error("read-only: SELECT only");
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  const body = await res.json();
  if (!res.ok || (body && body.message)) throw new Error(body?.message ?? `HTTP ${res.status}`);
  return body;
}
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;

const server = await import("../src/lib/talent-site/design-upgrade.server.ts");

const releases = await select("SELECT design_slug, to_version, status, channel FROM public.talent_theme_releases");
const latest = server.pickLatestReleased(releases);

const sites = await select(`
  SELECT s.id, s.talent_profile_id, p.profile_code, p.user_id, p.display_name, p.is_demo,
         s.theme_design_slug, s.theme_design_version, s.theme_look_slug, s.theme_token_origin,
         s.shell_tree, s.shell_published, s.design_tokens_draft, s.design_tokens, s.draft_rev,
         h.id AS home_id, h.blocks AS home_blocks,
         (SELECT count(*) FROM public.talent_pages g
           WHERE g.talent_profile_id = s.talent_profile_id
             AND g.blocks IS DISTINCT FROM g.blocks_published)::int AS pages_unpublished
    FROM public.talent_sites s
    JOIN public.talent_profiles p ON p.id = s.talent_profile_id AND p.deleted_at IS NULL
    LEFT JOIN public.talent_pages h ON h.talent_profile_id = s.talent_profile_id AND h.is_home
   WHERE s.site_published_at IS NOT NULL AND s.theme_design_slug IS NOT NULL
     ${DESIGN ? `AND s.theme_design_slug = ${lit(DESIGN)}` : ""}
   ORDER BY s.theme_design_slug, s.theme_design_version, p.profile_code`);

const payloadCache = new Map();
async function payloadAt(slug, version) {
  const k = `${slug}@${version}`;
  if (!payloadCache.has(k)) {
    let rows = await select(`SELECT payload FROM public.talent_theme_versions WHERE design = ${lit(slug)} AND version = ${Number(version)}`);
    if (!rows.length) {
      rows = await select(
        `SELECT payload FROM public.talent_theme_catalog WHERE kind = 'design' AND slug = ${lit(slug)} AND version = ${Number(version)}`,
      );
    }
    payloadCache.set(k, rows[0]?.payload ?? null);
  }
  return payloadCache.get(k);
}

/** Highest stamped design version inside a published shell (stale-publish check). */
function stamps(tree, out = []) {
  if (Array.isArray(tree)) tree.forEach((n) => stamps(n, out));
  else if (tree && typeof tree === "object") {
    const o = tree.props?.__origin ?? tree.__origin;
    if (o && Number.isInteger(o.version)) out.push(o.version);
    if (Array.isArray(tree.children)) stamps(tree.children, out);
  }
  return out;
}

const toRow = (s) => ({
  siteId: s.id,
  talentProfileId: s.talent_profile_id,
  userId: s.user_id,
  profileCode: s.profile_code,
  designSlug: s.theme_design_slug,
  pinnedVersion: s.theme_design_version,
  shellTree: s.shell_tree,
  homeBlocks: s.home_blocks ?? [],
  designTokensDraft: s.design_tokens_draft,
  themeTokenOrigin: s.theme_token_origin,
  themeLookSlug: s.theme_look_slug,
  isDemo: s.is_demo === true,
  homePageId: s.home_id,
  draftRev: s.draft_rev ?? 0,
  live: {
    shellTree: s.shell_tree,
    shellPublished: s.shell_published,
    designTokensDraft: s.design_tokens_draft,
    designTokens: s.design_tokens,
    pagesUnpublished: s.pages_unpublished ?? 0,
  },
});

let admin = null;
if (APPLY) {
  const { createServiceRoleClient } = await import("../src/lib/supabase/admin.ts");
  admin = createServiceRoleClient();
  if (!admin) fail("service-role client unavailable (SUPABASE_SERVICE_ROLE_KEY).");
}

console.log(`[upgrade-site-designs] mode=${APPLY ? "APPLY" : "DRY-RUN (read-only)"} project=${REF}`);
console.log(`Latest released: ${[...latest].map(([k, v]) => `${k}=v${v}`).join(", ") || "(none)"}`);

const counts = { upgrade: 0, current: 0, error: 0, noBase: 0, stalePublish: 0, applied: 0, needsPublish: 0 };
const list = sites.filter((s) => !SITE || s.profile_code === SITE);
if (SITE && list.length === 0) fail(`no published site with profile_code ${SITE}`);
if (APPLY && !SITE && !ALL) fail("nothing selected");

for (const s of list) {
  const target = latest.get(s.theme_design_slug);
  const tag = `${s.profile_code}${s.is_demo ? " [demo]" : ""} ${s.theme_design_slug}`;
  if (!target) {
    console.log(`${tag}: no released version known; skipped`);
    continue;
  }
  const shellStamp = Math.max(-1, ...stamps(s.shell_published));
  const stale = shellStamp >= 0 && s.theme_design_version != null && shellStamp < s.theme_design_version;
  if (stale) counts.stalePublish += 1;
  const targetPayload = s.theme_design_version >= target ? null : await payloadAt(s.theme_design_slug, target);
  if (s.theme_design_version < target && !targetPayload) {
    counts.error += 1;
    console.log(`${tag}: v${s.theme_design_version} -> v${target}  ERROR no snapshot for the released version`);
    continue;
  }
  const plan = await server.planSiteUpgrade(
    toRow(s),
    { version: target, payload: targetPayload },
    (v) => payloadAt(s.theme_design_slug, v),
  );
  if (plan.kind === "up_to_date") {
    counts.current += 1;
    console.log(`${tag}: v${s.theme_design_version} current${stale ? `  STALE-PUBLISH (live shell stamped v${shellStamp}, needs publish)` : ""}`);
    continue;
  }
  if (plan.kind === "error") {
    counts.error += 1;
    console.log(`${tag}: v${s.theme_design_version} -> v${target}  ERROR ${plan.error}`);
    continue;
  }
  counts.upgrade += 1;
  if (plan.upgrade.noBase) counts.noBase += 1;
  const u = plan.upgrade.summary;
  const kept = u.keptEdits.map((k) => `${k.kind}:${k.key}${k.prop ? `.${k.prop}` : ""}`);
  console.log(
    `${tag}: v${plan.upgrade.fromVersion ?? "none"} -> v${plan.upgrade.toVersion}  tokens=${u.tokensChanged} sections=${u.sectionsChanged} (+${u.sectionsAdded}/-${u.sectionsRemoved}) conflicts=${u.conflicts}` +
      `${plan.upgrade.noBase ? "  NO-BASE(additions only, not applicable)" : ""}  ${plan.canPublish ? "publishable" : "needs publish (live differs from draft)"}` +
      `${stale ? `  STALE-PUBLISH(v${shellStamp})` : ""}\n    kept edits (${kept.length}): ${kept.join(", ") || "none"}`,
  );
  if (APPLY) {
    const titleRow = await select(`SELECT title FROM public.talent_theme_catalog WHERE kind='design' AND slug=${lit(s.theme_design_slug)}`);
    const r = await server.applySitePlan(admin, plan, titleRow[0]?.title ?? s.theme_design_slug, null);
    if (!r.ok) {
      counts.error += 1;
      console.log(`    APPLY FAILED: ${r.error}`);
    } else if (r.published) {
      counts.applied += 1;
      console.log("    applied + published");
    } else {
      counts.applied += 1;
      counts.needsPublish += 1;
      console.log("    draft written: needs publish");
    }
  }
}
console.log(`\nSummary: ${JSON.stringify(counts)}${APPLY ? "" : "  (dry run: nothing written)"}`);
process.exit(counts.error > 0 ? 2 : 0);
