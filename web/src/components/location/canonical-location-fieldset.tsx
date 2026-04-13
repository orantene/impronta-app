"use client";

import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CitySuggestion, CountrySuggestion } from "@/lib/location-autocomplete";

const LOCATION_SEARCH_DEBOUNCE_MS = 320;

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

type Selection = {
  country: CountrySuggestion | null;
  city: CitySuggestion | null;
};

type Props = {
  prefix: string;
  title: string;
  countryLabel: string;
  cityLabel: string;
  required?: boolean;
  helperText?: string;
  initial?: Selection;
  /** When true, skip the fieldset card wrapper and render fields directly */
  noCard?: boolean;
  /** Merged into country/city search inputs (e.g. talent panel styling). */
  inputClassName?: string;
};

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error("Request failed");
  const data = (await response.json()) as T;
  return data;
}

function OptionList<T extends { id?: string | null; name_en: string; subtitle?: string | null }>(props: {
  items: T[];
  onSelect: (item: T) => void;
  emptyLabel: string;
}) {
  if (props.items.length === 0) {
    return (
      <div className="rounded-xl border border-border/50 bg-card px-3 py-2 text-sm text-muted-foreground">
        {props.emptyLabel}
      </div>
    );
  }

  return (
    <div className="max-h-56 overflow-y-auto rounded-xl border border-border/60 bg-card shadow-lg">
      {props.items.map((item, index) => (
        <button
          key={`${"google_place_id" in item && item.google_place_id ? item.google_place_id : item.id ?? item.name_en}-${index}`}
          type="button"
          className="flex w-full flex-col items-start gap-0.5 border-b border-border/30 px-3 py-2 text-left text-sm last:border-b-0 hover:bg-accent"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => props.onSelect(item)}
        >
          <span className="font-medium text-foreground">{item.name_en}</span>
          {item.subtitle ? (
            <span className="text-xs font-normal text-muted-foreground">{item.subtitle}</span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

export function CanonicalLocationFieldset({
  prefix,
  title,
  countryLabel,
  cityLabel,
  required = false,
  helperText,
  initial,
  noCard = false,
  inputClassName,
}: Props) {
  const [countryInput, setCountryInput] = useState(initial?.country?.name_en ?? "");
  const [cityInput, setCityInput] = useState(initial?.city?.name_en ?? "");
  const [selectedCountry, setSelectedCountry] = useState<CountrySuggestion | null>(initial?.country ?? null);
  const [selectedCity, setSelectedCity] = useState<CitySuggestion | null>(initial?.city ?? null);
  const [countryOptions, setCountryOptions] = useState<CountrySuggestion[]>([]);
  const [cityOptions, setCityOptions] = useState<CitySuggestion[]>([]);
  const [countryOpen, setCountryOpen] = useState(false);
  const [cityOpen, setCityOpen] = useState(false);
  const [countryLoading, setCountryLoading] = useState(false);
  const [cityLoading, setCityLoading] = useState(false);

  const debouncedCountryInput = useDebouncedValue(countryInput, LOCATION_SEARCH_DEBOUNCE_MS);
  const debouncedCityInput = useDebouncedValue(cityInput, LOCATION_SEARCH_DEBOUNCE_MS);
  const countryQueryPending = countryInput !== debouncedCountryInput;
  const cityQueryPending = cityInput !== debouncedCityInput;

  useEffect(() => {
    let ignore = false;
    setCountryLoading(true);
    fetchJson<{ countries: CountrySuggestion[] }>(
      `/api/location-countries?query=${encodeURIComponent(debouncedCountryInput)}`,
    )
      .then((data) => {
        if (!ignore) {
          const list = data?.countries;
          setCountryOptions(Array.isArray(list) ? list : []);
        }
      })
      .catch(() => {
        if (!ignore) setCountryOptions([]);
      })
      .finally(() => {
        if (!ignore) setCountryLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [debouncedCountryInput]);

  useEffect(() => {
    if (!selectedCountry?.iso2) {
      setCityOptions([]);
      return;
    }
    let ignore = false;
    setCityLoading(true);
    fetchJson<{ cities: CitySuggestion[] }>(
      `/api/location-cities?countryIso2=${encodeURIComponent(selectedCountry.iso2)}&query=${encodeURIComponent(debouncedCityInput)}&countryNameEn=${encodeURIComponent(selectedCountry.name_en)}&countryNameEs=${encodeURIComponent(selectedCountry.name_es ?? "")}`,
    )
      .then((data) => {
        if (!ignore) setCityOptions(data.cities);
      })
      .catch(() => {
        if (!ignore) setCityOptions([]);
      })
      .finally(() => {
        if (!ignore) setCityLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [selectedCountry?.iso2, selectedCountry?.name_en, selectedCountry?.name_es, debouncedCityInput]);

  const countrySummary = useMemo(() => {
    if (!selectedCountry) return "";
    return `${selectedCountry.name_en} (${selectedCountry.iso2})`;
  }, [selectedCountry]);

  const inner = (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`${prefix}_country_input`}>{countryLabel}</Label>
          <div className="relative">
            <Input
              id={`${prefix}_country_input`}
              value={countryInput}
              autoComplete="off"
              placeholder="Search country..."
              className={inputClassName}
              onFocus={() => setCountryOpen(true)}
              onBlur={() => setTimeout(() => setCountryOpen(false), 120)}
              onChange={(e) => {
                const next = e.target.value;
                setCountryInput(next);
                setCountryOpen(true);
                if (!selectedCountry || next !== selectedCountry.name_en) {
                  setSelectedCountry(null);
                  setSelectedCity(null);
                  setCityInput("");
                }
              }}
            />
            {countryOpen ? (
              <div className="absolute left-0 right-0 top-[calc(100%+0.35rem)] z-30">
                <OptionList
                  items={countryOptions}
                  emptyLabel={
                    countryLoading || countryQueryPending ? "Searching countries..." : "No countries found."
                  }
                  onSelect={async (country) => {
                    if (country.google_place_id) {
                      try {
                        const response = await fetch(
                          `/api/location-country-details?placeId=${encodeURIComponent(country.google_place_id)}`,
                          { cache: "no-store" },
                        );
                        const data = (await response.json()) as {
                          ok?: boolean;
                          iso2?: string;
                          name_en?: string;
                          name_es?: string | null;
                        };
                        if (data.ok && data.iso2 && data.name_en) {
                          setSelectedCountry({
                            id: country.id ?? null,
                            iso2: data.iso2.toUpperCase(),
                            name_en: data.name_en,
                            name_es: data.name_es ?? null,
                          });
                          setCountryInput(data.name_en);
                          setSelectedCity(null);
                          setCityInput("");
                          setCountryOpen(false);
                          return;
                        }
                      } catch {
                        /* unresolved — do not store row without ISO2 */
                      }
                      return;
                    }
                    setSelectedCountry(country);
                    setCountryInput(country.name_en);
                    setSelectedCity(null);
                    setCityInput("");
                    setCountryOpen(false);
                  }}
                />
              </div>
            ) : null}
          </div>
          {countrySummary ? (
            <p className="text-xs text-muted-foreground">Selected: {countrySummary}</p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor={`${prefix}_city_input`}>{cityLabel}</Label>
          <div className="relative">
            <Input
              id={`${prefix}_city_input`}
              value={cityInput}
              autoComplete="off"
              placeholder={selectedCountry ? "Search city..." : "Select country first"}
              disabled={!selectedCountry}
              className={inputClassName}
              onFocus={() => {
                if (selectedCountry) setCityOpen(true);
              }}
              onBlur={() => setTimeout(() => setCityOpen(false), 120)}
              onChange={(e) => {
                const next = e.target.value;
                setCityInput(next);
                if (selectedCountry) setCityOpen(true);
                if (!selectedCity || next !== selectedCity.name_en) {
                  setSelectedCity(null);
                }
              }}
            />
            {cityOpen && selectedCountry ? (
              <div className="absolute left-0 right-0 top-[calc(100%+0.35rem)] z-30">
                <OptionList
                  items={cityOptions}
                  emptyLabel={
                    cityLoading || cityQueryPending ? "Searching cities..." : "No cities found."
                  }
                  onSelect={async (city) => {
                    setCityOpen(false);
                    if (city.google_place_id && selectedCountry) {
                      try {
                        const response = await fetch(
                          `/api/location-place-details?placeId=${encodeURIComponent(city.google_place_id)}&countryIso2=${encodeURIComponent(selectedCountry.iso2)}`,
                          { cache: "no-store" },
                        );
                        const data = (await response.json()) as {
                          ok?: boolean;
                          city_name_en?: string;
                          city_slug?: string;
                          city_name_es?: string | null;
                          lat?: number | null;
                          lng?: number | null;
                          country_iso2?: string;
                          country_name_en?: string;
                          country_name_es?: string | null;
                        };
                        if (data.ok && data.city_name_en && data.city_slug) {
                          setSelectedCity({
                            id: null,
                            slug: data.city_slug,
                            name_en: data.city_name_en,
                            name_es: data.city_name_es ?? null,
                            lat: data.lat ?? null,
                            lng: data.lng ?? null,
                            country_iso2: (data.country_iso2 ?? selectedCountry.iso2).toUpperCase(),
                            country_name_en: data.country_name_en ?? selectedCountry.name_en,
                            country_name_es: data.country_name_es ?? selectedCountry.name_es ?? null,
                          });
                          setCityInput(data.city_name_en);
                          return;
                        }
                      } catch {
                        /* use prediction row */
                      }
                    }
                    setSelectedCity(city);
                    setCityInput(city.name_en);
                  }}
                />
              </div>
            ) : null}
          </div>
          {selectedCity ? (
            <p className="text-xs text-muted-foreground">
              Canonical match: {selectedCity.name_en}, {selectedCity.country_name_en}
            </p>
          ) : null}
        </div>
      </div>

      {helperText ? <p className="text-xs text-muted-foreground">{helperText}</p> : null}

      <input type="hidden" name={`${prefix}_country_id`} value={selectedCountry?.id ?? ""} />
      <input type="hidden" name={`${prefix}_country_iso2`} value={selectedCountry?.iso2 ?? ""} />
      <input type="hidden" name={`${prefix}_country_name_en`} value={selectedCountry?.name_en ?? ""} />
      <input type="hidden" name={`${prefix}_country_name_es`} value={selectedCountry?.name_es ?? ""} />

      <input type="hidden" name={`${prefix}_city_id`} value={selectedCity?.id ?? ""} />
      <input type="hidden" name={`${prefix}_city_slug`} value={selectedCity?.slug ?? ""} />
      <input type="hidden" name={`${prefix}_city_name_en`} value={selectedCity?.name_en ?? ""} />
      <input type="hidden" name={`${prefix}_city_name_es`} value={selectedCity?.name_es ?? ""} />
      <input type="hidden" name={`${prefix}_city_lat`} value={selectedCity?.lat ?? ""} />
      <input type="hidden" name={`${prefix}_city_lng`} value={selectedCity?.lng ?? ""} />
    </>
  );

  if (noCard) {
    return (
      <div className="space-y-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          {title}
          {required ? <span className="text-destructive"> *</span> : null}
        </p>
        {inner}
      </div>
    );
  }

  return (
    <fieldset className="space-y-3 rounded-2xl border border-border/40 bg-card/50 p-4 shadow-sm">
      <legend className="px-1 text-sm font-semibold text-foreground">
        {title}
        {required ? " *" : ""}
      </legend>
      {inner}
    </fieldset>
  );
}
