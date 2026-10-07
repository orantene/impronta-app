/**
 * TUL-73: load Jorgelina's 7 approved booking clauses (custom-clauses.json) as
 * ONE new immutable policy version. DRY RUN by default; writing needs BOTH
 * --apply and --yes. Hard-locked to TAL-93938 / book-jorgelina. Uses the app's
 * own `publishPolicy` (src/lib/talent-policies/store.ts) with the admin client,
 * keeping the current version's answers; it never edits an existing version.
 *
 * Run (from web/), by the Project Manager:
 *   npm run qa:jorgelina-clauses                        # dry run
 *   npm run qa:jorgelina-clauses -- --apply --yes       # write (needs an existing policy version)
 *   npm run qa:jorgelina-clauses -- --apply --yes --create-first-version
 *                                   # she has no version yet: creates version 1 with default answers
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

import { parseCustomClauses } from "../../src/lib/talent-policies/custom-clauses";
import { loadPolicyFacts } from "../../src/lib/talent-policies/facts";
import { loadPublishedPolicy, publishPolicy } from "../../src/lib/talent-policies/store";
import { renderPublicPolicyPreview } from "./load-clauses-preview";
import { run, type Io } from "./load-clauses-plan";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
if (!url || !key) {
  console.error("REFUSED: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required (run with --env-file=.env.local).");
  process.exit(2);
}
const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const rawClauses: unknown = JSON.parse(readFileSync(new URL("./custom-clauses.json", import.meta.url), "utf8"));

const io: Io = {
  async load(profileCode) {
    const { data: prof, error: pe } = await admin.from("talent_profiles").select("id, profile_code").eq("profile_code", profileCode).maybeSingle();
    if (pe) throw new Error(`profile read failed: ${pe.message}`);
    if (!prof) return null;
    const profile = prof as { id: string; profile_code: string };
    const { data: site, error: se } = await admin.from("talent_sites").select("site_slug").eq("talent_profile_id", profile.id).maybeSingle();
    if (se) throw new Error(`site read failed: ${se.message}`);
    const current = await loadPublishedPolicy(admin, profile.id);
    return { profile, siteSlug: (site as { site_slug: string | null } | null)?.site_slug ?? null, current };
  },
  liveFacts: (profileId) => loadPolicyFacts(admin, profileId),
  async readVersion(profileId, version) {
    const { data, error } = await admin
      .from("talent_policy_versions")
      .select("content_hash, custom_clauses")
      .eq("talent_profile_id", profileId)
      .eq("version", version)
      .maybeSingle();
    if (error || !data) return null;
    const r = data as { content_hash: string; custom_clauses: unknown };
    return { contentHash: r.content_hash, customClauses: parseCustomClauses(r.custom_clauses) };
  },
  publish: ({ profileId, answers, customClauses }) =>
    publishPolicy(admin, { talentProfileId: profileId, userId: null, answers, customClauses }).then((r) =>
      r.ok ? r : { ok: false as const, reason: r.reason },
    ),
  render: renderPublicPolicyPreview,
  log: (line) => console.log(line),
};

const result = await run(process.argv.slice(2), rawClauses, io);
process.exit(result.exitCode);
