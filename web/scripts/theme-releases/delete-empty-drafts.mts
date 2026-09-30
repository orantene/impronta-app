/**
 * THEME RELEASES cleanup: delete EMPTY DRAFT releases (items = [] and channel
 * "draft" and status "draft"). Older syncs created a draft release for every
 * design version bump even when the payload diff had no items; the sync no
 * longer does.
 *
 * READ-ONLY by default (lists what it would delete). `--yes` deletes. Never
 * touches a release that has items, is past the draft channel, or is referenced
 * by any talent_site_theme_updates row. Run the read-only pass first.
 *
 * Run (from web/):
 *   npx tsx --env-file=.env.local scripts/theme-releases/delete-empty-drafts.mts [--yes]
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");

const yes = process.argv.includes("--yes");
const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

type Row = {
  id: string;
  design_slug: string;
  from_version: number;
  to_version: number;
  channel: string;
  status: string;
  items: unknown;
};

const { data, error } = await admin
  .from("talent_theme_releases")
  .select("id, design_slug, from_version, to_version, channel, status, items")
  .eq("channel", "draft")
  .eq("status", "draft");
if (error) throw error;

const empties = ((data ?? []) as Row[]).filter((r) => !Array.isArray(r.items) || r.items.length === 0);
const deletable: Row[] = [];
for (const r of empties) {
  const { count, error: cErr } = await admin
    .from("talent_site_theme_updates")
    .select("id", { count: "exact", head: true })
    .eq("release_id", r.id);
  if (cErr) throw cErr;
  if ((count ?? 0) > 0) {
    console.log(`SKIP (has update rows) ${r.design_slug} v${r.from_version}->v${r.to_version} ${r.id}`);
    continue;
  }
  deletable.push(r);
}

console.log(`${yes ? "DELETING" : "[read-only] would delete"} ${deletable.length} empty draft release(s):`);
for (const r of deletable) console.log(`  ${r.design_slug} v${r.from_version}->v${r.to_version} ${r.id}`);

if (yes && deletable.length > 0) {
  const { error: dErr } = await admin
    .from("talent_theme_releases")
    .delete()
    .in("id", deletable.map((r) => r.id))
    .eq("channel", "draft")
    .eq("status", "draft");
  if (dErr) throw dErr;
  console.log(`Removed ${deletable.length}.`);
} else if (!yes) {
  console.log("Re-run with --yes to delete.");
}
