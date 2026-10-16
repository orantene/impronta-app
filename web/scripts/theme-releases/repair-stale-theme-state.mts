/**
 * THEME CORE P1 repair (audit rec. 5 + 6). DRY RUN BY DEFAULT: reads only and prints.
 *
 *   1. closes `available` / `previewed` / `undone` update rows whose release is at
 *      or below the site's pin (stored as state `applied`, report.reason
 *      "superseded_by_pin": the state CHECK has no "superseded")
 *   2. sets `talent_theme_catalog.version` to the latest snapshot ONLY when the row's
 *      stored payload already equals that snapshot (version-only drift). A row that
 *      carries an older payload is listed as HELD and left for "Make default".
 *   3. lists sites pinned to a version with no snapshot (solace / mono / frame
 *      gridline demos at v1). With `--backfill-v1-snapshots` it also proposes (and, with
 *      --apply --yes, writes) the missing v1 snapshot from the CURRENT code seed,
 *      source "repair:v1-code-seed". That is only right when v1 == today's seed:
 *      read the proposal first.
 *   4. REPORT ONLY: every site whose LIVE shell stamp differs from its pin (a pin
 *      that moved without a publish is STALE-PUBLISH, e.g. TAL-93900: live v21, pin v23).
 *
 * Never reads or writes TAL-93938. Never writes a site tree (no talent_pages /
 * talent_sites writes at all). Every row / site is printed with code + slug before
 * anything is written. A JSON backup is written first; `--restore <file>` undoes it.
 *
 * Run (from web/), same stubs and target guard as stamp-sites.mts:
 *   NODE_PATH=scripts/demo-talents/stubs DEMO_SEED_TARGET_REF=<ref> \
 *     npx tsx --tsconfig scripts/demo-talents/tsconfig.json --env-file=.env.local \
 *     scripts/theme-releases/repair-stale-theme-state.mts [--backfill-v1-snapshots] [--apply --yes]
 *   ... --restore tmp-backups/theme-core-p1-<stamp>.json [--apply --yes]
 */
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

const { planRepair, maxStampVersion, PROTECTED_PROFILE_CODES } = await import(
  "../../src/lib/talent-site/theme-releases/repair-stale-theme-state"
);
const { stableStringify } = await import("../../src/lib/talent-site/theme-releases/origin");
const { OPEN_UPDATE_STATES } = await import("../../src/lib/talent-site/theme-releases/talent-update/view");
const { BUILTIN_DESIGNS } = await import("../../src/lib/talent-site/theme-catalog/builtins");
const { COLLECTION_DESIGNS } = await import("../../src/lib/talent-site/theme-catalog/collection/designs");
const { MAISON_BUILTIN_DESIGN } = await import("../../src/lib/talent-site/theme-catalog/maison/builtins");
const { planDemoFollow } = await import("../../src/lib/talent-site/theme-releases/manager/demo-follow");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
const targetRef = process.env.DEMO_SEED_TARGET_REF?.trim();
if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
if (!targetRef || !url.includes(`${targetRef}.supabase.co`)) {
  throw new Error(`REFUSE: DEMO_SEED_TARGET_REF (${targetRef}) does not match ${url}`);
}

const args = process.argv.slice(2);
const opt = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const apply = args.includes("--apply");
const yes = args.includes("--yes");
const backfillV1 = args.includes("--backfill-v1-snapshots");
const restoreFile = opt("--restore");
if (apply && !yes) throw new Error("--apply needs --yes");
const write = apply && yes;

const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const MARK = "repair:v1-code-seed";

type Backup = {
  at: string;
  updates: Array<{ id: string; state: string; report: unknown }>;
  catalog: Array<{ slug: string; from: number; to: number }>;
  snapshots: Array<{ design: string; version: number }>;
};

type Cond = readonly ["in", string, readonly string[]] | readonly ["eq", string, string];

async function page<T>(table: string, cols: string, conds: readonly Cond[] = []): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 500) {
    let q = admin.from(table).select(cols);
    for (const c of conds) q = c[0] === "in" ? q.in(c[1], [...c[2]]) : q.eq(c[1], c[2]);
    const { data, error } = await q.range(from, from + 499);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...((data ?? []) as unknown as T[]));
    if (!data || data.length < 500) break;
  }
  return out;
}

