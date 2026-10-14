"use client";

import { useMemo, useState } from "react";
import { zoneCity } from "@/lib/events/public-event-time";
import { useAgendaCopy } from "./use-agenda-copy";

/**
 * TimezonePicker (TUL-94): a searchable pick from the IANA list, never free
 * text. The browser's own list (`Intl.supportedValuesOf("timeZone")`) is the
 * source, so a typo or a concatenated value like "America/Europe/Madrid" cannot
 * be chosen. The server validates the saved value again.
 *
 * Labels follow the UI locale (TUL-358 follow-up): Spanish sees
 * "América/Ciudad de México", not the English IANA path with spaces.
 */

const FALLBACK_ZONES = [
  "America/Cancun",
  "America/Mexico_City",
  "America/Bogota",
  "America/Argentina/Buenos_Aires",
  "America/New_York",
  "America/Los_Angeles",
  "Europe/Madrid",
  "Europe/London",
  "UTC",
];

/** Continent / ocean segment of an IANA id — localized for ES UI. */
const REGION_LABEL: Record<string, { en: string; es: string }> = {
  Africa: { en: "Africa", es: "África" },
  America: { en: "America", es: "América" },
  Antarctica: { en: "Antarctica", es: "Antártida" },
  Arctic: { en: "Arctic", es: "Ártico" },
  Asia: { en: "Asia", es: "Asia" },
  Atlantic: { en: "Atlantic", es: "Atlántico" },
  Australia: { en: "Australia", es: "Australia" },
  Europe: { en: "Europe", es: "Europa" },
  Indian: { en: "Indian", es: "Índico" },
  Pacific: { en: "Pacific", es: "Pacífico" },
  Etc: { en: "Etc", es: "Etc" },
};

export function listIanaTimeZones(): string[] {
  try {
    const fn = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf;
    const zones = typeof fn === "function" ? fn("timeZone") : [];
    if (zones.length > 0) return zones.includes("UTC") ? zones : [...zones, "UTC"];
  } catch {
    // fall through to the short list
  }
  return FALLBACK_ZONES;
}

export function isListedTimeZone(value: string): boolean {
  return listIanaTimeZones().includes(value);
}

function offsetLabel(zone: string): string {
  try {
    const part = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "shortOffset" })
      .formatToParts(new Date())
      .find((p) => p.type === "timeZoneName")?.value;
    return part ? part.replace("GMT", "UTC") : "";
  } catch {
    return "";
  }
}

/**
 * Human label for an IANA zone in the working-hours picker.
 * City segment uses the shared zoneCity map (Cancún, Ciudad de México, …);
 * region segment is translated on ES. Offset stays UTC±N.
 */
export function ianaTimeZoneLabel(zone: string, locale: "en" | "es" = "en"): string {
  const parts = zone.split("/");
  const labeled =
    parts.length === 1
      ? zone === "UTC"
        ? "UTC"
        : zoneCity(zone, locale)
      : [
          ...parts.slice(0, -1).map((seg) => REGION_LABEL[seg]?.[locale] ?? seg.replaceAll("_", " ")),
          zoneCity(zone, locale),
        ].join("/");
  const off = offsetLabel(zone);
  return off ? `${labeled} (${off})` : labeled;
}

export function TimezonePicker({ value, onChange }: { value: string; onChange: (zone: string) => void }) {
  const copy = useAgendaCopy();
  const [query, setQuery] = useState("");
  const zones = useMemo(() => listIanaTimeZones(), []);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase().replaceAll(" ", "_");
    const list = q
      ? zones.filter((z) => {
          if (z.toLowerCase().includes(q)) return true;
          // Match localized city labels too ("ciudad de mexico", "cancún").
          return ianaTimeZoneLabel(z, copy.locale).toLowerCase().includes(query.trim().toLowerCase());
        })
      : zones;
    // The current value stays selectable even when the filter hides it.
    return value && !list.includes(value) && zones.includes(value) ? [value, ...list] : list;
  }, [query, zones, value, copy.locale]);

  return (
    <div className="mt-1 flex flex-col gap-2">
      <input
        type="search"
        aria-label={copy.t("Search time zones")}
        placeholder={copy.t("Search, like Cancun or Madrid")}
        className="w-full rounded-xl border border-black/10 px-3 py-2"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <select
        aria-label={copy.t("Time zone")}
        data-testid="working-hours-timezone"
        className="w-full rounded-xl border border-black/10 px-3 py-2"
        value={zones.includes(value) ? value : ""}
        onChange={(e) => onChange(e.target.value)}
      >
        {!zones.includes(value) ? <option value="">{copy.t("Pick a time zone")}</option> : null}
        {shown.map((z) => (
          <option key={z} value={z}>
            {ianaTimeZoneLabel(z, copy.locale)}
          </option>
        ))}
      </select>
    </div>
  );
}
