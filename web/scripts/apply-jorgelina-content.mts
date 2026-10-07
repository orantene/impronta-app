/**
 * TUL-73: apply Oran's approved handover content to Jorgelina's site DRAFT.
 *
 * DRY RUN by default: loads current values, prints a before/after diff, writes
 * nothing. Writing needs BOTH --apply-draft and --yes, and writes only the home
 * page DRAFT (`talent_pages.blocks`). Rows with no draft concept (offering
 * descriptions, profile social links) are written only with --include-live-fields
 * on top. This script NEVER publishes. Target is hard-locked to TAL-93938 on the
 * site slug book-jorgelina.
 *
 * Run (from web/), by the Release Manager with Oran's OK:
 *   npm run qa:jorgelina-content                          # dry run
 *   npm run qa:jorgelina-content -- --apply-draft --yes   # draft only
 *   npm run qa:jorgelina-content -- --apply-draft --yes --include-live-fields
 *   npm run qa:jorgelina-content -- --apply-draft --yes --include-live-fields --include-english-descriptions
 *     (adds ONLY description_i18n.en for the approved services; es and other locales preserved)
 */
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { run, type Io } from "./jorgelina-content/plan";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
if (!url || !key) {
  console.error("REFUSED: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required (run with --env-file=.env.local).");
  process.exit(2);
}
const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

function backup(name: string, data: unknown): void {
  const file = join(tmpdir(), `tul-73-${name}-${Date.now()}.json`);
  writeFileSync(file, JSON.stringify(data, null, 2));
  console.log(`Backup of previous value: ${file}`);
}

const io: Io = {
  async findProfile(profileCode) {
    const { data, error } = await admin.from("talent_profiles").select("id, profile_code").eq("profile_code", profileCode).maybeSingle();
    if (error) throw new Error(`profile read failed: ${error.message}`);
    return (data as { id: string; profile_code: string } | null) ?? null;
  },
  async findSite(profileId) {
    const { data, error } = await admin.from("talent_sites").select("id, site_slug").eq("talent_profile_id", profileId).maybeSingle();
    if (error) throw new Error(`site read failed: ${error.message}`);
    return (data as { id: string; site_slug: string | null } | null) ?? null;
  },
  async findHomePage(profileId) {
    const { data, error } = await admin.from("talent_pages").select("id, blocks, updated_at").eq("talent_profile_id", profileId).eq("is_home", true).maybeSingle();
    if (error) throw new Error(`home page read failed: ${error.message}`);
    return (data as { id: string; blocks: unknown; updated_at: string } | null) ?? null;
  },
  async listOfferings(profileId) {
    const { data, error } = await admin
      .from("talent_offerings")
      .select("id, title, description, title_i18n, description_i18n, status")
      .eq("talent_profile_id", profileId);
    if (error) throw new Error(`offerings read failed: ${error.message}`);
    return (data ?? []) as Awaited<ReturnType<Io["listOfferings"]>>;
  },
  async readSocialLinks(profileId) {
    const { data, error } = await admin.from("talent_profiles").select("social_links").eq("id", profileId).maybeSingle();
    if (error) throw new Error(`social links read failed: ${error.message}`);
    return (data as { social_links: unknown } | null)?.social_links ?? [];
  },
  async writeDraftHome({ pageId, expectedUpdatedAt, before, after }) {
    backup("home-draft-blocks", before);
    // Only `blocks` (the DRAFT body). blocks_published, status and published_at are never touched.
    const { data, error } = await admin
      .from("talent_pages")
      .update({ blocks: after })
      .eq("id", pageId)
      .eq("updated_at", expectedUpdatedAt)
      .select("id");
    if (error) return { ok: false, error: error.message };
    if (!data || data.length !== 1) return { ok: false };
    return { ok: true };
  },
  async updateOffering({ id, patch }) {
    const { error } = await admin.from("talent_offerings").update(patch).eq("id", id);
    return error ? { ok: false, error: error.message } : { ok: true };
  },
  async writeSocialLinks({ profileId, after }) {
    const { error } = await admin.from("talent_profiles").update({ social_links: after }).eq("id", profileId);
    return error ? { ok: false, error: error.message } : { ok: true };
  },
};

const result = await run(process.argv.slice(2), io);
process.exit(result.exitCode);
