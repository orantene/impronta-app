/**
 * TUL-207: seed ENGLISH values for the Spanish-primary DEMO talents' data rows
 * (FAQ, service titles and descriptions, service category labels) so their /en
 * pages stop showing Spanish.
 *
 * DRY RUN by default: reads the demo rows, prints what it would add, writes
 * nothing. Writing needs BOTH --apply and --yes. Only the `en` key of five i18n
 * columns is ever written; a non-empty `en` is never overwritten and `es` is
 * never touched. Targets are a hard allow-list of profile codes; each must also
 * be flagged is_demo and have the expected site slug, or the run refuses.
 * Before any write, the old values of every touched row go to a JSON file under
 * scripts/demo-english-data/backups/ (gitignored); after the write the rows are
 * re-read and compared.
 *
 * Run (from web/), by the Project Manager:
 *   npx tsx --env-file=.env.local scripts/demo-english-data/apply-demo-english-data.mts
 *   npx tsx --env-file=.env.local scripts/demo-english-data/apply-demo-english-data.mts --apply --yes
 *   (optional) --only TAL-93020,TAL-93002
 */
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { run, type FaqRow, type Io, type OfferingRow, type ProfileRow } from "./plan";

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
    const { data, error } = await admin.from("talent_profiles").select("id, profile_code, is_demo").eq("profile_code", profileCode).maybeSingle();
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
  async listFaq(profileId) {
    const { data, error } = await admin
      .from("talent_faq_items")
      .select("id, question, answer, question_i18n, answer_i18n")
      .eq("talent_profile_id", profileId)
      .limit(1000);
    if (error) throw new Error(`faq read failed: ${error.message}`);
    return (data ?? []) as FaqRow[];
  },
  async updateRow({ table, profileId, id, patch }) {
    // Only the i18n columns of the plan; scoped to the allow-listed profile.
    const { data, error } = await admin.from(table).update(patch).eq("id", id).eq("talent_profile_id", profileId).select("id");
    if (error) return { ok: false, error: error.message };
    if (!data || data.length !== 1) return { ok: false, error: "row not updated (no match)" };
    return { ok: true };
  },
  writeBackup(data) {
    mkdirSync(BACKUP_DIR, { recursive: true });
    const file = join(BACKUP_DIR, `tul-207-demo-english-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    writeFileSync(file, JSON.stringify(data, null, 2));
    return file;
  },
};

const result = await run(process.argv.slice(2), io);
process.exit(result.exitCode);
