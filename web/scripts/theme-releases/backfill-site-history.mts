/**
 * THEME RELEASES Phase 2 backfill: seed `talent_site_history` from the existing
 * revision tables (`talent_site_revisions` shell + Maison design versions,
 * `talent_page_revisions` autosaves folded per 60 s).
 *
 * DRY RUN by default (reads only; prints what it would insert per site).
 * `--yes-write` writes ONLY allow-listed profiles: demo accounts
 * (`talent_profiles.is_demo`, or a THEME_DEMOS profile code) plus the explicit
 * `ALLOW_CODES` below. A JSON backup of each site's current history rows AND
 * the entries about to be written is saved before any insert. Idempotent:
 * every entry carries a `source_ref` (unique per site), so a re-run inserts
 * nothing new. Real talents are never written.
 *
 * Run (from web/):
 *   npx tsx --env-file=.env.local scripts/theme-releases/backfill-site-history.mts \
 *     [--only TAL-93901,TAL-93103] [--yes-write] [--backup-dir <dir>] [--limit-per-page 50]
 */
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const { mapPageRevisions, mapSiteRevision } = await import("../../src/lib/talent-site/history/backfill");
const { historyEntryPayload } = await import("../../src/lib/talent-site/history/writer");
const { THEME_DEMOS } = await import("../../src/lib/talent-site/theme-catalog/theme-demos");

/** Non-demo profiles the owner cleared for this backfill. */
const ALLOW_CODES = new Set(["TAL-93901"]);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");

const args = process.argv.slice(2);
const opt = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const write = args.includes("--yes-write");
const only = opt("--only")?.split(",").map((s) => s.trim()).filter(Boolean);
const limitPerPage = Number(opt("--limit-per-page") ?? 50);
const backupDir =
  opt("--backup-dir") ?? path.join(os.homedir(), "Desktop/tulala-exports/theme-releases/history-backups");

const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const DEMO_CODES = new Set(THEME_DEMOS.map((d) => d.profileCode));

const { data: siteRows, error: siteErr } = await admin
  .from("talent_sites")
  .select("id, talent_profile_id");
if (siteErr) throw siteErr;
const sites = (siteRows ?? []) as Array<{ id: string; talent_profile_id: string }>;
const ids = sites.map((s) => s.talent_profile_id);
const { data: profiles, error: pErr } = await admin
  .from("talent_profiles")
  .select("id, profile_code, is_demo")
  .in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
if (pErr) throw pErr;
const profileById = new Map(
  ((profiles ?? []) as Array<{ id: string; profile_code: string; is_demo: boolean | null }>).map((p) => [p.id, p]),
);

const allowed = (code: string, isDemo: boolean) => isDemo || DEMO_CODES.has(code) || ALLOW_CODES.has(code);
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const totals = { sites: 0, entries: 0, written: 0, alreadyPresent: 0, skippedNotAllowed: 0 };

console.log(`backfill-site-history: ${write ? "WRITE (allow-listed only)" : "DRY RUN"}`);
for (const site of sites) {
  const profile = profileById.get(site.talent_profile_id);
  if (!profile) continue;
  if (only && !only.includes(profile.profile_code)) continue;
  const isAllowed = allowed(profile.profile_code, Boolean(profile.is_demo));
  totals.sites += 1;

  const { data: pages } = await admin
    .from("talent_pages")
    .select("id, title, is_home")
    .eq("talent_profile_id", site.talent_profile_id);
  const pageList = (pages ?? []) as Array<{ id: string; title: string; is_home: boolean }>;
  const home = pageList.find((p) => p.is_home)?.id ?? null;
  const titles = new Map(pageList.map((p) => [p.id, p.title]));

  const { data: siteRevs } = await admin
    .from("talent_site_revisions")
    .select("id, kind, created_at, created_by, snapshot")
    .eq("talent_site_id", site.id)
    .order("created_at", { ascending: true });
  const { data: pageRevs } = pageList.length
    ? await admin
        .from("talent_page_revisions")
        .select("id, page_id, created_at, created_by, blocks")
        .in("page_id", pageList.map((p) => p.id))
        .order("created_at", { ascending: true })
    : { data: [] };

  const entries = [
    ...((siteRevs ?? []) as Parameters<typeof mapSiteRevision>[0][])
      .map((r) => mapSiteRevision(r, home))
      .filter((e): e is NonNullable<typeof e> => e !== null),
    ...mapPageRevisions((pageRevs ?? []) as Parameters<typeof mapPageRevisions>[0], titles, { limitPerPage }),
  ].sort((a, b) => (a.at ?? "").localeCompare(b.at ?? ""));
  totals.entries += entries.length;

  const tag = `${isAllowed ? "[allowed]" : "[skip]   "} ${profile.profile_code}`;
  const kinds = entries.reduce<Record<string, number>>((acc, e) => ({ ...acc, [e.kind]: (acc[e.kind] ?? 0) + 1 }), {});
  console.log(`${tag} site=${site.id} entries=${entries.length} ${JSON.stringify(kinds)}`);

  if (!write || entries.length === 0) continue;
  if (!isAllowed) {
    totals.skippedNotAllowed += 1;
    continue;
  }

  const { data: existing } = await admin
    .from("talent_site_history")
    .select("id, at, kind, source_ref")
    .eq("site_id", site.id);
  fs.mkdirSync(backupDir, { recursive: true });
  const backupFile = path.join(backupDir, `${stamp}-${profile.profile_code}.json`);
  fs.writeFileSync(
    backupFile,
    JSON.stringify({ site: site.id, profile: profile.profile_code, existing, planned: entries }, null, 2),
  );
  console.log(`  backup → ${backupFile}`);

  for (const entry of entries) {
    const { data: id, error } = await admin.rpc("talent_site_history_append", {
      p_site_id: site.id,
      p_entry: historyEntryPayload(entry),
    });
    if (error) {
      console.error(`  ! ${entry.sourceRef}: ${error.message}`);
      continue;
    }
    if (id) totals.written += 1;
    else totals.alreadyPresent += 1;
  }
}

console.log(JSON.stringify(totals));
