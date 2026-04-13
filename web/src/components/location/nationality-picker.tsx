"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CountrySuggestion } from "@/lib/location-autocomplete";

const DEBOUNCE_MS = 280;

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

type Props = {
  /** Initial nationality value (country name_en, e.g. "Spain") */
  initialValue?: string | null;
  required?: boolean;
  label?: string;
  /** Called when a country is committed so parent can track dirty state */
  onValueChange?: (name_en: string) => void;
};

export function NationalityPicker({
  initialValue,
  required = false,
  label = "Nationality",
  onValueChange,
}: Props) {
  const [input, setInput] = useState(initialValue ?? "");
  const [selected, setSelected] = useState<CountrySuggestion | null>(null);
  const [options, setOptions] = useState<CountrySuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const debouncedInput = useDebouncedValue(input, DEBOUNCE_MS);
  const queryPending = input !== debouncedInput;

  // Fetch country suggestions
  useEffect(() => {
    let ignore = false;
    setLoading(true);
    fetch(`/api/location-countries?query=${encodeURIComponent(debouncedInput)}`, {
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((data: { countries?: CountrySuggestion[] }) => {
        if (!ignore) setOptions(Array.isArray(data.countries) ? data.countries : []);
      })
      .catch(() => {
        if (!ignore) setOptions([]);
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [debouncedInput]);

  // Resolve Google place_id → actual country name on selection
  async function handleSelect(country: CountrySuggestion) {
    setOpen(false);

    if (country.google_place_id) {
      try {
        const res = await fetch(
          `/api/location-country-details?placeId=${encodeURIComponent(country.google_place_id)}`,
          { cache: "no-store" },
        );
        const data = (await res.json()) as {
          ok?: boolean;
          iso2?: string;
          name_en?: string;
          name_es?: string | null;
        };
        if (data.ok && data.iso2 && data.name_en) {
          const resolved: CountrySuggestion = {
            id: country.id ?? null,
            iso2: data.iso2.toUpperCase(),
            name_en: data.name_en,
            name_es: data.name_es ?? null,
          };
          setSelected(resolved);
          setInput(data.name_en);
          onValueChange?.(data.name_en);
          return;
        }
      } catch {
        /* fall through to direct select */
      }
      // If Place Details failed but country has no ISO2, don't commit
      if (!country.iso2) return;
    }

    setSelected(country);
    setInput(country.name_en);
    onValueChange?.(country.name_en);
  }

  // The hidden input stores the selected name_en as the form value
  const committedValue = selected?.name_en ?? (
    // If user typed and it matches exactly an option by name, accept it
    options.find(
      (o) => o.name_en.toLowerCase() === input.toLowerCase() && o.iso2,
    )?.name_en ?? ""
  );

  return (
    <div className="space-y-2">
      <Label htmlFor="nationality_input">
        {label}
        {required ? <span className="text-destructive"> *</span> : null}
      </Label>
      <p className="text-xs text-muted-foreground">
        Select the country you hold citizenship in.
      </p>

      <div className="relative">
        <Input
          id="nationality_input"
          value={input}
          autoComplete="off"
          placeholder="Search country…"
          required={required}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onChange={(e) => {
            const next = e.target.value;
            setInput(next);
            setOpen(true);
            if (!selected || next !== selected.name_en) {
              setSelected(null);
            }
          }}
        />

        {open ? (
          <div className="absolute left-0 right-0 top-[calc(100%+0.35rem)] z-40 max-h-56 overflow-y-auto rounded-md border border-border/60 bg-card shadow-lg">
            {options.length === 0 ? (
              <p className="px-3 py-2 text-sm text-muted-foreground">
                {loading || queryPending ? "Searching…" : "No countries found."}
              </p>
            ) : (
              options.map((c, i) => (
                <button
                  key={`${c.google_place_id ?? c.iso2 ?? c.name_en}-${i}`}
                  type="button"
                  className="flex w-full flex-col items-start gap-0.5 border-b border-border/30 px-3 py-2 text-left text-sm last:border-b-0 hover:bg-accent"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleSelect(c)}
                >
                  <span className="font-medium text-foreground">{c.name_en}</span>
                  {c.iso2 ? (
                    <span className="text-xs text-muted-foreground">{c.iso2}</span>
                  ) : null}
                </button>
              ))
            )}
          </div>
        ) : null}
      </div>

      {selected ? (
        <p className="text-xs text-muted-foreground">
          Selected: {selected.name_en} ({selected.iso2})
        </p>
      ) : null}

      {/* Hidden input carries the committed value into the form */}
      <input type="hidden" name="nationality" value={committedValue} />
    </div>
  );
}
