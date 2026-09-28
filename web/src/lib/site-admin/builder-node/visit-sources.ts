/**
 * Load visit facts for the shared `visit` widget.
 * Sources: talent_service_areas, talent_languages, talent_booking_hours.weekly.
 * Never invents facts; returns [] when none.
 */
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { parseWeeklyHours, type WeekdayIndex } from "@/lib/scheduling/hours-types";

import type { TalentVisitFact, TalentVisitFacts } from "./visit-types";

const DAY_ORDER: readonly WeekdayIndex[] = [1, 2, 3, 4, 5, 6, 0]; // Mon..Sun
const DAY_LABELS_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

type AreaRow = {
  service_kind: string | null;
  city: string | null;
  locations: { display_name_i18n: Record<string, string | null> | null } | null;
};

type LangRow = {
  language_name: string | null;
  language_code: string | null;
};

type HoursRow = {
  weekly: unknown;
};

function placeName(area: AreaRow, locale: string): string | null {
  const n = area.locations?.display_name_i18n;
  if (n) {
    const lang = locale.toLowerCase().startsWith("es") ? "es" : "en";
    const fromLoc = (n[lang] ?? n.en ?? n.es ?? null)?.trim() || null;
    if (fromLoc) return fromLoc;
  }
  const city = area.city?.trim();
  return city || null;
}

function compactDayRange(days: WeekdayIndex[]): string {
  if (!days.length) return "";
  const sorted = [...days].sort(
    (a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b),
  );
  const labels = sorted.map((d) => DAY_LABELS_EN[d] ?? String(d));
  if (labels.length === 1) return labels[0]!;
  const idxs = sorted.map((d) => DAY_ORDER.indexOf(d));
  let contiguous = idxs.length > 1;
  for (let i = 1; i < idxs.length; i++) {
    if (idxs[i]! !== idxs[i - 1]! + 1) {
      contiguous = false;
      break;
    }
  }
  if (contiguous) return `${labels[0]} to ${labels[labels.length - 1]}`;
  return labels.join(" · ");
}

function openDaysFromWeekly(raw: unknown): WeekdayIndex[] {
  const weekly = parseWeeklyHours(raw);
  if (!weekly) return [];
  const open: WeekdayIndex[] = [];
  for (const day of DAY_ORDER) {
    if ((weekly[day] ?? []).length > 0) open.push(day);
  }
  return open;
}

export async function loadVisitSources(
  talentProfileId: string,
  locale = "en",
): Promise<{ talentVisitFacts: TalentVisitFact[] }> {
  if (!talentProfileId) return { talentVisitFacts: [] };
  const admin = createServiceRoleClient();
  if (!admin) return { talentVisitFacts: [] };

  try {
    const [areasRes, langsRes, hoursRes] = await Promise.all([
      admin
        .from("talent_service_areas")
        .select("service_kind, city, locations ( display_name_i18n )")
        .eq("talent_profile_id", talentProfileId),
      admin
        .from("talent_languages")
        .select("language_name, language_code")
        .eq("talent_profile_id", talentProfileId)
        .order("display_order", { ascending: true })
        .order("language_name", { ascending: true }),
      admin
        .from("talent_booking_hours")
        .select("weekly")
        .eq("talent_profile_id", talentProfileId)
        .maybeSingle(),
    ]);

    if (areasRes.error) logServerError("visit.loadServiceAreas", areasRes.error);
    if (langsRes.error) logServerError("visit.loadLanguages", langsRes.error);
    if (hoursRes.error) logServerError("visit.loadBookingHours", hoursRes.error);

    const areas = (areasRes.data ?? []) as unknown as AreaRow[];
    const langs = (langsRes.data ?? []) as unknown as LangRow[];
    const hoursRow = (hoursRes.data ?? null) as HoursRow | null;

    const facts: TalentVisitFact[] = [];
    const es = locale.toLowerCase().startsWith("es");

    const base = areas.find((a) => a.service_kind === "home_base");
    const baseName = base ? placeName(base, locale) : null;
    if (baseName) {
      facts.push({
        label: es ? "Dónde" : "Where",
        value: baseName,
        icon: "place",
      });
    }

    const travel = areas
      .filter((a) => a.service_kind === "travel_to")
      .map((a) => placeName(a, locale))
      .filter((x): x is string => Boolean(x));
    if (travel.length) {
      facts.push({
        label: es ? "Va a" : "Travels to",
        value: travel.join(" · "),
        icon: "travel",
      });
    } else if (areas.some((a) => a.service_kind === "remote_only") && !baseName) {
      facts.push({
        label: es ? "Dónde" : "Where",
        value: es ? "En línea" : "Online",
        icon: "remote",
      });
    }

    const daysLabel = compactDayRange(openDaysFromWeekly(hoursRow?.weekly));
    if (daysLabel) {
      facts.push({
        label: es ? "Días" : "Days",
        value: daysLabel,
        icon: "hours",
      });
    }

    const languageNames = langs
      .map((l) => l.language_name?.trim() || l.language_code?.trim() || "")
      .filter(Boolean);
    if (languageNames.length) {
      facts.push({
        label: es ? "Idiomas" : "Languages",
        value: languageNames.join(" · "),
        icon: "languages",
      });
    }

    return { talentVisitFacts: facts };
  } catch (err) {
    logServerError("visit.loadVisitSources", err);
    return { talentVisitFacts: [] };
  }
}

/** Pure helper for tests: shape a facts payload. */
export function asVisitFacts(facts: TalentVisitFact[]): TalentVisitFacts {
  return { facts };
}
