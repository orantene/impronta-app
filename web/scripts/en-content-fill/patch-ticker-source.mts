/**
 * TUL-15 Stage 5b layer B, script 2: make the ticker of the TEST talent
 * TAL-93900 (site jorg-beauty-qa) follow her services. Every `marquee` in the
 * home or shell DRAFT with no `source` (or `source: "custom"`) gets
 * `source: "services"`; its typed words stay as the fallback. Nothing else
 * moves. The decisions live in ./ticker-plan.ts (pure, tested with fakes); this
 * file only wires the database.
 *
 * DRY RUN by default: prints profile code, id and site slug, the marquee nodes
 * it found (by tree path and id) and whether the live site equals the draft.
 * Writing needs `--apply --site TAL-93900`. The write goes through the app's own
 * DRAFT writer (history entry, draft_rev compare-and-swap). It publishes ONLY
 * when the live site already equalled the draft before the patch (so the publish
 * can ship nothing but the ticker); otherwise it reports "needs publish".
 * `--no-publish` never publishes. The old tree(s) go to
 * scripts/en-content-fill/backups/ (gitignored) before the write;
 * `--restore <backup.json>` puts them back (same guards).
 *
 * Run (from web/), by the Project Manager.
 * Dry run (reads only, needs just the service role key):
 *   npx tsx --env-file=.env.local scripts/en-content-fill/patch-ticker-source.mts
 * Apply / restore (loads the app's draft writer and publish path, so it needs the
 * same stubs as scripts/upgrade-site-designs.mjs):
 *   TSX_TSCONFIG_PATH=scripts/demo-talents/tsconfig.json NODE_OPTIONS='--require ./scripts/register-server-only-test.cjs' \
 *     npx tsx --env-file=.env.local scripts/en-content-fill/patch-ticker-source.mts --apply --site TAL-93900
 *   (same prefix) ... --restore <backup.json>                       dry run of the restore
 *   (same prefix) ... --restore <backup.json> --apply --site TAL-93900
 *   (optional) --no-publish, --expect-profile-id <uuid>
 */
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { run, type Io, type PageRow, type SiteRow, type Snapshot } from "./ticker-plan";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
if (!url || !key) {
  console.error("REFUSED: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required (run with --env-file=.env.local).");
  process.exit(2);
}
const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const BACKUP_DIR = join(dirname(fileURLToPath(import.meta.url)), "backups");

const io: Io = {
  async load(profileCode) {
    const { data: prof, error: pe } = await admin.from("talent_profiles").select("id, profile_code, user_id").eq("profile_code", profileCode).maybeSingle();
    if (pe) throw new Error(`profile read failed: ${pe.message}`);
    if (!prof) return null;
    const profile = prof as Snapshot["profile"];
    const { data: site, error: se } = await admin
      .from("talent_sites")
      .select("id, site_slug, shell_tree, shell_published, design_tokens_draft, design_tokens, draft_rev, site_published_at")
      .eq("talent_profile_id", profile.id)
      .maybeSingle();
    if (se) throw new Error(`site read failed: ${se.message}`);
    if (!site) throw new Error("site row not found");
    const { data: pages, error: ge } = await admin
      .from("talent_pages")
      .select("id, is_home, status, blocks, blocks_published, updated_at")
      .eq("talent_profile_id", profile.id);
    if (ge) throw new Error(`pages read failed: ${ge.message}`);
    return { profile, site: site as SiteRow, pages: (pages ?? []) as PageRow[] };
  },
  async writeDraft({ siteId, expectedDraftRev, shell, home, kind, summaryEn, summaryEs }) {
    // The app's own draft writer: one RPC transaction, CAS on draft_rev, history entry. Never touches published state.
    const { writeSiteDraft } = await import("../../src/lib/talent-site/history/writer");
    const res = await writeSiteDraft(admin as unknown as Parameters<typeof writeSiteDraft>[0], {
      siteId,
      expectedDraftRev,
      ...(shell ? { site: { shell_tree: shell } } : {}),
      ...(home ? { pages: [{ id: home.pageId, patch: { blocks: home.blocks } }] } : {}),
      history: { kind, actor: "system", summaryEn, summaryEs, undoable: true, batchSeconds: 0 },
    });
    if (res.ok) return { ok: true, draftRev: res.draftRev };
    return { ok: false, conflict: res.code === "conflict", error: res.error };
  },
  async publish({ siteId, talentProfileId, profileCode, userId }) {
    try {
      const { publishDemoSite } = await import("../../src/lib/talent-site/server/demo-pipeline.server");
      const out = await publishDemoSite(admin, { siteId, talentProfileId, profileCode, userId });
      return out.warning ? { ok: true, warning: out.warning } : { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  },
  backup(label, data) {
    mkdirSync(BACKUP_DIR, { recursive: true });
    const file = join(BACKUP_DIR, `tul-15-ticker-${label}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    writeFileSync(file, JSON.stringify(data, null, 2));
    return file;
  },
  readBackup(path) {
    return JSON.parse(readFileSync(path, "utf8")) as unknown;
  },
  log: (line) => console.log(line),
  now: () => new Date().toISOString(),
};

const result = await run(process.argv.slice(2), io);
process.exit(result.exitCode);
