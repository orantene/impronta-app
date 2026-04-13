"use client";

import { Loader2, MapPin, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ADMIN_FORM_CONTROL } from "@/lib/dashboard-shell-classes";
import { cn } from "@/lib/utils";

export type ClientLocationPlaceDetails = {
  placeId: string;
  displayName: string;
  formattedAddress: string;
  city: string | null;
  country: string | null;
  phone: string | null;
  website: string | null;
  lat: number | null;
  lng: number | null;
};

type Prediction = {
  placeId: string;
  mainText: string;
  secondaryText: string;
  description: string;
};

export function ClientLocationPlacesSearch({
  onApply,
  appliedPlaceId,
  onClearApplied,
}: {
  onApply: (details: ClientLocationPlaceDetails) => void;
  appliedPlaceId: string;
  onClearApplied: () => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [configured, setConfigured] = useState(true);
  const wrapRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setPredictions([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/places-client-location?q=${encodeURIComponent(q.trim())}`, {
        credentials: "same-origin",
      });
      const data = (await res.json()) as {
        predictions?: Prediction[];
        configured?: boolean;
      };
      setConfigured(data.configured !== false);
      setPredictions(Array.isArray(data.predictions) ? data.predictions : []);
    } catch {
      setPredictions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (query.trim().length < 2) {
      setPredictions([]);
      return;
    }
    timerRef.current = setTimeout(() => {
      void runSearch(query);
    }, 280);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [query, runSearch]);

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, []);

  async function pickPrediction(placeId: string) {
    setLoadingDetails(true);
    setOpen(false);
    try {
      const res = await fetch(
        `/api/admin/places-client-location-details?placeId=${encodeURIComponent(placeId)}`,
        { credentials: "same-origin" },
      );
      const data = (await res.json()) as {
        details: {
          placeId: string;
          displayName: string;
          formattedAddress: string;
          city: string | null;
          country: string | null;
          phone: string | null;
          website: string | null;
          lat: number | null;
          lng: number | null;
        } | null;
      };
      const d = data.details;
      if (d) {
        onApply({
          placeId: d.placeId,
          displayName: d.displayName,
          formattedAddress: d.formattedAddress,
          city: d.city,
          country: d.country,
          phone: d.phone,
          website: d.website,
          lat: d.lat,
          lng: d.lng,
        });
        setQuery("");
        setPredictions([]);
      }
    } finally {
      setLoadingDetails(false);
    }
  }

  return (
    <div ref={wrapRef} className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label htmlFor="client_location_places_search" className="inline-flex items-center gap-2">
          <MapPin className="size-4 text-[var(--impronta-gold)]" aria-hidden />
          Search business or address
        </Label>
        {appliedPlaceId ? (
          <button
            type="button"
            onClick={() => {
              onClearApplied();
              setQuery("");
            }}
            className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            <X className="size-3.5" aria-hidden />
            Clear Google match
          </button>
        ) : null}
      </div>
      <div className="relative">
        <Input
          id="client_location_places_search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Start typing a venue, business, or address…"
          autoComplete="off"
          className={cn(ADMIN_FORM_CONTROL, "pr-10")}
          disabled={loadingDetails}
        />
        {loading || loadingDetails ? (
          <Loader2
            className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground"
            aria-hidden
          />
        ) : null}
        {open && predictions.length > 0 ? (
          <ul
            className="absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded-md border border-border/60 bg-popover py-1 text-sm shadow-lg"
            role="listbox"
          >
            {predictions.map((p) => (
              <li key={p.placeId} role="option">
                <button
                  type="button"
                  className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left hover:bg-muted/50"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => void pickPrediction(p.placeId)}
                >
                  <span className="font-medium text-foreground">{p.mainText}</span>
                  {p.secondaryText ? (
                    <span className="text-xs text-muted-foreground">{p.secondaryText}</span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {!configured ? (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          Google Places is not configured (set <code className="rounded bg-muted px-1">GOOGLE_PLACES_API_KEY</code> on
          the server). You can still enter everything manually below.
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Optional: pick a result to prefill fields. If nothing matches, enter the location manually — no Google result
          required.
        </p>
      )}
    </div>
  );
}
