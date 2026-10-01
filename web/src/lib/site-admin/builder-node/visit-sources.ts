/**
 * Load visit facts for the shared `visit` widget.
 * Sources: talent_service_areas, talent_languages, talent_booking_hours.weekly,
 * and what the profile drawer saves when those are empty (F30): the city text
 * (drawer Location) and the open days of the availability pattern.
 * Never invents facts; returns [] when none.
 */
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { parseWeeklyHours, type WeekdayIndex } from "@/lib/scheduling/hours-types";
import { recurringFromAvailabilityData, weeklyFromAvailabilityPattern } from "@/lib/scheduling/pattern-hours";
import { cityLabelFromPlaceText } from "@/lib/scheduling/timezone-from-place";
import { localizedLanguageName } from "@/lib/talent-site/language-label";
import { canonicalCityLabel } from "@/lib/talent-site/server/city-label.server";

import { parseLocationSettings, toPublicLocation, type TalentLocationPublic } from "@/lib/talent/location-settings";

import type { TalentVisitFact, TalentVisitFacts } from "./visit-types";

const DAY_ORDER: readonly WeekdayIndex[] = [1, 2, 3, 4, 5, 6, 0]; // Mon..Sun
const DAY_LABELS_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const DAY_LABELS_ES = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"] as const;

function clock(min: number): string {
  return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")}`;
}

/** Earliest open to latest close across the week, e.g. "9:00 to 20:00". */
function hoursWindow(raw: unknown, es: boolean): string {
  const weekly = parseWeeklyHours(raw);
  if (!weekly) return "";
  let start = Infinity;
  let end = -Infinity;
  for (const day of DAY_ORDER) {
    for (const w of weekly[day] ?? []) {
      start = Math.min(start, w.startMin);
      end = Math.max(end, w.endMin);
    }
  }
  if (!Number.isFinite(start) || !Number.isFinite(end)) return "";
  return es
    ? `${clock(start)} a ${clock(end)}, con cita`
    : `${clock(start)} to ${clock(end)}, by appointment`;
}

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

