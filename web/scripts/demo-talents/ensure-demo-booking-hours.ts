/**
 * TUL-516 / TUL-489: pure planner that gives allow-listed demos a
 * `talent_booking_hours` row when missing (or too narrow for their longest
 * timed service). No database client — every read/write goes through `Io`.
 *
 * Never: touch a non-demo profile, touch a code off the allow-list, write
 * without `--apply --yes`, or invent hours for quote-only catalogs.
 */

import { DEMOS } from "./demos";
import {
  hoursFitDuration,
  maxTimedServiceMinutes,
  resolvedDemoBookingHours,
  type DemoHoursSpec,
} from "../../src/lib/talent-site/demos/demo-booking-hours";

export class RefusedError extends Error {}

export const FORBIDDEN_PROFILE_CODES: readonly string[] = ["TAL-93938", "TAL-93900"];

/** Demos with timed bookable services (from the roster). */
export const TARGETS: readonly { profileCode: string; siteSlug: string }[] = DEMOS.filter(
  (d) => maxTimedServiceMinutes(d.services) > 0,
).map((d) => ({ profileCode: d.profileCode, siteSlug: d.siteSlug }));

export type ProfileRow = {
  id: string;
  profile_code: string;
  is_demo: boolean | null;
};

export type HoursRow = {
  timezone: string;
  weekly: Record<string, { startMin: number; endMin: number }[] | null> | null;
  slot_minutes: number | null;
  horizon_days: number | null;
} | null;

export type Io = {
  findProfile(profileCode: string): Promise<ProfileRow | null>;
  findSiteSlug(profileId: string): Promise<string | null>;
  readHours(profileId: string): Promise<HoursRow>;
  hubTenantId(): Promise<string>;
  upsertHours(
    profileId: string,
    tenantId: string,
    hours: DemoHoursSpec,
  ): Promise<{ ok: boolean; error?: string }>;
  writeBackup(data: unknown): string;
  readBackup(path: string): unknown;
};

export type Options = { apply: boolean; yes: boolean; only: string[]; restore: string | null };

