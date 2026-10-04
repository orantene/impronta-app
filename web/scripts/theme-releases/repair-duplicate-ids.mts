/**
 * F131 repair: find (and optionally fix) duplicate node ids in talent page
 * trees. Node ids must be unique across a whole tree; a block added from a
 * newer design payload could reuse positional ids (`maison-v2-39`) and block
 * Publish.
 *
 * Scans talent_pages.blocks (DRAFT), talent_pages.blocks_published (LIVE) and
 * talent_sites.shell_tree / shell_published. READ-ONLY by default: reports
 * which talents are affected (demo / qa / real).
 *
 * Buckets come from talent_profiles.is_demo plus an explicit QA allow-list; only
 * demo and allow-listed QA accounts can ever be rewritten.
 * With `--yes --allow TAL-93901,TAL-93900` it rewrites ids in the DRAFT only
 * (talent_pages.blocks and talent_sites.shell_tree), for the listed profile
 * codes only, after writing a backup JSON of the original trees. Add
 * `--published` to also rewrite the published trees (backup first).
 * The first occurrence of an id keeps it; later ones get a fresh `-uN` id.
 *
 * Run (from web/):
 *   node --env-file=.env.local --import tsx scripts/theme-releases/repair-duplicate-ids.mts
 *   node --env-file=.env.local --import tsx scripts/theme-releases/repair-duplicate-ids.mts --yes --allow TAL-93901
 */
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";
import { classify, mayRepair, repairTree, scanTree, type Finding } from "./repair-duplicate-ids-lib";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");

const args = process.argv.slice(2);
const yes = args.includes("--yes");
const published = args.includes("--published");
const allowIdx = args.indexOf("--allow");
const allow = new Set(
  (allowIdx >= 0 ? (args[allowIdx + 1] ?? "") : "").split(",").map((c) => c.trim()).filter(Boolean),
);
if (yes && allow.size === 0) throw new Error("--yes needs --allow <profile codes, comma separated>");

const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

type Profile = { id: string; profile_code: string; is_demo: boolean | null };
type PageRow = { id: string; talent_profile_id: string; is_home: boolean | null; slug: string | null; blocks: unknown; blocks_published: unknown };
type SiteRow = { id: string; talent_profile_id: string; shell_tree: unknown; shell_published: unknown };

async function all<T>(table: string, cols: string): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await admin.from(table).select(cols).range(from, from + 499);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...((data ?? []) as unknown as T[]));
    if (!data || data.length < 500) break;
  }
  return out;
}

const profiles = await all<Profile>("talent_profiles", "id, profile_code, is_demo");
const codeOf = new Map(profiles.map((p) => [p.id, p.profile_code]));
const demoOf = new Map(profiles.map((p) => [p.id, p.is_demo === true]));
const pages = await all<PageRow>("talent_pages", "id, talent_profile_id, is_home, slug, blocks, blocks_published");
const sites = await all<SiteRow>("talent_sites", "id, talent_profile_id, shell_tree, shell_published");

type Hit = { profileId: string; code: string; findings: Finding[]; fixable: Array<{ table: string; id: string; column: string; tree: unknown }> };
const hits = new Map<string, Hit>();
const hit = (profileId: string): Hit => {
  let h = hits.get(profileId);
  if (!h) {
    h = { profileId, code: codeOf.get(profileId) ?? profileId, findings: [], fixable: [] };
    hits.set(profileId, h);
  }
  return h;
};

for (const p of pages) {
  const label = p.is_home ? "home" : (p.slug ?? p.id);
  for (const [column, where] of [["blocks", "draft"], ["blocks_published", "published"]] as const) {
    const f = scanTree(`page:${label}:${where}`, p[column]);
    if (!f) continue;
    const h = hit(p.talent_profile_id);
    h.findings.push(f);
    if (column === "blocks" || published) h.fixable.push({ table: "talent_pages", id: p.id, column, tree: p[column] });
  }
}
for (const s of sites) {
  for (const [column, where] of [["shell_tree", "draft"], ["shell_published", "published"]] as const) {
    const f = scanTree(`shell:${where}`, s[column]);
    if (!f) continue;
    const h = hit(s.talent_profile_id);
    h.findings.push(f);
    if (column === "shell_tree" || published) h.fixable.push({ table: "talent_sites", id: s.id, column, tree: s[column] });
  }
}

console.log(`Scanned ${pages.length} talent_pages, ${sites.length} talent_sites.`);
console.log(`${hits.size} talent(s) with duplicate node ids:`);
for (const bucket of ["demo", "qa", "real"] as const) {
  const rows = [...hits.values()].filter((h) => classify(h.code, demoOf.get(h.profileId) === true) === bucket);
  console.log(`\n[${bucket}] ${rows.length}`);
  for (const h of rows) {
    console.log(`  ${h.code} (${h.profileId})`);
    for (const f of h.findings) console.log(`    ${f.where}: ${f.duplicates.slice(0, 6).join(", ")}${f.duplicates.length > 6 ? ", ..." : ""}`);
  }
}

if (!yes) {
  console.log("\n[dry run] nothing written. Re-run with --yes --allow <codes> to repair drafts.");
  process.exit(0);
}

const targets = [...hits.values()].filter((h) => allow.has(h.code) && mayRepair(h.code, demoOf.get(h.profileId) === true) && h.fixable.length > 0);
const skipped = [...allow].filter((c) => !targets.some((h) => h.code === c));
if (skipped.length > 0) console.log(`\nNot repaired (no duplicates, or not a demo / allow-listed QA account):: ${skipped.join(", ")}`);
if (targets.length === 0) process.exit(0);

mkdirSync("tmp-backups", { recursive: true });
const backupPath = `tmp-backups/duplicate-ids-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
writeFileSync(
  backupPath,
  JSON.stringify(targets.map((h) => ({ code: h.code, profileId: h.profileId, trees: h.fixable })), null, 2),
);
console.log(`\nBackup written: ${backupPath}`);

for (const h of targets) {
  for (const t of h.fixable) {
    const { tree, remapped } = repairTree(t.tree);
    const { error } = await admin.from(t.table).update({ [t.column]: tree } as never).eq("id", t.id);
    if (error) throw new Error(`${h.code} ${t.table}.${t.column}: ${error.message}`);
    console.log(`  ${h.code}: ${t.table}.${t.column} ${t.id} remapped ${remapped} id(s)`);
  }
}
