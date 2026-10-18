/**
 * TUL-1147: THE time-zone line a guest reads, in one place. The booking sheet,
 * its confirmation and the client's visit pages all name the zone with this
 * ("Hora de Cancún" / "Cancún time"), never a raw "GMT-5". Pure.
 */
import { zoneCity } from "@/lib/events/public-event-time";
import { localizePlaceCity } from "@/lib/talent-site/city-label";

/** IANA city names whose Spanish/English display needs an accent (QA DS-07: "Hora de Cancun"). */
const ZONE_CITY_DISPLAY: Record<string, string> = {
  Cancun: "Cancún",
  Merida: "Mérida",
  Mazatlan: "Mazatlán",
  Bogota: "Bogotá",
  Asuncion: "Asunción",
  Sao_Paulo: "São Paulo",
  Port_of_Spain: "Port of Spain",
};

/**
 * TUL-59 / TUL-533: "Hora de {city}" / "{city} time".
 * Prefer the talent's place city when known (Houston over Chicago for
 * America/Chicago; Morelia over Mexico City for America/Mexico_City). Otherwise
 * name the IANA zone in the page language (ES → Ciudad de México, not Mexico City).
 * Accent-only overrides keep Cancún / Mérida etc. when the shared zone map has no entry.
 */
export function zoneTimeLabel(
  tz: string | null | undefined,
  es: boolean,
  placeCity?: string | null,
): string {
  const zone = (tz ?? "").trim();
  if (!zone) return "";
  const place = placeCity?.trim();
  if (place) {
    const city = localizePlaceCity(place, es ? "es" : "en");
    return es ? `Hora de ${city}` : `${city} time`;
  }
  const raw = zone.includes("/") ? (zone.split("/").pop() ?? zone) : zone;
  const city = ZONE_CITY_DISPLAY[raw] ?? zoneCity(zone, es ? "es" : "en");
  return es ? `Hora de ${city}` : `${city} time`;
}
