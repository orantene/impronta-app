/**
 * enable-demo-english.mts: add 'en' to talent_profiles.secondary_locales for the
 * demo sites whose /en used to 404 (karla-beltran, diego-navarro-dj,
 * saul-tapia-ortega, tomas-retratos, valeria-baila).
 *
 * GUARDED, run by the PM (never by an agent against production):
 *   cd web
 *   tsx --env-file=.env.local scripts/enable-demo-english.mts              # DRY RUN (default): prints before/after, writes nothing
 *   tsx --env-file=.env.local scripts/enable-demo-english.mts --apply      # writes a backup file first, then updates
 *   tsx --env-file=.env.local scripts/enable-demo-english.mts --restore <backup.json>   # puts the exact old secondary_locales back
 *
 * Safety: explicit slug allow-list (no flag-driven selection), the profile must
 * also have is_demo = true, only secondary_locales is touched, 'en' is appended
 * (existing values kept), rows that already speak English are skipped.
 *
 * CAVEAT: enabling English makes /en render with English chrome; a demo whose
 * content has no English version shows its Spanish text there until translated
 * (card: demo language leaks). Decide before applying.
 *
 * ENV: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { planDemoEnglish, DEMO_ENGLISH_SLUGS } from "../src/lib/talent-site/demo-english-plan";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const admin = createClient(url, key, { auth: { persistSession: false } }) as SupabaseClient;
const argv = process.argv.slice(2);
const APPLY = argv.includes("--apply");
const restoreIdx = argv.indexOf("--restore");

async function main(): Promise<void> {
  if (restoreIdx >= 0) {
    const file = argv[restoreIdx + 1];
    if (!file) throw new Error("--restore needs the backup file path");
    const backup = JSON.parse(readFileSync(resolve(file), "utf8")) as { rows: { id: string; slug: string; before: string[] }[] };
    for (const r of backup.rows) {
      const { error } = await admin.from("talent_profiles").update({ secondary_locales: r.before }).eq("id", r.id);
      console.log(error ? `FAILED ${r.slug}: ${error.message}` : `restored ${r.slug} -> [${r.before.join(",")}]`);
    }
    return;
  }
  const { data: sites, error } = await admin
    .from("talent_sites")
    .select("site_slug, talent_profile_id, talent_profiles!inner(id, is_demo, preferred_locale, secondary_locales)")
    .in("site_slug", [...DEMO_ENGLISH_SLUGS]);
  if (error) throw new Error(`read failed: ${error.message}`);
  const rows = ((sites ?? []) as unknown as Array<{ site_slug: string; talent_profiles: { id: string; is_demo: boolean | null; preferred_locale: string | null; secondary_locales: string[] | null } }>).map((s) => ({
    slug: s.site_slug,
    id: s.talent_profiles.id,
    isDemo: s.talent_profiles.is_demo === true,
    preferred: s.talent_profiles.preferred_locale,
    secondary: s.talent_profiles.secondary_locales ?? [],
  }));
  const plan = planDemoEnglish(rows);
  for (const p of plan) console.log(`${APPLY ? "APPLY" : "DRY"} ${p.slug}: ${p.action}${p.action === "enable" ? `  [${p.before.join(",")}] -> [${p.after.join(",")}]` : `  (${p.reason})`}`);
  const todo = plan.filter((p) => p.action === "enable");
  if (!APPLY) {
    console.log(`dry run: ${todo.length} row(s) would change. Re-run with --apply.`);
    return;
  }
  const backupFile = resolve(`.tmp-enable-demo-english-${Date.now()}.json`);
  mkdirSync(dirname(backupFile), { recursive: true });
  writeFileSync(backupFile, JSON.stringify({ rows: todo.map((p) => ({ id: p.id, slug: p.slug, before: p.before })) }, null, 2));
  console.log(`backup written: ${backupFile}`);
  for (const p of todo) {
    const { error: upErr } = await admin.from("talent_profiles").update({ secondary_locales: p.after }).eq("id", p.id);
    console.log(upErr ? `FAILED ${p.slug}: ${upErr.message}` : `updated ${p.slug}`);
  }
}

void main();