function compactDayRange(days: WeekdayIndex[], es = false): string {
  if (!days.length) return "";
  const sorted = [...days].sort(
    (a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b),
  );
  const names = es ? DAY_LABELS_ES : DAY_LABELS_EN;
  const labels = sorted.map((d) => names[d] ?? String(d));
  if (labels.length === 1) return labels[0]!;
  const idxs = sorted.map((d) => DAY_ORDER.indexOf(d));
  let contiguous = idxs.length > 1;
  for (let i = 1; i < idxs.length; i++) {
    if (idxs[i]! !== idxs[i - 1]! + 1) {
      contiguous = false;
      break;
    }
  }
  if (contiguous) {
    return es
      ? `${labels[0]} a ${labels[labels.length - 1]!.toLowerCase()}`
      : `${labels[0]} to ${labels[labels.length - 1]}`;
  }
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
): Promise<{ talentVisitFacts: TalentVisitFact[]; talentLocation?: TalentLocationPublic | null }> {
  if (!talentProfileId) return { talentVisitFacts: [] };
  const admin = createServiceRoleClient();
  if (!admin) return { talentVisitFacts: [] };

  try {
    const [areasRes, langsRes, hoursRes, cancelRes, profileRes, locationRes] = await Promise.all([
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
      // Change window: the most generous published cancellation window.
      admin
        .from("talent_offerings")
        .select("cancellation_hours")
        .eq("talent_profile_id", talentProfileId)
        .eq("status", "published")
        .not("cancellation_hours", "is", null),
      admin
        .from("talent_profiles")
        .select("home_city_text, availability_data")
        .eq("id", talentProfileId)
        .maybeSingle(),
      // Location settings (Services > Defaults). The private address rides in
      // this row, so it is passed ONLY through `toPublicLocation` below.
      admin
        .from("talent_location_settings")
        .select("address_mode, studio_kind, zone_neighbourhood, arrival_note, arrival_photo_url, exact_address")
        .eq("talent_profile_id", talentProfileId)
        .maybeSingle(),
    ]);
    if (locationRes.error) logServerError("visit.loadLocationSettings", locationRes.error);

    if (areasRes.error) logServerError("visit.loadServiceAreas", areasRes.error);
    if (langsRes.error) logServerError("visit.loadLanguages", langsRes.error);
    if (hoursRes.error) logServerError("visit.loadBookingHours", hoursRes.error);
    if (cancelRes.error) logServerError("visit.loadCancellation", cancelRes.error);

    const areas = (areasRes.data ?? []) as unknown as AreaRow[];
    const langs = (langsRes.data ?? []) as unknown as LangRow[];
    if (profileRes.error) logServerError("visit.loadProfile", profileRes.error);
    const profile = (profileRes.data ?? null) as { home_city_text: string | null; availability_data: unknown } | null;
    // No hours row yet: the drawer pattern's open days (days only, no clock:
    // the talent picked days, not times).
    const savedHours = (hoursRes.data ?? null) as HoursRow | null;
    const patternWeekly = savedHours
      ? null
      : weeklyFromAvailabilityPattern(recurringFromAvailabilityData(profile?.availability_data), null);
    const hoursRow: HoursRow | null = savedHours ?? (patternWeekly ? { weekly: patternWeekly } : null);

    const facts: TalentVisitFact[] = [];
    const es = locale.toLowerCase().startsWith("es");

    const base = areas.find((a) => a.service_kind === "home_base");
    // Place text can arrive ASCII-folded ("Cancun"); the locations row has the accent.
    const baseRaw = (base ? placeName(base, locale) : null) ?? cityLabelFromPlaceText(profile?.home_city_text);
    const baseName = baseRaw ? await canonicalCityLabel(admin, baseRaw, locale, [cityLabelFromPlaceText(profile?.home_city_text)]) : null;
    const locationSettings = parseLocationSettings(locationRes.data ?? null);
    const talentLocation = toPublicLocation(locationSettings, baseName ?? "");
    // The note follows the talent's address setting (it used to always promise
    // the address at confirmation, which is only one of the three modes).
    const whereNote =
      locationSettings.addressMode === "after_booking"
        ? es
          ? "La dirección exacta llega al confirmar."
          : "The exact address comes with your confirmation."
        : locationSettings.addressMode === "zone_only"
          ? es
            ? "Solo se muestra la zona."
            : "Only the area is shown."
          : undefined;
    if (baseName) {
      facts.push({
        label: es ? "Dónde" : "Where",
        value: baseName,
        icon: "place",
        ...(whereNote ? { note: whereNote } : {}),
      });
    }

    const travel = await Promise.all(
      areas
        .filter((a) => a.service_kind === "travel_to")
        .map((a) => placeName(a, locale))
        .filter((x): x is string => Boolean(x))
        .map((x) => canonicalCityLabel(admin, x, locale)),
    );
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

    const daysLabel = compactDayRange(openDaysFromWeekly(hoursRow?.weekly), es);
    if (daysLabel) {
      const window = savedHours ? hoursWindow(hoursRow?.weekly, es) : "";
      facts.push({
        label: es ? "Horario" : "Hours",
        value: daysLabel,
        icon: "hours",
        ...(window ? { note: window } : {}),
      });
    }

    const cancelHours = ((cancelRes.data ?? []) as { cancellation_hours: number | null }[])
      .map((r) => r.cancellation_hours)
      .filter((h): h is number => typeof h === "number" && h >= 0);
    if (cancelHours.length) {
      const h = Math.min(...cancelHours);
      facts.push({
        label: es ? "Cambios" : "Changes",
        value: es ? `Hasta ${h} h antes` : `Up to ${h} h before`,
        icon: "changes",
        note: es ? "Según la política publicada de la profesional." : "Per the professional's published policy.",
      });
    }

    const languageNames = langs
      .map((l) => localizedLanguageName({ name: l.language_name, code: l.language_code }, locale))
      .filter(Boolean);
    if (languageNames.length) {
      facts.push({
        label: es ? "Idiomas" : "Languages",
        value: languageNames.join(" · "),
        icon: "languages",
      });
    }

    return { talentVisitFacts: facts, talentLocation };
  } catch (err) {
    logServerError("visit.loadVisitSources", err);
    return { talentVisitFacts: [] };
  }
}

/** Pure helper for tests: shape a facts payload. */
export function asVisitFacts(facts: TalentVisitFact[]): TalentVisitFacts {
  return { facts };
}