if (restoreFile) {
  const b = JSON.parse(fs.readFileSync(restoreFile, "utf8")) as Backup;
  console.log(`[restore] ${restoreFile}: ${b.updates.length} update row(s), ${b.catalog.length} catalog row(s), ${b.snapshots.length} snapshot(s)`);
  for (const u of b.updates) console.log(`  row ${u.id} -> ${u.state}`);
  for (const c of b.catalog) console.log(`  catalog ${c.slug} v${c.to} -> v${c.from}`);
  for (const s of b.snapshots) console.log(`  snapshot ${s.design}@${s.version} (deleted only if source=${MARK})`);
  if (!write) {
    console.log("[dry run] nothing written. Add --apply --yes to restore.");
    process.exit(0);
  }
  for (const u of b.updates) {
    const { error } = await admin
      .from("talent_site_theme_updates")
      .update({ state: u.state, report: u.report, updated_at: new Date().toISOString() } as never)
      .eq("id", u.id)
      .eq("state", "applied");
    if (error) throw new Error(`restore row ${u.id}: ${error.message}`);
  }
  for (const c of b.catalog) {
    const { error } = await admin.from("talent_theme_catalog").update({ version: c.from } as never).eq("kind", "design").eq("slug", c.slug).eq("version", c.to);
    if (error) throw new Error(`restore catalog ${c.slug}: ${error.message}`);
  }
  for (const s of b.snapshots) {
    const { error } = await admin.from("talent_theme_versions").delete().eq("design", s.design).eq("version", s.version).eq("source", MARK);
    if (error) throw new Error(`restore snapshot ${s.design}@${s.version}: ${error.message}`);
  }
  console.log("Restored.");
  process.exit(0);
}

// The protected profile is looked up only to be excluded from every read below.
const protectedProfiles = await page<{ id: string }>("talent_profiles", "id", [["in", "profile_code", PROTECTED_PROFILE_CODES]]);
const protectedIds = new Set(protectedProfiles.map((p) => p.id));

const profiles = await page<{ id: string; profile_code: string; is_demo: boolean | null }>("talent_profiles", "id, profile_code, is_demo");
const profileOf = new Map(profiles.map((p) => [p.id, p]));
const siteRows = (
  await page<{
    id: string;
    talent_profile_id: string;
    site_slug: string | null;
    theme_design_slug: string | null;
    theme_design_version: number | null;
    shell_published: unknown;
    site_published_at: string | null;
  }>("talent_sites", "id, talent_profile_id, site_slug, theme_design_slug, theme_design_version, shell_published, site_published_at")
).filter((s) => !protectedIds.has(s.talent_profile_id));

const sites = siteRows
  .filter((s) => profileOf.has(s.talent_profile_id))
  .map((s) => {
    const p = profileOf.get(s.talent_profile_id)!;
    return {
      siteId: s.id,
      profileCode: p.profile_code,
      siteSlug: s.site_slug,
      isDemo: p.is_demo === true,
      designSlug: s.theme_design_slug,
      pin: typeof s.theme_design_version === "number" ? s.theme_design_version : null,
      liveStamp: s.site_published_at ? maxStampVersion(s.shell_published) : null,
    };
  });

const updateRows = await page<{ id: string; talent_site_id: string; release_id: string; state: string; report: Record<string, unknown> | null }>(
  "talent_site_theme_updates",
  "id, talent_site_id, release_id, state, report",
  [["in", "state", OPEN_UPDATE_STATES]],
);
const releases = await page<{ id: string; design_slug: string; to_version: number; channel: string; status: string }>(
  "talent_theme_releases",
  "id, design_slug, to_version, channel, status",
);
const catalog = await page<{ slug: string; version: number; payload: unknown }>("talent_theme_catalog", "slug, version, payload", [["eq", "kind", "design"]]);
const snaps = await page<{ design: string; version: number; payload: unknown }>("talent_theme_versions", "design, version, payload");

const seeds = new Map<string, unknown>();
for (const e of [...BUILTIN_DESIGNS, MAISON_BUILTIN_DESIGN, ...COLLECTION_DESIGNS]) seeds.set(e.slug, e.buildPayload());

const plan = planRepair({
  sites,
  rows: updateRows.map((r) => ({ id: r.id, siteId: r.talent_site_id, releaseId: r.release_id, state: r.state, report: r.report })),
  releases: releases.map((r) => ({ id: r.id, designSlug: r.design_slug, toVersion: r.to_version })),
  catalog: catalog.map((c) => ({ slug: c.slug, version: c.version, payloadKey: stableStringify(c.payload) })),
  snapshots: snaps.map((s) => ({ design: s.design, version: s.version, payloadKey: stableStringify(s.payload) })),
  seedableDesigns: new Set(seeds.keys()),
});

