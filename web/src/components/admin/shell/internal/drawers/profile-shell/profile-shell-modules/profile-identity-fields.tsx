// Phase-1f decomp — accordion / collapsible identity-card / country +
// city autocompletes / upcoming-visits editor / service-area mini-map.
// Read-mostly surfaces that the identity editor + location block both
// compose.  Byte-for-byte.
"use client";
import React, { type ReactNode } from "react";
import {
  COLORS,
  DrawerSectionId,
  FONTS,
  SHARED_FIELD_INPUT_STYLE,
  TaxonomyParentId,
  sectionAppliesToType,
  useDashboardText,
} from "../../drawer-shared";


// Click-to-open field card for the bespoke Identity section — visually
// 1:1 with the engine's Details CollapsibleField (cool border + lift
// shadow + surfaceAlt hover + chevron). Wraps an existing
// `<FieldRow hideLabel>` so visibility chips / hints / locks keep
// working; the card header owns the label + collapsed value summary.

export function CollapsibleIdentityField({
  label, summary, filled, children, defaultOpen,
}: {
  label: string;
  summary: React.ReactNode;
  filled: boolean;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const copy = useDashboardText();
  const [open, setOpen] = React.useState(!!defaultOpen);
  const [hover, setHover] = React.useState(false);
  const restBg = "#fff";
  return (
    <div
      style={{
        border: `1px solid ${COLORS.border}`,
        borderRadius: 9,
        background: restBg,
        fontFamily: FONTS.body,
        minWidth: 0,
        boxShadow: "0 1px 2px rgba(11,11,13,0.05)",
      }}
      onKeyDown={open ? (e) => { if (e.key === "Escape") setOpen(false); } : undefined}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onFocus={() => setHover(true)}
        onBlur={() => setHover(false)}
        style={{
          width: "100%", display: "flex", flexDirection: "row",
          alignItems: "center", gap: 10,
          padding: "10px 12px", cursor: "pointer", textAlign: "left",
          fontFamily: FONTS.body, border: "none",
          background: open || hover ? COLORS.surfaceAlt : restBg,
          borderRadius: 9,
          borderBottomLeftRadius: open ? 0 : 9,
          borderBottomRightRadius: open ? 0 : 9,
          borderBottom: open ? `1px solid ${COLORS.borderSoft}` : "none",
          transition: "background 120ms ease",
        }}
      >
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
          <span style={{ fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} className="text-admin-ink">
            {label}
          </span>
          {!open && (
            <span style={{
              fontSize: 12, fontWeight: filled ? 500 : 700,
              color: filled ? COLORS.inkMuted : COLORS.accent,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              letterSpacing: 0.1,
            }}>
              {filled ? summary : <>+ {summary}</>}
            </span>
          )}
        </div>
        <div style={{
          flexShrink: 0, display: "flex", alignItems: "center", gap: 5,
          color: open || hover ? COLORS.accent : COLORS.inkDim,
          transition: "color 120ms ease",
        }}>
          {!open && hover && (
            <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.3 }}>{copy.t("Edit")}</span>
          )}
          <span style={{ fontSize: 16, lineHeight: 1, fontWeight: 600 }}>
            {open ? "⌄" : "›"}
          </span>
        </div>
      </button>
      {open && <div style={{ padding: "10px 12px 12px" }}>{children}</div>}
    </div>
  );
}


