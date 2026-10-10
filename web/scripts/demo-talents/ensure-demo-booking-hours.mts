/**
 * TUL-516 / TUL-489: give allow-listed demos a `talent_booking_hours` row when
 * missing (or too narrow for their longest timed service). Decisions live in
 * ./ensure-demo-booking-hours.ts (pure, tested with fakes); this file only
 * wires the database.
 *
 * DRY RUN by default. Writing needs BOTH --apply and --yes. Backups go to
 * scripts/demo-talents/backups/ (gitignored). `--restore <backup.json>` (plus
 * --apply --yes) puts prior hours back. Allow-list only; TAL-93938 and
 * TAL-93900 are refused by name.
 *
 * Run (from web/), by the Project Manager:
 *   npm run demo:ensure-booking-hours
 *   npm run demo:ensure-booking-hours -- --apply --yes
 *   npm run demo:ensure-booking-hours:diego -- --apply --yes
 *   npx tsx --env-file=.env.local scripts/demo-talents/ensure-demo-booking-hours.mts --restore <backup.json> --apply --yes
 *
 * TUL-538: Diego (TAL-93005) was live without hours after #3089; PM should
 * re-run `demo:ensure-booking-hours:diego -- --apply --yes` whenever a demo
 * seed drifts and the when-step shows "No hay horarios libres".
 */
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  run,
  weeklyFromHours,
  type HoursRow,
  type Io,
  type ProfileRow,
} from "./ensure-demo-booking-hours";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
if (!url || !key) {
  console.error(
    "REFUSED: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required (run with --env-file=.env.local).",
  );
  process.exit(2);
}
const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const BACKUP_DIR = join(dirname(fileURLToPath(import.meta.url)), "backups");

const io: Io = {
  async findProfile(profileCode) {
    const { data, error } = await admin
      .from("talent_profiles")
      .select("id, profile_code, is_demo")
      .eq("profile_code", profileCode)
      .maybeSingle();
    if (error) throw new Error(`profile read failed: ${error.message}`);
    return (data as ProfileRow | null) ?? null;
  },
  async findSiteSlug(profileId) {
    const { data, error } = await admin
      .from("talent_sites")
      .select("site_slug")
      .eq("talent_profile_id", profileId)
      .maybeSingle();
    if (error) throw new Error(`site read failed: ${error.message}`);
    return (data as { site_slug: string | null } | null)?.site_slug ?? null;
  },
  async readHours(profileId) {
    const { data, error } = await admin
      .from("talent_booking_hours")
      .select("timezone, weekly, slot_minutes, horizon_days")
      .eq("talent_profile_id", profileId)
      .maybeSingle();
    if (error) throw new Error(`hours read failed: ${error.message}`);
    return (data as HoursRow) ?? null;
  },
  async hubTenantId() {
    const { data, error } = await admin
      .from("agencies")
      .select("id")
      .eq("kind", "hub")
      .eq("plan_tier", "network")
      .eq("status", "active");
    if (error) throw new Error(`hub read failed: ${error.message}`);
    if (data?.length !== 1) throw new Error(`expected exactly one active hub, found ${data?.length ?? 0}`);
    return (data[0] as { id: string }).id;
  },
  async upsertHours(profileId, tenantId, hours) {
    // Re-check is_demo immediately before write.
    const { data: row, error: readErr } = await admin
      .from("talent_profiles")
      .select("id, is_demo")
      .eq("id", profileId)
      .maybeSingle();
    if (readErr) return { ok: false, error: readErr.message };
    if (!row || row.is_demo !== true) {
      return { ok: false, error: "REFUSE: profile is not is_demo=true at write time" };
    }

    const weekly = weeklyFromHours(hours);
    const { error } = await admin.from("talent_booking_hours").upsert(
      {
        talent_profile_id: profileId,
        tenant_id: tenantId,
        timezone: hours.timezone,
        weekly,
        exceptions: [],
        slot_minutes: hours.slotMinutes,
        buffer_before_min: 0,
        buffer_after_min: 15,
        min_notice_min: 120,
        horizon_days: 60,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "talent_profile_id" },
    );
    return error ? { ok: false, error: error.message } : { ok: true };
  },
  writeBackup(data) {
    mkdirSync(BACKUP_DIR, { recursive: true });
    const file = join(
      BACKUP_DIR,
      `tul-516-demo-booking-hours-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
    );
    writeFileSync(file, JSON.stringify(data, null, 2));
    return file;
  },
  readBackup(path) {
    return JSON.parse(readFileSync(path, "utf8")) as unknown;
  },
};

const result = await run(process.argv.slice(2), io);
for (const line of result.lines) console.log(line);
process.exit(result.exitCode);
