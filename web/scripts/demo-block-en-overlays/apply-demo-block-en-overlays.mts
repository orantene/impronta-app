/**
 * TUL-209 (b): add the ENGLISH node overlay to the comp_card, visit, reviews,
 * spec_table and stats blocks of the allow-listed Spanish-primary DEMO talents
 * (draft page trees). Everything is decided in ./plan.ts (pure, tested with
 * fakes); this file only wires the database and the app's own draft writer.
 *
 * DRY RUN by default: prints each profile code, id and site slug, then every
 * planned `props.i18n.en` addition and every Spanish text that has NO English
 * source ("NEEDS ENGLISH", never translated here). Writing needs BOTH --apply
 * and --yes. Only `en` keys are added; a non-empty `en` is never overwritten;
 * `es` and every base prop stay. TAL-93938 and TAL-93900 are refused by name;
 * a profile not flagged is_demo or with another site slug is refused.
 * The old trees go to scripts/demo-block-en-overlays/backups/ (gitignored)
 * BEFORE the first write; `--restore <backup.json>` (plus --apply --yes) puts
 * them back. A demo is published only when its live site equalled the draft.
 *
 * Run (from web/), by the Project Manager. Dry run (reads only):
 *   npx tsx --env-file=.env.local scripts/demo-block-en-overlays/apply-demo-block-en-overlays.mts
 * Apply / restore (loads the app's draft writer and publish path):
 *   TSX_TSCONFIG_PATH=scripts/demo-talents/tsconfig.json NODE_OPTIONS='--require ./scripts/register-server-only-test.cjs' \
 *     npx tsx --env-file=.env.local scripts/demo-block-en-overlays/apply-demo-block-en-overlays.mts --apply --yes
 *   (same prefix) ... --restore <backup.json> [--apply --yes]
 *   (optional) --only TAL-93212,TAL-93208   --no-publish
 */
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { run, type DemoSnapshot, type Io } from "./plan";
import type { PageRow, SiteRow } from "../en-content-fill/ticker-plan";

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
    const { data: prof, error: pe } = await admin.from("talent_profiles").select("id, profile_code, user_id, is_demo").eq("profile_code", profileCode).maybeSingle();
    if (pe) throw new Error(`profile read failed: ${pe.message}`);
    if (!prof) return null;
    const profile = prof as DemoSnapshot["profile"];
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
    const file = join(BACKUP_DIR, `tul-209-block-en-${label}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
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
