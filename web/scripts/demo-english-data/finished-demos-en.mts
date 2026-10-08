/**
 * TUL-323: give the existing finished Spanish-primary demos their English page.
 * Adds 'en' to secondary_locales (only where it is empty) and the English hero
 * headline and tagline (add-only). Decisions live in ./finished-demos-en.ts
 * (pure, tested with fakes); this file only wires the database.
 *
 * DRY RUN by default: prints each profile code, id and site slug, then every
 * planned change. Writing needs BOTH --apply and --yes. The old values go to
 * scripts/demo-english-data/backups/ (gitignored) before the first write;
 * `--restore <backup.json>` (plus --apply --yes) puts exactly those back.
 * Allow-list only; TAL-93938 and TAL-93900 are refused by name.
 *
 * Run (from web/), by the Project Manager:
 *   npx tsx --env-file=.env.local scripts/demo-english-data/finished-demos-en.mts
 *   npx tsx --env-file=.env.local scripts/demo-english-data/finished-demos-en.mts --apply --yes
 *   npx tsx --env-file=.env.local scripts/demo-english-data/finished-demos-en.mts --restore <backup.json> --apply --yes
 *   (optional) --only TAL-93003,TAL-93011
 */
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { run, type HeroKey, type Io, type ProfileRow } from "./finished-demos-en";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
if (!url || !key) {
  console.error("REFUSED: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required (run with --env-file=.env.local).");
  process.exit(2);
}
const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const BACKUP_DIR = join(dirname(fileURLToPath(import.meta.url)), "backups");

async function definitionId(fieldKey: string): Promise<string> {
  const { data, error } = await admin.from("profile_field_definitions").select("id").eq("field_key", fieldKey).maybeSingle();
  if (error) throw new Error(`definition read failed: ${error.message}`);
  if (!data) throw new Error(`field definition ${fieldKey} is missing`);
  return (data as { id: string }).id;
}

const io: Io = {
  async findProfile(profileCode) {
    const { data, error } = await admin
      .from("talent_profiles")
      .select("id, profile_code, is_demo, preferred_locale, secondary_locales")
      .eq("profile_code", profileCode)
      .maybeSingle();
    if (error) throw new Error(`profile read failed: ${error.message}`);
    return (data as ProfileRow | null) ?? null;
  },
  async findSiteSlug(profileId) {
    const { data, error } = await admin.from("talent_sites").select("site_slug").eq("talent_profile_id", profileId).maybeSingle();
    if (error) throw new Error(`site read failed: ${error.message}`);
    return (data as { site_slug: string | null } | null)?.site_slug ?? null;
  },
  async readHeroMap(profileId, heroKey: HeroKey) {
    const defId = await definitionId(`identity.${heroKey}`);
    const { data, error } = await admin
      .from("talent_profile_field_values")
      .select("value")
      .eq("talent_profile_id", profileId)
      .eq("field_definition_id", defId)
      .maybeSingle();
    if (error) throw new Error(`field value read failed: ${error.message}`);
    return data ? (data as { value: unknown }).value : undefined;
  },
  async setSecondaryLocales(profileId, value) {
    const { data, error } = await admin
      .from("talent_profiles")
      .update({ secondary_locales: value, updated_at: new Date().toISOString() })
      .eq("id", profileId)
      .eq("is_demo", true)
      .select("id");
    if (error) return { ok: false, error: error.message };
    if (!data || data.length !== 1) return { ok: false, error: "row not updated (no match)" };
    return { ok: true };
  },
  async setHeroMap(profileId, heroKey, value) {
    const defId = await definitionId(`identity.${heroKey}`);
    if (value === null) {
      const { error } = await admin.from("talent_profile_field_values").delete().eq("talent_profile_id", profileId).eq("field_definition_id", defId);
      return error ? { ok: false, error: error.message } : { ok: true };
    }
    // The hub tenant scopes the field value rows, like the hero-facts writer does.
    const { data: prof, error: pErr } = await admin.from("talent_profile_field_values").select("tenant_id").eq("talent_profile_id", profileId).limit(1).maybeSingle();
    if (pErr) return { ok: false, error: pErr.message };
    let tenantId = (prof as { tenant_id: string } | null)?.tenant_id ?? null;
    if (!tenantId) {
      const { data: hubs, error: hErr } = await admin.from("agencies").select("id").eq("kind", "hub").eq("plan_tier", "network").eq("status", "active");
      if (hErr) return { ok: false, error: hErr.message };
      if (hubs?.length !== 1) return { ok: false, error: `expected exactly one active hub, found ${hubs?.length ?? 0}` };
      tenantId = (hubs[0] as { id: string }).id;
    }
    const { error } = await admin.from("talent_profile_field_values").upsert(
      {
        tenant_id: tenantId,
        talent_profile_id: profileId,
        field_definition_id: defId,
        value,
        workflow_state: "live",
        last_edited_role: "platform",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "talent_profile_id,field_definition_id" },
    );
    return error ? { ok: false, error: error.message } : { ok: true };
  },
  writeBackup(data) {
    mkdirSync(BACKUP_DIR, { recursive: true });
    const file = join(BACKUP_DIR, `tul-323-finished-demos-en-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    writeFileSync(file, JSON.stringify(data, null, 2));
    return file;
  },
  readBackup(path) {
    return JSON.parse(readFileSync(path, "utf8")) as unknown;
  },
};

const result = await run(process.argv.slice(2), io);
for (const line of result.lines) console.log(line);
process.exit(result.exitCode);
