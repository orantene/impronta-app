/**
 * TUL-453 · myself → both: copy the owner's catalog + hours onto the new
 * workspace so the public site is not inquiry-only.
 *
 * Pure planning. The front-door "both" path writes offerings with the
 * workspace tenant_id and `settings.opening_hours`; open_studio used to leave
 * both on the hub, so live services / Agendar found nothing.
 */

import { weeklyHasOpenDay } from "./owner-hours";

export const EMPTY_HOURS_MESSAGES = [
  "El horario aún no está publicado.",
  "Hours are not published yet.",
] as const;

export type OfferingRehomeRow = {
  id: string;
  tenant_id: string | null;
  owner_kind: string | null;
};

export type MyselfBothCopyPlan = {
  offeringIds: string[];
  sourceTenantIds: string[];
  writeOpeningHours: boolean;
  enableAppointments: boolean;
  rehomeHoursTenant: boolean;
};

/** Talent-owned rows whose tenant is not already the new workspace. */
export function planOfferingRehome(
  rows: readonly OfferingRehomeRow[],
  workspaceTenantId: string,
): { offeringIds: string[]; sourceTenantIds: string[] } {
  const offeringIds: string[] = [];
  const sources = new Set<string>();
  for (const row of rows) {
    if (row.owner_kind != null && row.owner_kind !== "talent") continue;
    if (!row.tenant_id || row.tenant_id === workspaceTenantId) continue;
    offeringIds.push(row.id);
    sources.add(row.tenant_id);
  }
  return { offeringIds, sourceTenantIds: [...sources] };
}

export function planMyselfBothCopy(input: {
  workspaceTenantId: string;
  offerings: readonly OfferingRehomeRow[];
  hoursWeekly: unknown;
  hoursTenantId: string | null;
  workspaceOpeningHours: unknown;
  appointmentsEnabled: boolean;
}): MyselfBothCopyPlan {
  const { offeringIds, sourceTenantIds } = planOfferingRehome(
    input.offerings,
    input.workspaceTenantId,
  );
  const hasHours = weeklyHasOpenDay(input.hoursWeekly);
  const openingMissing =
    input.workspaceOpeningHours == null ||
    (typeof input.workspaceOpeningHours === "object" &&
      !Array.isArray(input.workspaceOpeningHours) &&
      Object.keys(input.workspaceOpeningHours as object).length === 0);
  return {
    offeringIds,
    sourceTenantIds,
    writeOpeningHours: hasHours && openingMissing,
    enableAppointments: !input.appointmentsEnabled,
    rehomeHoursTenant:
      hasHours &&
      !!input.hoursTenantId &&
      input.hoursTenantId !== input.workspaceTenantId,
  };
}

const DAY_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const DAY_ES = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"] as const;

function fmtMin(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** One line per open day from a `talent_booking_hours.weekly` value. */
export function formatWeeklyHoursLines(
  weekly: unknown,
  locale: "en" | "es",
): string[] {
  if (!weekly || typeof weekly !== "object" || Array.isArray(weekly)) return [];
  const days = locale === "es" ? DAY_ES : DAY_EN;
  const out: string[] = [];
  for (let d = 0; d <= 6; d++) {
    const key = String(d);
    const raw =
      (weekly as Record<string, unknown>)[key] ??
      (weekly as Record<number, unknown>)[d];
    if (!Array.isArray(raw) || raw.length === 0) continue;
    const windows = raw
      .map((w) => {
        if (!w || typeof w !== "object") return null;
        const start =
          typeof (w as { startMin?: unknown }).startMin === "number"
            ? (w as { startMin: number }).startMin
            : null;
        const end =
          typeof (w as { endMin?: unknown }).endMin === "number"
            ? (w as { endMin: number }).endMin
            : null;
        if (start == null || end == null) return null;
        return `${fmtMin(start)}-${fmtMin(end)}`;
      })
      .filter((x): x is string => !!x);
    if (windows.length) out.push(`${days[d]} ${windows.join(", ")}`);
  }
  return out;
}

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

/**
 * Replace baked empty-hours copy in a builder tree / snapshot with real lines.
 * Returns a new tree when anything changed.
 */
export function replaceEmptyHoursInJson<T>(value: T, hoursLines: string[]): { value: T; changed: boolean } {
  if (hoursLines.length === 0) return { value, changed: false };
  const empty = new Set<string>(EMPTY_HOURS_MESSAGES);
  const replacement = hoursLines.join(" · ");
  let changed = false;

  const walk = (node: Json): Json => {
    if (Array.isArray(node)) return node.map(walk);
    if (!node || typeof node !== "object") {
      if (typeof node === "string" && empty.has(node)) {
        changed = true;
        return replacement;
      }
      return node;
    }
    const out: { [k: string]: Json } = {};
    for (const [k, v] of Object.entries(node)) {
      if ((k === "text" || k === "emptyStateText" || k === "overlayHours") && typeof v === "string" && empty.has(v)) {
        changed = true;
        out[k] = replacement;
      } else {
        out[k] = walk(v as Json);
      }
    }
    return out;
  };

  const next = walk(value as unknown as Json) as T;
  return { value: next, changed };
}
