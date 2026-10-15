"use client";

import { useMemo, useState } from "react";
import { useAgendaCopy } from "./use-agenda-copy";

/**
 * TimezonePicker (TUL-94): a searchable pick from the IANA list, never free
 * text. The browser's own list (`Intl.supportedValuesOf("timeZone")`) is the
 * source, so a typo or a concatenated value like "America/Europe/Madrid" cannot
 * be chosen. The server validates the saved value again.
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

/** Zones offered first (TUL-821): Mexico, where most talents work. */
export const SUGGESTED_ZONES = [
  "America/Cancun",
  "America/Mexico_City",
  "America/Monterrey",
  "America/Merida",
  "America/Chihuahua",
  "America/Tijuana",
];

function genericName(zone: string, locale: string): string {
  try {
    return (
      new Intl.DateTimeFormat(locale, { timeZone: zone, timeZoneName: "longGeneric" })
        .formatToParts(new Date())
        .find((p) => p.type === "timeZoneName")?.value ?? ""
    );
  } catch {
    return "";
  }
}

/**
 * TUL-822: the raw IANA id ("Africa/Addis Ababa") is English-only. Lead with
 * the locale's own zone name ("hora de África oriental") and keep the city
 * tail so the zone is still findable, plus the UTC offset.
 */
export function zoneLabel(zone: string, locale: string): string {
  const city = (zone.split("/").pop() ?? zone).replaceAll("_", " ");
  const generic = genericName(zone, locale);
  const off = offsetLabel(zone);
  const head = generic && generic.toLowerCase() !== city.toLowerCase() ? `${generic} · ${city}` : city;
  return off ? `${head} (${off})` : head;
}

export function TimezonePicker({ value, onChange }: { value: string; onChange: (zone: string) => void }) {
  const copy = useAgendaCopy();
  const [query, setQuery] = useState("");
  const zones = useMemo(() => listIanaTimeZones(), []);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase().replaceAll(" ", "_");
    const list = q ? zones.filter((z) => z.toLowerCase().includes(q)) : zones;
    // The current value stays selectable even when the filter hides it.
    return value && !list.includes(value) && zones.includes(value) ? [value, ...list] : list;
  }, [query, zones, value]);

  const suggested = useMemo(() => (query.trim() ? [] : SUGGESTED_ZONES.filter((z) => zones.includes(z))), [query, zones]);

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
        {suggested.length > 0 ? (
          <optgroup label={copy.t("Suggested")}>
            {suggested.map((z) => (
              <option key={`s-${z}`} value={z}>
                {zoneLabel(z, copy.locale)}
              </option>
            ))}
          </optgroup>
        ) : null}
        <optgroup label={copy.t("All time zones")}>
          {shown.map((z) => (
            <option key={z} value={z}>
              {zoneLabel(z, copy.locale)}
            </option>
          ))}
        </optgroup>
      </select>
    </div>
  );
}
