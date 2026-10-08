/**
 * TUL-73b: publish Jorgelina's approved DRAFT home page (after
 * `qa:jorgelina-content` wrote it). DRY RUN by default: prints the
 * draft-vs-published diff and writes nothing. Publishing needs BOTH --publish
 * and --yes, refuses if ANY difference falls outside the approved allow-list,
 * backs up the published trees first and verifies afterwards. Target is
 * hard-locked to TAL-93938 on the site slug book-jorgelina.
 *
 * It writes ONLY the home page row (blocks_published, status, published_at,
 * updated_at), compare-and-swap on updated_at, then clears the cache. It does
 * NOT call publishDemoSite (which would also publish all pages, the shell, the
 * site status and theme tokens). See publish-plan.ts.
 *
 * Run (from web/), by the Project Manager with the owner's go:
 *   npm run qa:jorgelina-publish                        # dry run
 *   npm run qa:jorgelina-publish -- --publish --yes     # publish
 */
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { requestTalentSiteRevalidate } from "../../src/lib/talent-site/server/revalidate-request.server";
import { run, type Io, type PageRow, type Snapshot } from "./publish-plan";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
if (!url || !key) {
  console.error("REFUSED: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required (run with --env-file=.env.local).");
  process.exit(2);
}
const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const io: Io = {
  async load(profileCode) {
    const { data: prof, error: pe } = await admin.from("talent_profiles").select("id, profile_code").eq("profile_code", profileCode).maybeSingle();
    if (pe) throw new Error(`profile read failed: ${pe.message}`);
    if (!prof) return null;
    const profile = prof as { id: string; profile_code: string };
    const { data: site, error: se } = await admin
      .from("talent_sites")
      .select("id, site_slug, shell_tree, shell_published, design_tokens_draft, design_tokens")
      .eq("talent_profile_id", profile.id)
      .maybeSingle();
    if (se) throw new Error(`site read failed: ${se.message}`);
    if (!site) throw new Error("site row not found");
    const { data: pages, error: ge } = await admin
      .from("talent_pages")
      .select("id, is_home, status, blocks, blocks_published, updated_at")
      .eq("talent_profile_id", profile.id);
    if (ge) throw new Error(`pages read failed: ${ge.message}`);
    return { profile, site, pages: (pages ?? []) as PageRow[] } as Snapshot;
  },
  async publishHome({ pageId, expectedUpdatedAt, blocks, now }) {
    // Same columns the builder's publish path writes (publishTalentPageBodies), for ONE row.
    const { data, error } = await admin
      .from("talent_pages")
      .update({ blocks_published: blocks, status: "published", published_at: now, updated_at: now })
      .eq("id", pageId)
      .eq("updated_at", expectedUpdatedAt)
      .select("id");
    if (error) return { ok: false, error: error.message };
    return { ok: true, matched: !!data && data.length === 1 };
  },
  bust: (input) => requestTalentSiteRevalidate(input),
  backup(name, data) {
    const file = join(tmpdir(), `tul-73b-${name}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    writeFileSync(file, JSON.stringify(data, null, 2));
    return file;
  },
  log: (line) => console.log(line),
  now: () => new Date().toISOString(),
};

const result = await run(process.argv.slice(2), io);
process.exit(result.exitCode);