export function ProfileAccordionSection({ id, title, sub, complete, started, open, onToggle, accent, children, primaryType }: {
  id: string;
  title: string;
  sub?: string;
  complete: boolean;
  /** Optional 3rd state: section has SOME data but not enough to be
   *  considered complete. When omitted, the indicator is binary
   *  (empty circle vs green check). */
  started?: boolean;
  open: boolean;
  onToggle: () => void;
  accent?: "amber";
  children: ReactNode;
  /** When set, the section consults the field catalog to decide
   *  whether to render at all. Accepts a single type id, an array
   *  of role ids (primary + secondaries), or null. Sections that
   *  aren't catalog-mapped render unchanged regardless. */
  primaryType?: string | ReadonlyArray<string> | null;
}) {
  // Catalog-driven gating. Cast is safe — DrawerSectionId is a closed
  // union of string literals; passing an arbitrary id falls through
  // to "always-on" via sectionAppliesToType's unmapped branch.
  if (primaryType !== undefined) {
    const arg = (primaryType ?? null) as TaxonomyParentId | ReadonlyArray<TaxonomyParentId> | null;
    const applies = sectionAppliesToType(id as DrawerSectionId, arg);
    if (!applies) return null;
  }
  // Single-section pattern: with the rail handling navigation, only the
  // active section renders in the body. Closed sections return null —
  // the rail row already names the section, so an in-body header is
  // redundant and adds vertical noise.
  if (!open) return null;
  return (
    <section id={`pshell-${id}`} style={{
      // White card on the COLORS.surface page — matched 1:1 to the New
      // Inquiry ComposerSection (soft hairline + radius 10).
      background: "#FFFFFF",
      border: `1px solid ${COLORS.borderSoft}`,
      borderRadius: 10,
      minHeight: "100%",
      boxSizing: "border-box",
    }}>
      {/* Compact section title row. Matches New Inquiry ComposerSection:
          13.5/700 ink title, 11.5 muted description. */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "16px 16px 6px", textAlign: "left",
        fontFamily: FONTS.body,
      }}>
        <div className="flex-1 min-w-0">
          <div style={{ fontSize: 13.5, fontWeight: 700, color: accent === "amber" ? COLORS.amberDeep : COLORS.ink, letterSpacing: -0.05 }}>{title}</div>
          {sub && <div style={{ fontSize: 11.5, marginTop: 2, lineHeight: 1.5 }} className="text-admin-ink-muted">{sub}</div>}
        </div>
      </div>
      {(
        <div style={{ padding: "0 16px 16px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
          {children}
        </div>
      )}
    </section>
  );
}

// ─── CountryAutocompleteInput ──────────────────────────────────────────────────
// Uses the existing /api/location-countries endpoint (Supabase + Google fallback).
// Stores the country name_en as the value (ISO2 shown in dropdown for context).


export type CountrySuggestion = {
  id?: string | null;
  iso2?: string | null;
  name_en: string;
  google_place_id?: string | null;
};


export function CountryAutocompleteInput({
  value, placeholder, onChange,
}: {
  value: string;
  placeholder?: string;
  onChange: (nameEn: string, iso2?: string) => void;
}) {
  const copy = useDashboardText();
  const [draft, setDraft] = React.useState(value);
  const [suggestions, setSuggestions] = React.useState<CountrySuggestion[]>([]);
  const [open, setOpen] = React.useState(false);
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => { setDraft(value); }, [value]);

  React.useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleChange = (text: string) => {
    setDraft(text);
    onChange(text, undefined);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (text.trim().length < 1) { setSuggestions([]); setOpen(false); return; }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/location-countries?query=${encodeURIComponent(text.trim())}`);
        if (!res.ok) return;
        const data = (await res.json()) as { countries?: CountrySuggestion[] };
        setSuggestions(data.countries ?? []);
        setOpen((data.countries ?? []).length > 0);
      } catch { /* ignore */ }
    }, 280);
  };

  const handleSelect = async (c: CountrySuggestion) => {
    let nameEn = c.name_en;
    let iso2 = c.iso2 ?? undefined;
    if (c.google_place_id && !iso2) {
      try {
        const res = await fetch(`/api/location-country-details?placeId=${encodeURIComponent(c.google_place_id)}`);
        const data = (await res.json()) as { ok?: boolean; iso2?: string; name_en?: string };
        if (data.ok && data.name_en) { nameEn = data.name_en; iso2 = data.iso2; }
      } catch { /* ignore */ }
    }
    setDraft(nameEn);
    onChange(nameEn, iso2);
    setSuggestions([]);
    setOpen(false);
  };

  return (
    <div ref={containerRef} style={{ position: "relative", width: "100%" }}>
      <input
        placeholder={placeholder ?? copy.t("Search country…")}
        value={draft}
        autoComplete="off"
        onChange={(e) => handleChange(e.target.value)}
        onFocus={() => { if (suggestions.length > 0) setOpen(true); }}
        style={SHARED_FIELD_INPUT_STYLE}
      />
      {open && suggestions.length > 0 && (
        <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 999, border: `1px solid ${COLORS.border}`, borderRadius: 10, boxShadow: "0 4px 16px rgba(0,0,0,0.10)", overflow: "hidden" }} className="bg-admin-surface">
          {suggestions.map((c, i) => (
            <button key={`${c.google_place_id ?? c.iso2 ?? c.name_en}-${i}`}
              onMouseDown={(e) => { e.preventDefault(); void handleSelect(c); }}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                width: "100%", textAlign: "left",
                padding: "9px 12px", background: "none", border: "none", cursor: "pointer",
                fontFamily: FONTS.body, borderBottom: `1px solid ${COLORS.borderSoft}`,
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 500, flex: 1 }} className="text-admin-ink">{c.name_en}</span>
              {c.iso2 && (
                <span className="text-admin-ink-muted text-admin-11 font-semibold">{c.iso2}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── CityAutocompleteInput ─────────────────────────────────────────────────────
// Google Places autocomplete for a single city. Debounces 300ms, calls
// /api/admin/places-city-global, shows dropdown. Falls back to plain text if
// Places not configured (configured=false).


export type CityPrediction = { placeId: string; mainText: string; secondaryText: string };


export function CityAutocompleteInput({
  value, placeId: _placeId, placeholder, onChange,
}: {
  value: string;
  placeId?: string;
  placeholder?: string;
  onChange: (city: string, placeId?: string) => void;
}) {
  const copy = useDashboardText();
  const [draft, setDraft] = React.useState(value);
  const [predictions, setPredictions] = React.useState<CityPrediction[]>([]);
  const [open, setOpen] = React.useState(false);
  const [configured, setConfigured] = React.useState(true);
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);

  // Keep draft in sync when external value changes (e.g. load from server)
  React.useEffect(() => { setDraft(value); }, [value]);

  // Close on outside click
  React.useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleChange = (text: string) => {
    setDraft(text);
    onChange(text, undefined); // clear placeId while typing
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (text.trim().length < 2) { setPredictions([]); setOpen(false); return; }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/places-city-global?q=${encodeURIComponent(text.trim())}`);
        if (!res.ok) return;
        const data = (await res.json()) as { predictions: CityPrediction[]; configured?: boolean };
        setConfigured(data.configured !== false);
        setPredictions(data.predictions ?? []);
        setOpen((data.predictions ?? []).length > 0);
      } catch { /* network error — silently ignore */ }
    }, 300);
  };

  const handleSelect = (p: CityPrediction) => {
    const label = p.secondaryText ? `${p.mainText}, ${p.secondaryText}` : p.mainText;
    setDraft(label);
    onChange(label, p.placeId);
    setPredictions([]);
    setOpen(false);
  };

  return (
    <div ref={containerRef} style={{ position: "relative", width: "100%" }}>
      <input
        data-pshell-field="homeBase"
        placeholder={placeholder ?? copy.t("e.g. Playa del Carmen")}
        value={draft}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={() => { if (predictions.length > 0) setOpen(true); }}
        style={SHARED_FIELD_INPUT_STYLE}
      />
      {!configured && (
        <div style={{ fontSize: 11, marginTop: 4 }} className="text-admin-ink-muted">
          {copy.t("Google Places is not configured. Type any city name.")}
        </div>
      )}
      {open && predictions.length > 0 && (
        <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 999, border: `1px solid ${COLORS.border}`, borderRadius: 10, boxShadow: "0 4px 16px rgba(0,0,0,0.10)", overflow: "hidden" }} className="bg-admin-surface">
          {predictions.map((p) => (
            <button key={p.placeId}
              onMouseDown={(e) => { e.preventDefault(); handleSelect(p); }}
              style={{
                display: "block", width: "100%", textAlign: "left",
                padding: "9px 12px", background: "none", border: "none", cursor: "pointer",
                fontFamily: FONTS.body, borderBottom: `1px solid ${COLORS.borderSoft}`,
              }}
            >
              <span className="text-admin-ink text-admin-13 font-medium">{p.mainText}</span>
              {p.secondaryText && (
                <span style={{ fontSize: 11.5, marginLeft: 6 }} className="text-admin-ink-muted">{p.secondaryText}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── UpcomingVisitsEditor ──────────────────────────────────────────────────────
// List of city + optional date entries for upcoming travel.


export type VisitEntry = { id: string; city: string; placeId?: string; date?: string; dateEnd?: string };


export function UpcomingVisitsEditor({
  visits, onChange,
}: {
  visits: VisitEntry[];
  onChange: (visits: VisitEntry[]) => void;
}) {
  const copy = useDashboardText();
  const add = () => {
    onChange([...visits, { id: crypto.randomUUID(), city: "", date: "" }]);
  };
  const remove = (id: string) => onChange(visits.filter((v) => v.id !== id));
  const update = (id: string, patch: Partial<VisitEntry>) =>
    onChange(visits.map((v) => (v.id === id ? { ...v, ...patch } : v)));

  return (
    <div className="flex flex-col gap-2">
      {visits.map((v) => (
        <div key={v.id} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
          <div className="flex-1">
            <CityAutocompleteInput
              value={v.city}
              placeId={v.placeId}
              placeholder={copy.t("City or destination…")}
              onChange={(city, pid) => update(v.id, { city, placeId: pid })}
            />
          </div>
          <input
            type="date"
            value={v.date ?? ""}
            onChange={(e) => update(v.id, { date: e.target.value || undefined })}
            title={copy.t("Start date (optional)")}
            style={{
              padding: "9px 10px", borderRadius: 10, border: `1px solid ${COLORS.border}`,
              fontFamily: FONTS.body, fontSize: 12, color: COLORS.ink, outline: "none",
              width: 130, flexShrink: 0,
            }}
          />
          <button
            onClick={() => remove(v.id)}
            title={copy.t("Remove")}
            style={{
              padding: "9px 10px", borderRadius: 10, border: `1px solid ${COLORS.borderSoft}`,
              background: "none", cursor: "pointer", color: COLORS.inkMuted,
              fontFamily: FONTS.body, fontSize: 13, flexShrink: 0,
            }}
          >×</button>
        </div>
      ))}
      <button
        onClick={add}
        style={{
          alignSelf: "flex-start", padding: "7px 14px", borderRadius: 999,
          border: `1px dashed ${COLORS.border}`, background: "none",
          cursor: "pointer", fontFamily: FONTS.body, fontSize: 12,
          color: COLORS.inkMuted, display: "flex", alignItems: "center", gap: 6,
        }}
      >
        <span style={{ fontSize: 16, lineHeight: 1 }}>+</span> {copy.t("Add destination")}
      </button>
    </div>
  );
}


export function ServiceAreaMap({ homeBase, travelKm, cities }: {
  homeBase: string; travelKm: number; cities: string[];
}) {
  const copy = useDashboardText();
  const radius = Math.max(20, Math.min(70, travelKm / 12));
  return (
    <div style={{ position: "relative", height: 130, borderRadius: 10, border: `1px solid ${COLORS.borderSoft}`, overflow: "hidden" }} className="bg-admin-surface">
      <svg width="100%" height="100%" viewBox="0 0 280 130" preserveAspectRatio="none" style={{ position: "absolute", inset: 0 }}>
        <defs>
          <pattern id="psgrid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M20 0 L0 0 0 20" fill="none" stroke="rgba(11,11,13,0.05)" strokeWidth="0.5"/>
          </pattern>
        </defs>
        <rect width="280" height="130" fill="url(#psgrid)" />
        <circle cx="140" cy="65" r={radius} fill="rgba(15,79,62,0.10)" stroke="rgba(15,79,62,0.4)" strokeWidth="1" strokeDasharray="3 2"/>
        <circle cx="140" cy="65" r="5" fill={COLORS.accent}/>
        <circle cx="140" cy="65" r="2.5" fill="#fff"/>
        {cities.slice(0, 4).map((c, i) => {
          const angle = (i / 4) * Math.PI * 2 + 0.4;
          const cx = 140 + Math.cos(angle) * (radius * 0.85);
          const cy = 65 + Math.sin(angle) * (radius * 0.85);
          return <circle key={c} cx={cx} cy={cy} r="3" fill={COLORS.indigoDeep}/>;
        })}
      </svg>
      <div style={{ position: "absolute", bottom: 8, left: 10, right: 10, display: "flex", justifyContent: "space-between", fontSize: 10, fontWeight: 500, fontFamily: FONTS.body }} className="text-admin-ink-muted">
        <span>📍 {homeBase || copy.t("Set home base")}</span>
        <span>{travelKm === 999 ? copy.t("Anywhere") : `${travelKm} km`}</span>
      </div>
    </div>
  );
}
