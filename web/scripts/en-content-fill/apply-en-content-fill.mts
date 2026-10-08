/**
 * TUL-15 Stage 5b layer B, script 1: add the ENGLISH key to the photo captions,
 * service categories and service titles/descriptions of the TEST talent
 * TAL-93900 (site jorg-beauty-qa). Everything is decided in ./plan.ts (pure,
 * tested with fakes); this file only wires the database.
 *
 * DRY RUN by default: reads, prints the profile code, id and site slug, then
 * every planned addition and every "needs English" row. Writes need
 * `--apply --site TAL-93900`. Only the `en` key is ever added; a non-empty `en`
 * is never overwritten; `es` and every other column/key stay as they are. The
 * old value of every field it changes goes to scripts/en-content-fill/backups/
 * (gitignored) BEFORE the first write; `--restore <backup.json>` puts exactly
 * those fields back.
 *
 * Run (from web/), by the Project Manager:
 *   npx tsx --env-file=.env.local scripts/en-content-fill/apply-en-content-fill.mts
 *   npx tsx --env-file=.env.local scripts/en-content-fill/apply-en-content-fill.mts --apply --site TAL-93900
 *   npx tsx --env-file=.env.local scripts/en-content-fill/apply-en-content-fill.mts --restore <backup.json>
 *   npx tsx --env-file=.env.local scripts/en-content-fill/apply-en-content-fill.mts --restore <backup.json> --apply --site TAL-93900
 *   (optional) --expect-profile-id <uuid>   pins the resolved profile id
 */
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { run, type Io, type OfferingRow, type PhotoRow, type ProfileRow } from "./plan";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
if (!url || !key) {
  console.error("REFUSED: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required (run with --env-file=.env.local).");
  process.exit(2);
}
const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const BACKUP_DIR = join(dirname(fileURLToPath(import.meta.url)), "backups");

const io: Io = {
  async findProfile(profileCode) {
    const { data, error } = await admin.from("talent_profiles").select("id, profile_code").eq("profile_code", profileCode).maybeSingle();
    if (error) throw new Error(`profile read failed: ${error.message}`);
    return (data as ProfileRow | null) ?? null;
  },
  async findSiteSlug(profileId) {
    const { data, error } = await admin.from("talent_sites").select("site_slug").eq("talent_profile_id", profileId).maybeSingle();
    if (error) throw new Error(`site read failed: ${error.message}`);
    return (data as { site_slug: string | null } | null)?.site_slug ?? null;
  },
  async listOfferings(profileId) {
    const { data, error } = await admin
      .from("talent_offerings")
      .select("id, title, description, category, title_i18n, description_i18n, category_i18n")
      .eq("talent_profile_id", profileId)
      .limit(1000);
    if (error) throw new Error(`offerings read failed: ${error.message}`);
    return (data ?? []) as OfferingRow[];
  },
  async listPhotos(profileId) {
    // The same ownership + liveness filter the caption editor uses (photo-caption-actions.ts).
    const { data, error } = await admin
      .from("media_assets")
      .select("id, metadata")
      .eq("owner_talent_profile_id", profileId)
      .is("deleted_at", null)
      .limit(2000);
    if (error) throw new Error(`media read failed: ${error.message}`);
    return (data ?? []) as PhotoRow[];
  },
  async setField({ table, profileId, id, field, value }) {
    if (table === "talent_offerings") {
      if (field !== "title_i18n" && field !== "description_i18n" && field !== "category_i18n") return { ok: false, error: `field ${field} is not an offering column` };
      // One column of one row, keyed by row id AND profile id.
      const { data, error } = await admin
        .from("talent_offerings")
        .update({ [field]: value })
        .eq("id", id)
        .eq("talent_profile_id", profileId)
        .select("id");
      if (error) return { ok: false, error: error.message };
      if (!data || data.length !== 1) return { ok: false, error: "row not updated (no match)" };
      return { ok: true };
    }
    if (field !== "metadata.caption_i18n") return { ok: false, error: `field ${field} is not a media field` };
    // Read-modify-write of ONE key of the metadata, keyed by row id AND owner profile id.
    const { data: cur, error: readErr } = await admin
      .from("media_assets")
      .select("metadata")
      .eq("id", id)
      .eq("owner_talent_profile_id", profileId)
      .is("deleted_at", null)
      .maybeSingle();
    if (readErr) return { ok: false, error: readErr.message };
    if (!cur) return { ok: false, error: "media row not found for this profile" };
    const meta: Record<string, unknown> = { ...((cur as { metadata: Record<string, unknown> | null }).metadata ?? {}) };
    if (value === null || value === undefined) delete meta.caption_i18n;
    else meta.caption_i18n = value;
    const { data, error } = await admin
      .from("media_assets")
      .update({ metadata: meta })
      .eq("id", id)
      .eq("owner_talent_profile_id", profileId)
      .is("deleted_at", null)
      .select("id");
    if (error) return { ok: false, error: error.message };
    if (!data || data.length !== 1) return { ok: false, error: "row not updated (no match)" };
    return { ok: true };
  },
  writeBackup(label, data) {
    mkdirSync(BACKUP_DIR, { recursive: true });
    const file = join(BACKUP_DIR, `tul-15-en-content-${label}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    writeFileSync(file, JSON.stringify(data, null, 2));
    return file;
  },
  readBackup(path) {
    return JSON.parse(readFileSync(path, "utf8")) as unknown;
  },
};

const result = await run(process.argv.slice(2), io);
process.exit(result.exitCode);
