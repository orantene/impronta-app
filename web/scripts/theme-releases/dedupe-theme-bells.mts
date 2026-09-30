/**
 * THEME RELEASES (F127 backfill): apply the one-bell-per-design rules to the
 * update bells that already exist.
 *   - keep only the newest unread theme-update bell per talent and design
 *   - mark read any bell whose update rows are all closed (applied / dismissed)
 * Idempotent. DRY RUN by default; `--yes` writes `read_at` on the planned
 * bells (nothing else is touched, nothing is deleted).
 *
 * Run (from web/):
 *   npx tsx --env-file=.env.local scripts/theme-releases/dedupe-theme-bells.mts [--yes]
 */
import { createClient } from "@supabase/supabase-js";

import {
  planBellDedupe,
  type BellRecord,
  type BellRowRecord,
} from "../../src/lib/talent-site/theme-releases/theme-bells-plan";

const write = process.argv.includes("--yes");
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: bells, error: bErr } = await admin
  .from("user_notifications")
  .select("id, user_id, origin_event_id, created_at, target_payload")
  .eq("origin_kind", "theme_release")
  .is("read_at", null);
if (bErr) throw bErr;
const unread = (bells ?? []) as BellRecord[];

const releaseIds = [...new Set(unread.map((b) => b.origin_event_id))];
const rows: BellRowRecord[] = [];
if (releaseIds.length > 0) {
  const { data: upd, error: uErr } = await admin
    .from("talent_site_theme_updates")
    .select("release_id, state, talent_profile_id")
    .in("release_id", releaseIds);
  if (uErr) throw uErr;
  const profileIds = [...new Set((upd ?? []).map((r) => r.talent_profile_id as string))];
  const userOf = new Map<string, string>();
  for (let i = 0; i < profileIds.length; i += 100) {
    const { data: profs, error: pErr } = await admin
      .from("talent_profiles")
      .select("id, user_id")
      .in("id", profileIds.slice(i, i + 100));
    if (pErr) throw pErr;
    for (const p of profs ?? []) userOf.set(p.id as string, p.user_id as string);
  }
  for (const r of upd ?? []) {
    const user = userOf.get(r.talent_profile_id as string);
    if (user) rows.push({ release_id: r.release_id as string, state: r.state as string, user_id: user });
  }
}

const plan = planBellDedupe(unread, rows);
const by = (reason: string) => plan.markRead.filter((m) => m.reason === reason).length;
console.log(`${write ? "WRITE" : "DRY RUN"}: ${unread.length} unread theme-update bells`);
console.log(`  keep (newest per talent + design): ${plan.kept.length}`);
console.log(`  mark read, superseded by a newer bell: ${by("superseded")}`);
console.log(`  mark read, every update row closed: ${by("rows_closed")}`);
const perUser = new Map<string, number>();
for (const m of plan.markRead) {
  const u = unread.find((b) => b.id === m.id)!.user_id;
  perUser.set(u, (perUser.get(u) ?? 0) + 1);
}
console.log(`  talents affected: ${perUser.size}`);

if (!write) {
  console.log("Dry run only. Re-run with --yes to write.");
} else if (plan.markRead.length > 0) {
  const ids = plan.markRead.map((m) => m.id);
  for (let i = 0; i < ids.length; i += 100) {
    const { error } = await admin
      .from("user_notifications")
      .update({ read_at: new Date().toISOString() })
      .in("id", ids.slice(i, i + 100))
      .is("read_at", null);
    if (error) throw error;
  }
  console.log(`Marked ${ids.length} bells read.`);
}
