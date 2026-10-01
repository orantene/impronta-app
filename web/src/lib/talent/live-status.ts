/**
 * G3a: talent live status ("Atiendo emergencias hoy"). Pure helpers plus a
 * DI loader/writer (takes the client it is handed, so it runs under node:test).
 *
 * The flag is stored as `emergencies_until`, the instant it stops being true.
 * Null or a past instant is off. Turning it on sets the instant to the end of
 * the talent's local day, so no cron is needed and a forgotten toggle can
 * never promise an emergency visit tomorrow.
 */
import { logServerError } from "@/lib/server/safe-error";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = { from: (table: string) => any };

export type TalentLiveStatus = {
  /** ISO instant the emergencies flag expires; null when never set / cleared. */
  emergenciesUntil: string | null;
};

export const DEFAULT_TALENT_LIVE_STATUS: TalentLiveStatus = { emergenciesUntil: null };

/** True when `tz` is an IANA zone this runtime understands. */
export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || !tz.trim()) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function zonedParts(date: Date, tz: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { y: get("year"), mo: get("month"), d: get("day"), h: get("hour"), mi: get("minute"), s: get("second") };
}

/** Offset (ms) of `tz` from UTC at the given instant. */
function offsetMs(date: Date, tz: string): number {
  const p = zonedParts(date, tz);
  const asUtc = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/**
 * The instant of the NEXT local midnight in `tz` (the end of the local day
 * that `now` falls in). An unknown zone falls back to UTC, which only ever
 * ends the day earlier for the Americas, never later.
 */
export function endOfLocalDay(now: Date, tz: string | null | undefined): Date {
  const zone = isValidTimeZone(tz) ? tz : "UTC";
  const p = zonedParts(now, zone);
  const guessUtc = Date.UTC(p.y, p.mo - 1, p.d + 1, 0, 0, 0);
  // Two passes settle the offset across a DST change.
  let result = guessUtc - offsetMs(new Date(guessUtc), zone);
  result = guessUtc - offsetMs(new Date(result), zone);
  return new Date(result);
}

export function parseTalentLiveStatus(
  row: { emergencies_until?: unknown } | null | undefined,
): TalentLiveStatus {
  const raw = row?.emergencies_until;
  if (typeof raw !== "string") return { ...DEFAULT_TALENT_LIVE_STATUS };
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? { emergenciesUntil: new Date(ms).toISOString() } : { ...DEFAULT_TALENT_LIVE_STATUS };
}

/** Is "Atiendo emergencias hoy" on at `now`? Expiry is checked here, on read. */
export function emergenciesOn(status: TalentLiveStatus | null | undefined, now: Date = new Date()): boolean {
  if (!status?.emergenciesUntil) return false;
  return Date.parse(status.emergenciesUntil) > now.getTime();
}

/** The `emergencies_until` value to store for an on/off toggle. */
export function emergenciesUntilForToggle(
  on: boolean,
  now: Date,
  tz: string | null | undefined,
): string | null {
  return on ? endOfLocalDay(now, tz).toISOString() : null;
}

/** Read one talent's live status. A read error reads as off (never promises). */
export async function loadTalentLiveStatus(admin: Client, talentProfileId: string): Promise<TalentLiveStatus> {
  try {
    const { data, error } = await admin
      .from("talent_live_status")
      .select("emergencies_until")
      .eq("talent_profile_id", talentProfileId)
      .maybeSingle();
    if (error) {
      logServerError("talent.liveStatus.load", error);
      return { ...DEFAULT_TALENT_LIVE_STATUS };
    }
    return parseTalentLiveStatus(data as { emergencies_until?: unknown } | null);
  } catch (err) {
    logServerError("talent.liveStatus.load", err);
    return { ...DEFAULT_TALENT_LIVE_STATUS };
  }
}

/** Idempotent upsert: the same toggle twice stores the same row. */
export async function saveTalentEmergencies(
  admin: Client,
  input: { talentProfileId: string; userId: string | null; on: boolean; now: Date; timeZone: string | null | undefined },
): Promise<{ ok: true; status: TalentLiveStatus } | { ok: false; error: string }> {
  const until = emergenciesUntilForToggle(input.on, input.now, input.timeZone);
  const { error } = await admin.from("talent_live_status").upsert(
    { talent_profile_id: input.talentProfileId, emergencies_until: until, updated_by: input.userId },
    { onConflict: "talent_profile_id" },
  );
  if (error) {
    logServerError("talent.liveStatus.write", error);
    return { ok: false, error: "write_failed" };
  }
  return { ok: true, status: { emergenciesUntil: until } };
}

/**
 * G3b: save the toggle, then bust the talent's public site cache so the next
 * request renders the new state. The bust is injected (next/cache cannot run
 * under node:test); a failed write busts nothing.
 */
export async function toggleTalentEmergencies(
  admin: Client,
  input: {
    talentProfileId: string;
    profileCode: string | null;
    userId: string | null;
    on: boolean;
    now: Date;
    timeZone: string | null | undefined;
  },
  bust: (talentProfileId: string, profileCode: string | null) => void,
): Promise<{ ok: true; status: TalentLiveStatus } | { ok: false; error: string }> {
  const res = await saveTalentEmergencies(admin, input);
  if (!res.ok) return res;
  try {
    bust(input.talentProfileId, input.profileCode);
  } catch (err) {
    // The row is saved and public pages read it per request; a failed bust
    // only delays tagged caches, so the toggle still reports success.
    logServerError("talent.liveStatus.bust", err);
  }
  return res;
}
