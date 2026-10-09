/**
 * TUL-457 · guarded backfill for existing studio workspaces missing
 * `agencies.settings.appointments` (timezone). NOT a migration — PM runs it.
 *
 * Targets only rows where:
 *   - settings.opening_hours is present (onboarding wrote hours), AND
 *   - settings.appointments is null / missing / has no valid IANA timezone
 *
 * Never overwrites a valid appointments.timezone. Timezone source order:
 *   1. agencies.timezone (column) when valid IANA
 *   2. any active roster member's talent_booking_hours.timezone
 *   3. else skip with reason (no invented default)
 *
 * Dry-run by default. Writing needs `--apply --yes`.
 *
 * From web/:
 *   npx tsx --env-file=.env.local scripts/backfill-studio-appointments-timezone.ts
 *   npx tsx --env-file=.env.local scripts/backfill-studio-appointments-timezone.ts --apply --yes
 *   npx tsx --env-file=.env.local scripts/backfill-studio-appointments-timezone.ts --only=slug-a,slug-b
 *   npx tsx --env-file=.env.local scripts/backfill-studio-appointments-timezone.ts --restore=path/to/backup.json
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

import { normalizeTenantAppointmentsSettings } from "../src/lib/scheduling/appointments-settings-types";
import { isValidIanaTimeZone } from "../src/lib/scheduling/tz";

// ── pure plan ──────────────────────────────────────────────────────────────

export type AgencyCandidate = {
  id: string;
  slug: string;
  timezone: string | null;
  settings: Record<string, unknown> | null;
};

export type PlanRow =
  | {
      status: "apply";
      id: string;
      slug: string;
      timezone: string;
      timezoneSource: "agency_column" | "roster_hours";
      beforeAppointments: unknown;
      nextSettings: Record<string, unknown>;
    }
  | {
      status: "skipped";
      id: string;
      slug: string;
      reason: string;
    };

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function appointmentsTimezoneMissing(settings: Record<string, unknown> | null): boolean {
  if (!settings) return true;
  const appt = settings.appointments;
  if (appt == null) return true;
  if (!isPlainObject(appt)) return true;
  const tz = appt.timezone;
  return typeof tz !== "string" || !isValidIanaTimeZone(tz);
}

export function hasOpeningHours(settings: Record<string, unknown> | null): boolean {
  if (!settings) return false;
  return settings.opening_hours != null && typeof settings.opening_hours === "object";
}

export function pickTimezone(args: {
  agencyTimezone: string | null;
  rosterTimezones: readonly (string | null | undefined)[];
}): { timezone: string; source: "agency_column" | "roster_hours" } | null {
  if (args.agencyTimezone && isValidIanaTimeZone(args.agencyTimezone)) {
    return { timezone: args.agencyTimezone, source: "agency_column" };
  }
  for (const tz of args.rosterTimezones) {
    if (tz && isValidIanaTimeZone(tz)) return { timezone: tz, source: "roster_hours" };
  }
  return null;
}

export function planStudioAppointmentsBackfill(
  agency: AgencyCandidate,
  rosterTimezones: readonly (string | null | undefined)[],
): PlanRow {
  const base = { id: agency.id, slug: agency.slug };
  if (!hasOpeningHours(agency.settings)) {
    return { ...base, status: "skipped", reason: "no opening_hours (not an onboarding hours write)" };
  }
  if (!appointmentsTimezoneMissing(agency.settings)) {
    return { ...base, status: "skipped", reason: "appointments.timezone already valid" };
  }
  const picked = pickTimezone({ agencyTimezone: agency.timezone, rosterTimezones });
  if (!picked) {
    return { ...base, status: "skipped", reason: "no_timezone_source" };
  }
  const settings = agency.settings && isPlainObject(agency.settings) ? { ...agency.settings } : {};
  const cur = normalizeTenantAppointmentsSettings(settings.appointments);
  const nextAppointments = {
    ...cur,
    enabled: true,
    terminology: cur.enabled ? cur.terminology : ("appointments" as const),
    timezone: picked.timezone,
    presetId: cur.presetId ?? ("salon" as const),
  };
  return {
    ...base,
    status: "apply",
    timezone: picked.timezone,
    timezoneSource: picked.source,
    beforeAppointments: settings.appointments ?? null,
    nextSettings: { ...settings, appointments: nextAppointments },
  };
}

// ── io ─────────────────────────────────────────────────────────────────────

export type BackfillIo = {
  listCandidates(onlySlugs: readonly string[] | null): Promise<AgencyCandidate[]>;
  rosterTimezones(tenantId: string): Promise<Array<string | null>>;
  writeSettings(id: string, settings: Record<string, unknown>): Promise<void>;
  writeBackup(label: string, data: unknown): string;
  readBackup(path: string): unknown;
};

export type RunOptions = {
  apply: boolean;
  yes: boolean;
  only: readonly string[] | null;
  restore: string | null;
};

export function parseArgs(argv: readonly string[]): RunOptions {
  const onlyArg = argv.find((a) => a.startsWith("--only="));
  const restoreArg = argv.find((a) => a.startsWith("--restore="));
  return {
    apply: argv.includes("--apply"),
    yes: argv.includes("--yes"),
    only: onlyArg
      ? onlyArg
          .slice("--only=".length)
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : null,
    restore: restoreArg ? restoreArg.slice("--restore=".length) : null,
  };
}

export async function runBackfill(io: BackfillIo, opts: RunOptions): Promise<{ apply: number; skipped: number; wrote: number }> {
  if (opts.restore) {
    const raw = io.readBackup(opts.restore);
    if (!Array.isArray(raw)) throw new Error("backup must be a JSON array of { id, settings }");
    if (!opts.apply || !opts.yes) {
      console.log(`[dry-run] would restore ${raw.length} row(s) from ${opts.restore}`);
      return { apply: raw.length, skipped: 0, wrote: 0 };
    }
    let wrote = 0;
    for (const row of raw as Array<{ id?: string; settings?: unknown }>) {
      if (!row.id || !isPlainObject(row.settings)) continue;
      await io.writeSettings(row.id, row.settings);
      wrote += 1;
      console.log(`restored ${row.id}`);
    }
    return { apply: wrote, skipped: 0, wrote };
  }

  const candidates = await io.listCandidates(opts.only);
  const plans: PlanRow[] = [];
  for (const agency of candidates) {
    const rosterTz = await io.rosterTimezones(agency.id);
    plans.push(planStudioAppointmentsBackfill(agency, rosterTz));
  }

  const toApply = plans.filter((p): p is Extract<PlanRow, { status: "apply" }> => p.status === "apply");
  const skipped = plans.filter((p) => p.status === "skipped");
  for (const p of plans) {
    if (p.status === "skipped") console.log(`skip  ${p.slug}  ${p.reason}`);
    else console.log(`apply ${p.slug}  tz=${p.timezone} (${p.timezoneSource})`);
  }
  console.log(`plan: ${toApply.length} apply, ${skipped.length} skipped (of ${plans.length} candidates)`);

  if (!opts.apply) {
    console.log("[dry-run] no writes. Re-run with --apply --yes to write.");
    return { apply: toApply.length, skipped: skipped.length, wrote: 0 };
  }
  if (!opts.yes) {
    console.log("Refusing to write without --yes.");
    return { apply: toApply.length, skipped: skipped.length, wrote: 0 };
  }

  const backup = toApply.map((p) => ({
    id: p.id,
    slug: p.slug,
    settings: { ...(candidates.find((c) => c.id === p.id)?.settings ?? {}), appointments: p.beforeAppointments },
  }));
  const backupPath = io.writeBackup("tul-457-studio-appointments", backup);
  console.log(`backup → ${backupPath}`);

  let wrote = 0;
  for (const p of toApply) {
    await io.writeSettings(p.id, p.nextSettings);
    wrote += 1;
    console.log(`wrote ${p.slug}`);
  }
  return { apply: toApply.length, skipped: skipped.length, wrote };
}

// ── supabase io + CLI ──────────────────────────────────────────────────────

function createSupabaseIo(admin: SupabaseClient): BackfillIo {
  const backupDir = join(process.cwd(), "tmp", "backfill-studio-appointments");
  return {
    async listCandidates(onlySlugs) {
      // Filter opening_hours / missing appointments in JS — PostgREST JSON-path
      // null checks are brittle across client versions for this one-shot.
      let q = admin.from("agencies").select("id, slug, timezone, settings");
      if (onlySlugs?.length) q = q.in("slug", [...onlySlugs]);
      const { data, error } = await q;
      if (error) throw error;
      return ((data ?? []) as Array<{ id: string; slug: string; timezone: string | null; settings: unknown }>)
        .map((r) => ({
          id: r.id,
          slug: r.slug,
          timezone: r.timezone,
          settings: isPlainObject(r.settings) ? r.settings : null,
        }))
        .filter((r) => hasOpeningHours(r.settings) && appointmentsTimezoneMissing(r.settings));
    },
    async rosterTimezones(tenantId) {
      const { data: roster, error: rErr } = await admin
        .from("agency_talent_roster")
        .select("talent_profile_id")
        .eq("tenant_id", tenantId)
        .eq("status", "active");
      if (rErr) throw rErr;
      const ids = ((roster ?? []) as Array<{ talent_profile_id: string }>).map((x) => x.talent_profile_id);
      if (!ids.length) return [];
      const { data: hours, error: hErr } = await admin.from("talent_booking_hours").select("timezone").in("talent_profile_id", ids);
      if (hErr) throw hErr;
      return ((hours ?? []) as Array<{ timezone: string | null }>).map((h) => h.timezone);
    },
    async writeSettings(id, settings) {
      const { error } = await admin.from("agencies").update({ settings }).eq("id", id);
      if (error) throw error;
    },
    writeBackup(label, data) {
      mkdirSync(backupDir, { recursive: true });
      const path = join(backupDir, `${label}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
      writeFileSync(path, JSON.stringify(data, null, 2));
      return path;
    },
    readBackup(path) {
      if (!existsSync(path)) throw new Error(`backup not found: ${path}`);
      return JSON.parse(readFileSync(path, "utf8")) as unknown;
    },
  };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }
  const admin = createClient(url, key, { auth: { persistSession: false } });
  const result = await runBackfill(createSupabaseIo(admin), opts);
  console.log(JSON.stringify(result));
}

// Only the CLI entry (…/backfill-studio-appointments-timezone.ts), never the
// sibling *.test.ts that imports this module (same basename prefix).
const entry = typeof process !== "undefined" ? (process.argv[1] ?? "") : "";
const isDirect = /backfill-studio-appointments-timezone\.(ts|js|mjs|cjs)$/.test(entry);
if (isDirect) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