console.log(`Target ${targetRef}. Mode: ${write ? "APPLY" : "DRY RUN"}. Protected (never read): ${PROTECTED_PROFILE_CODES.join(", ")}.`);
console.log(`\n[1] Stale update rows to close (${plan.supersede.length})`);
for (const s of plan.supersede) {
  console.log(`  row ${s.id}  ${s.profileCode}  /${s.siteSlug ?? "?"}  ${s.designSlug}  release->v${s.toVersion}  pin v${s.pin}  ${s.before.state} -> applied(superseded_by_pin)`);
}
console.log(`\n[2] Catalog version drift`);
for (const c of plan.catalogFixes) console.log(`  FIX  ${c.slug}: v${c.from} -> v${c.to} (stored payload already equals the v${c.to} snapshot)`);
for (const c of plan.catalogHeld) console.log(`  HELD ${c.slug}: v${c.version}, latest snapshot v${c.latest}; payload differs, flip with "Make default", not touched`);
if (plan.catalogFixes.length + plan.catalogHeld.length === 0) console.log("  none");
console.log(`\n[3] Sites pinned to a version with NO snapshot (${plan.missingSnapshots.length}), report only`);
for (const m of plan.missingSnapshots) console.log(`  ${m.profileCode}  /${m.siteSlug ?? "?"}  ${m.designSlug}@v${m.pin}  ${m.isDemo ? "demo" : "REAL"}`);
console.log(`  v1 backfill candidates${backfillV1 ? "" : " (not written without --backfill-v1-snapshots)"}:`);
for (const b of plan.backfillCandidates) {
  console.log(`    ${b.design}@v${b.version}  seed ${b.seedable ? "available" : "MISSING (skipped)"}  sites: ${b.sites.join(", ")}`);
}
console.log(`\n[4] Live shell stamp differs from pin (${plan.stampMismatch.length}), report only`);
for (const m of plan.stampMismatch) {
  console.log(`  ${m.kind}  ${m.profileCode}  /${m.siteSlug ?? "?"}  ${m.designSlug}  pin v${m.pin}  live v${m.live}  ${m.isDemo ? "demo" : "REAL"}${m.kind === "STALE-PUBLISH" ? "  needs a publish" : ""}`);
}
console.log(`\n[5] Demos vs the demo channel, report only`);
for (const design of new Set(sites.filter((s) => s.isDemo && s.designSlug).map((s) => s.designSlug as string))) {
  const target = releases
    .filter((r) => r.design_slug === design && r.status === "published" && ["demos", "optin", "default"].includes(r.channel))
    .reduce<number | null>((m, r) => (m === null || r.to_version > m ? r.to_version : m), null);
  const f = planDemoFollow({
    target,
    snapshotVersions: snaps.filter((s) => s.design === design).map((s) => s.version),
    demos: sites.filter((s) => s.isDemo && s.designSlug === design).map((s) => ({ code: s.profileCode, pin: s.pin })),
  });
  console.log(`  ${design}: target ${target === null ? "none" : `v${target}`}  behind ${f.behind.map((d) => `${d.code}@${d.pin}`).join(",") || "-"}  ahead ${f.ahead.map((d) => `${d.code}@${d.pin}`).join(",") || "-"}  no-snapshot ${f.noSnapshot.map((d) => `${d.code}@${d.pin}`).join(",") || "-"}  => ${f.action}`);
}

const backfillWrites = backfillV1 ? plan.backfillCandidates.filter((b) => b.seedable) : [];
if (!write) {
  console.log("\n[dry run] nothing written. Re-run with --apply --yes to write [1], [2] FIX" + (backfillV1 ? " and the v1 backfill." : "."));
  process.exit(0);
}

fs.mkdirSync("tmp-backups", { recursive: true });
const backupPath = `tmp-backups/theme-core-p1-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
const backup: Backup = {
  at: new Date().toISOString(),
  updates: plan.supersede.map((s) => ({ id: s.id, state: s.before.state, report: s.before.report })),
  catalog: plan.catalogFixes.map((c) => ({ slug: c.slug, from: c.from, to: c.to })),
  snapshots: backfillWrites.map((b) => ({ design: b.design, version: b.version })),
};
fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2));
console.log(`\nBackup written: ${backupPath}`);

for (const s of plan.supersede) {
  const { error } = await admin
    .from("talent_site_theme_updates")
    .update({ state: "applied", report: s.report, updated_at: new Date().toISOString() } as never)
    .eq("id", s.id)
    .in("state", [...OPEN_UPDATE_STATES]);
  if (error) throw new Error(`row ${s.id}: ${error.message}`);
  console.log(`  closed ${s.id} (${s.profileCode})`);
}
for (const c of plan.catalogFixes) {
  const { error } = await admin.from("talent_theme_catalog").update({ version: c.to } as never).eq("kind", "design").eq("slug", c.slug).eq("version", c.from);
  if (error) throw new Error(`catalog ${c.slug}: ${error.message}`);
  console.log(`  catalog ${c.slug} v${c.from} -> v${c.to}`);
}
for (const b of backfillWrites) {
  const { error } = await admin
    .from("talent_theme_versions")
    .upsert([{ design: b.design, version: b.version, payload: seeds.get(b.design), source: MARK }] as never, { onConflict: "design,version", ignoreDuplicates: true });
  if (error) throw new Error(`snapshot ${b.design}@${b.version}: ${error.message}`);
  console.log(`  snapshot ${b.design}@v${b.version} (${MARK})`);
}
console.log("Done. Re-run without --apply to confirm lists [1] and [2] are empty.");