export function parseArgs(argv: readonly string[]): Options {
  const o: Options = { apply: false, yes: false, only: [], restore: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--apply") o.apply = true;
    else if (a === "--yes") o.yes = true;
    else if (a === "--only") o.only = (argv[++i] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    else if (a.startsWith("--only=")) o.only = a.slice(7).split(",").map((s) => s.trim()).filter(Boolean);
    else if (a === "--restore") o.restore = (argv[++i] ?? "").trim();
    else if (a.startsWith("--restore=")) o.restore = a.slice(10).trim();
    else throw new RefusedError(`unknown argument ${a}`);
  }
  if (o.restore !== null && o.restore === "") throw new RefusedError("--restore needs a backup file path");
  return o;
}

export function selectTargets(only: readonly string[]): { profileCode: string; siteSlug: string }[] {
  for (const code of only) {
    if (FORBIDDEN_PROFILE_CODES.includes(code)) throw new RefusedError(`refusing ${code}: a real or test talent is never a target`);
    if (!TARGETS.some((t) => t.profileCode === code)) throw new RefusedError(`refusing ${code}: not on the allow-list`);
  }
  return only.length ? TARGETS.filter((t) => only.includes(t.profileCode)) : [...TARGETS];
}

function weeklyFromHours(hours: DemoHoursSpec): Record<string, { startMin: number; endMin: number }[]> {
  const weekly: Record<string, { startMin: number; endMin: number }[]> = {};
  for (let day = 0; day < 7; day += 1) {
    weekly[String(day)] = hours.days.includes(day) ? [{ startMin: hours.startMin, endMin: hours.endMin }] : [];
  }
  return weekly;
}

/** Infer a DemoHoursSpec from a stored weekly map (or null when empty / unreadable). */
export function hoursFromRow(row: HoursRow): DemoHoursSpec | null {
  if (!row?.weekly || !row.timezone) return null;
  const days: number[] = [];
  let startMin: number | null = null;
  let endMin: number | null = null;
  for (let d = 0; d < 7; d += 1) {
    const windows = row.weekly[String(d)];
    if (!windows?.length) continue;
    const w = windows[0]!;
    if (typeof w.startMin !== "number" || typeof w.endMin !== "number") continue;
    days.push(d);
    startMin = startMin === null ? w.startMin : Math.min(startMin, w.startMin);
    endMin = endMin === null ? w.endMin : Math.max(endMin, w.endMin);
  }
  if (!days.length || startMin === null || endMin === null) return null;
  return {
    timezone: row.timezone,
    days,
    startMin,
    endMin,
    slotMinutes: typeof row.slot_minutes === "number" && row.slot_minutes > 0 ? row.slot_minutes : 60,
  };
}

export type TargetPlan = {
  profileCode: string;
  profileId: string;
  siteSlug: string;
  before: DemoHoursSpec | null;
  after: DemoHoursSpec;
  change: boolean;
};

export async function planTarget(io: Io, t: { profileCode: string; siteSlug: string }): Promise<TargetPlan | null> {
  if (FORBIDDEN_PROFILE_CODES.includes(t.profileCode)) throw new RefusedError(`refusing ${t.profileCode}`);
  const profile = await io.findProfile(t.profileCode);
  if (!profile) return null;
  if (profile.profile_code !== t.profileCode) throw new RefusedError(`refusing: asked for ${t.profileCode}, got ${profile.profile_code}`);
  if (profile.is_demo !== true) throw new RefusedError(`refusing ${t.profileCode}: not flagged is_demo`);
  const slug = await io.findSiteSlug(profile.id);
  if (slug !== t.siteSlug) throw new RefusedError(`refusing ${t.profileCode}: site slug is ${JSON.stringify(slug)}, expected ${t.siteSlug}`);

  const demo = DEMOS.find((d) => d.profileCode === t.profileCode);
  if (!demo) throw new RefusedError(`refusing ${t.profileCode}: not in DEMOS roster`);

  const desired = resolvedDemoBookingHours({
    city: demo.city,
    services: demo.services,
    hours: demo.hours ?? null,
  });
  if (!desired) return null;

  const before = hoursFromRow(await io.readHours(profile.id));
  const change = !before || !hoursFitDuration(before, maxTimedServiceMinutes(demo.services));
  return {
    profileCode: t.profileCode,
    profileId: profile.id,
    siteSlug: t.siteSlug,
    before,
    after: desired,
    change,
  };
}

export type RunResult = { exitCode: number; lines: string[] };

export async function run(argv: readonly string[], io: Io, log: (s: string) => void = console.log): Promise<RunResult> {
  const opts = parseArgs(argv);
  const lines: string[] = [];
  const say = (s: string) => {
    lines.push(s);
    log(s);
  };

  if (opts.restore) {
    if (!opts.apply || !opts.yes) {
      say("REFUSED: --restore needs --apply --yes");
      return { exitCode: 2, lines };
    }
    const raw = io.readBackup(opts.restore) as {
      kind?: string;
      entries?: Array<{ profileId: string; profileCode: string; before: DemoHoursSpec | null }>;
    };
    if (raw?.kind !== "tul-516-demo-booking-hours" || !Array.isArray(raw.entries)) {
      say("REFUSED: not a TUL-516 booking-hours backup");
      return { exitCode: 2, lines };
    }
    const tenantId = await io.hubTenantId();
    let failed = 0;
    for (const e of raw.entries) {
      if (!e.before) {
        say(`${e.profileCode}: restore skipped (no prior hours to put back; delete is manual)`);
        continue;
      }
      const r = await io.upsertHours(e.profileId, tenantId, e.before);
      if (!r.ok) {
        failed++;
        say(`FAILED ${e.profileCode}: ${r.error ?? "unknown"}`);
      } else say(`${e.profileCode}: restored hours`);
    }
    return { exitCode: failed ? 1 : 0, lines };
  }

  let targets: { profileCode: string; siteSlug: string }[];
  try {
    targets = selectTargets(opts.only);
  } catch (e) {
    say(e instanceof Error ? e.message : String(e));
    return { exitCode: 2, lines };
  }

  const plans: TargetPlan[] = [];
  for (const t of targets) {
    try {
      const p = await planTarget(io, t);
      if (p) plans.push(p);
      else say(`${t.profileCode}: skipped (no timed bookable services or missing profile)`);
    } catch (e) {
      say(e instanceof Error ? e.message : String(e));
      return { exitCode: 2, lines };
    }
  }

  const changing = plans.filter((p) => p.change);
  for (const p of plans) {
    say(`${p.profileCode} id=${p.profileId} site=${p.siteSlug}`);
    if (!p.change) say(`  hours already fit (tz=${p.before!.timezone})`);
    else {
      say(`  hours: ${p.before ? "widen/replace" : "create"} → tz=${p.after.timezone} days=[${p.after.days}] ${p.after.startMin}-${p.after.endMin}`);
    }
  }
  say(`Would change ${changing.length} of ${plans.length} demos.`);

  if (!opts.apply) {
    say("Dry run. Pass --apply --yes to write.");
    return { exitCode: 0, lines };
  }
  if (!opts.yes) {
    say("REFUSED: --apply needs --yes");
    return { exitCode: 2, lines };
  }

  const backupPath = io.writeBackup({
    kind: "tul-516-demo-booking-hours",
    createdAt: new Date().toISOString(),
    entries: changing.map((p) => ({
      profileCode: p.profileCode,
      profileId: p.profileId,
      before: p.before,
      after: p.after,
    })),
  });
  say(`Backup: ${backupPath}`);

  const tenantId = await io.hubTenantId();
  let failed = 0;
  for (const p of changing) {
    const r = await io.upsertHours(p.profileId, tenantId, p.after);
    if (!r.ok) {
      failed++;
      say(`FAILED ${p.profileCode}: ${r.error ?? "unknown"}`);
    } else say(`OK ${p.profileCode}`);
  }
  return { exitCode: failed ? 1 : 0, lines };
}

export { weeklyFromHours };
