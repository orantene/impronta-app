/**
 * THEME RELEASES: backfill `talent_theme_versions` (migration 20261231299570).
 *
 *   - every current catalog Design row → (slug, version, payload, "catalog")
 *   - `--from-json <file.json> --version <n> --source <label>`: extra snapshots of
 *     older versions rebuilt from git (a JSON map slug → payload, produced by
 *     building `collection/designs.ts` at the commit the catalog synced).
 * Existing (design, version) rows are never overwritten. Dry run by default.
 *
 * Run (from web/):
 *   npx tsx --env-file=.env.local scripts/theme-releases/snapshot-versions.mts \
 *     [--from-json maison-v13.json --version 13 --source commit:7c1e220fe1 --only maison-v2] [--yes-write]
 */
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

const args = process.argv.slice(2);
const opt = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const write = args.includes("--yes-write");
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type Row = { design: string; version: number; payload: unknown; source: string };
const rows: Row[] = [];

const { data: catalog, error } = await admin
  .from("talent_theme_catalog")
  .select("slug, version, payload")
  .eq("kind", "design");
if (error) throw error;
for (const r of catalog ?? []) {
  rows.push({ design: r.slug as string, version: r.version as number, payload: r.payload, source: "catalog" });
}

const gitFile = opt("--from-json");
if (gitFile) {
  const version = Number(opt("--version"));
  const source = opt("--source") ?? "commit";
  const onlySlugs = opt("--only")?.split(",");
  if (!Number.isInteger(version) || version < 1) throw new Error("--version <n> required with --from-json");
  const payloads = JSON.parse(fs.readFileSync(gitFile, "utf8")) as Record<string, unknown>;
  for (const [slug, payload] of Object.entries(payloads)) {
    if (onlySlugs && !onlySlugs.includes(slug)) continue;
    rows.push({ design: slug, version, payload, source });
  }
}

const { data: existing } = await admin.from("talent_theme_versions").select("design, version");
const have = new Set((existing ?? []).map((r) => `${r.design}@${r.version}`));
const todo = rows.filter((r) => !have.has(`${r.design}@${r.version}`));
for (const r of rows) {
  console.log(`${have.has(`${r.design}@${r.version}`) ? "exists " : write ? "insert " : "[dry] insert "}${r.design}@${r.version} (${r.source})`);
}
if (write && todo.length > 0) {
  const { error: wErr } = await admin
    .from("talent_theme_versions")
    .upsert(todo, { onConflict: "design,version", ignoreDuplicates: true });
  if (wErr) throw wErr;
}
const { count } = await admin.from("talent_theme_versions").select("*", { count: "exact", head: true });
console.log(`talent_theme_versions rows: ${count}`);
