/**
 * A talent's timezone from the city she saved in the profile drawer (F48).
 *
 * The drawer stores Google's formatted place text ("Ciudad de México, CDMX,
 * Mexico"). Single-zone countries map straight to their zone; multi-zone
 * countries match a state or city keyword, else their most populous zone.
 * Unknown text returns null so callers fall back (never a guessed "UTC").
 *
 * Pure.
 */

function norm(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

type Rule = { match: readonly string[]; tz: string };

/** Multi-zone countries: first matching keyword wins, then `fallback`. */
const MULTI: Record<string, { rules: readonly Rule[]; fallback: string }> = {
  mexico: {
    rules: [
      { match: ["quintana roo", "cancun", "tulum", "playa del carmen", "cozumel", "bacalar", "chetumal", "holbox"], tz: "America/Cancun" },
      { match: ["baja california sur", "la paz", "los cabos", "cabo san lucas", "san jose del cabo", "todos santos"], tz: "America/Mazatlan" },
      { match: ["baja california", "tijuana", "mexicali", "ensenada", "rosarito"], tz: "America/Tijuana" },
      { match: ["sonora", "hermosillo"], tz: "America/Hermosillo" },
      { match: ["sinaloa", "mazatlan", "culiacan", "nayarit", "tepic"], tz: "America/Mazatlan" },
      { match: ["chihuahua"], tz: "America/Chihuahua" },
      { match: ["ciudad juarez"], tz: "America/Ciudad_Juarez" },
      // Central Mexico cities that must not fall through a coastal rule.
      { match: ["michoacan", "morelia", "guadalajara", "jalisco", "monterrey", "nuevo leon", "puebla", "oaxaca", "queretaro", "guanajuato"], tz: "America/Mexico_City" },
    ],
    fallback: "America/Mexico_City",
  },
  "united states": {
    rules: [
      { match: ["california", ", ca", "los angeles", "san francisco", "san diego", "seattle", "oregon", "portland", "nevada", "las vegas"], tz: "America/Los_Angeles" },
      { match: ["arizona", "phoenix"], tz: "America/Phoenix" },
      { match: ["colorado", "denver", "utah", "salt lake", "new mexico", "montana", "idaho", "wyoming"], tz: "America/Denver" },
      { match: ["texas", ", tx", "houston", "austin", "dallas", "san antonio", "illinois", "chicago", "minnesota", "louisiana", "new orleans", "missouri", "tennessee", "nashville", "wisconsin", "iowa", "kansas", "oklahoma", "alabama", "mississippi", "arkansas", "nebraska"], tz: "America/Chicago" },
      { match: ["hawaii", "honolulu"], tz: "Pacific/Honolulu" },
      { match: ["alaska", "anchorage"], tz: "America/Anchorage" },
    ],
    fallback: "America/New_York",
  },
  canada: {
    rules: [
      { match: ["british columbia", "vancouver", "victoria"], tz: "America/Vancouver" },
      { match: ["alberta", "calgary", "edmonton"], tz: "America/Edmonton" },
      { match: ["manitoba", "winnipeg"], tz: "America/Winnipeg" },
      { match: ["nova scotia", "halifax"], tz: "America/Halifax" },
    ],
    fallback: "America/Toronto",
  },
  brazil: {
    rules: [{ match: ["amazonas", "manaus"], tz: "America/Manaus" }],
    fallback: "America/Sao_Paulo",
  },
  spain: {
    rules: [{ match: ["canary", "canarias", "tenerife", "gran canaria", "las palmas"], tz: "Atlantic/Canary" }],
    fallback: "Europe/Madrid",
  },
  argentina: { rules: [], fallback: "America/Argentina/Buenos_Aires" },
  australia: {
    rules: [
      { match: ["western australia", "perth"], tz: "Australia/Perth" },
      { match: ["queensland", "brisbane"], tz: "Australia/Brisbane" },
      { match: ["south australia", "adelaide"], tz: "Australia/Adelaide" },
    ],
    fallback: "Australia/Sydney",
  },
};

const SINGLE: Record<string, string> = {
  colombia: "America/Bogota",
  peru: "America/Lima",
  chile: "America/Santiago",
  guatemala: "America/Guatemala",
  "costa rica": "America/Costa_Rica",
  panama: "America/Panama",
  "dominican republic": "America/Santo_Domingo",
  "republica dominicana": "America/Santo_Domingo",
  "puerto rico": "America/Puerto_Rico",
  cuba: "America/Havana",
  uruguay: "America/Montevideo",
  venezuela: "America/Caracas",
  "el salvador": "America/El_Salvador",
  honduras: "America/Tegucigalpa",
  nicaragua: "America/Managua",
  "united kingdom": "Europe/London",
  uk: "Europe/London",
  ireland: "Europe/Dublin",
  france: "Europe/Paris",
  italy: "Europe/Rome",
  italia: "Europe/Rome",
  germany: "Europe/Berlin",
  portugal: "Europe/Lisbon",
  netherlands: "Europe/Amsterdam",
  belgium: "Europe/Brussels",
  switzerland: "Europe/Zurich",
  austria: "Europe/Vienna",
  greece: "Europe/Athens",
  "united arab emirates": "Asia/Dubai",
  japan: "Asia/Tokyo",
};

const COUNTRY_ALIASES: Record<string, string> = {
  mx: "mexico",
  "estados unidos": "united states",
  usa: "united states",
  us: "united states",
  "united states of america": "united states",
  espana: "spain",
  brasil: "brazil",
};

/** IANA zone for a saved city text, or null when unknown. */
export function timezoneFromPlaceText(text: string | null | undefined): string | null {
  const raw = (text ?? "").trim();
  if (!raw) return null;
  const full = norm(raw);
  const parts = full.split(",").map((p) => p.trim()).filter(Boolean);
  const lastRaw = parts[parts.length - 1] ?? "";
  const country = COUNTRY_ALIASES[lastRaw] ?? lastRaw;
  const multi = MULTI[country];
  if (multi) {
    for (const rule of multi.rules) if (rule.match.some((k) => full.includes(k))) return rule.tz;
    return multi.fallback;
  }
  if (SINGLE[country]) return SINGLE[country]!;
  // No country segment: try a known city keyword in any multi-zone country.
  if (parts.length === 1) {
    if (/\b(cdmx|ciudad de mexico|mexico city|guadalajara|monterrey|puebla|oaxaca|merida|queretaro|morelia)\b/.test(full)) {
      return "America/Mexico_City";
    }
    if (/\b(houston|austin|dallas|san antonio|chicago)\b/.test(full)) {
      return "America/Chicago";
    }
    for (const { rules } of Object.values(MULTI)) {
      for (const rule of rules) if (rule.match.some((k) => !k.startsWith(",") && full === k)) return rule.tz;
    }
  }
  return null;
}

/** The city part of the saved text ("Ciudad de México, CDMX, Mexico" -> "Ciudad de México"). */
export function cityLabelFromPlaceText(text: string | null | undefined): string | null {
  const first = (text ?? "").split(",")[0]?.trim();
  return first || null;
}
