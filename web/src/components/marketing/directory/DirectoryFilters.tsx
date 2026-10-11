"use client";

import { useState } from "react";
import {
  FOCUS_RING,
  orderedTrustFacets,
  smartTitleCase,
  cityFacetKey,
  parseCityFacetKey,
  type DirectoryActiveFilters,
  type DirectoryFacets,
} from "./shared";
import { directoryCopy, type DirectoryCopy } from "./directory-copy";

const COLLAPSE_AT = 8;

/**
 * Filter rails for the directory: country / city / availability / trust tier.
 * Used both as the sticky desktop sidebar and as the body of the mobile sheet
 * (same component, `variant` only tweaks chrome). Talent type lives in the top
 * bar; primary search lives in the toolbar — neither is duplicated here.
 */
export function DirectoryFilters({
  facets,
  active,
  variant = "rail",
  onCountry,
  onCity,
  onAvailableOnly,
  onTrust,
  onClearAll,
  locale,
}: {
  facets: DirectoryFacets;
  active: DirectoryActiveFilters;
  variant?: "rail" | "sheet";
  onCountry: (value: string | null) => void;
  onCity: (city: string | null, country: string | null) => void;
  onAvailableOnly: (value: boolean) => void;
  onTrust: (value: string | null) => void;
  onClearAll: () => void;
  locale: string;
}) {
  const c = directoryCopy(locale);
  const trustFacets = orderedTrustFacets(facets.trustTiers, locale);
  const cities = active.country
    ? facets.cities.filter((row) => row.country === active.country)
    : facets.cities;
  // When the same city name spans countries in the visible set (no country
  // filter narrowing it), append the country to disambiguate the two rows.
  const cityNameCounts = new Map<string, number>();
  for (const row of cities) {
    const k = row.city.toLowerCase();
    cityNameCounts.set(k, (cityNameCounts.get(k) ?? 0) + 1);
  }

  const anyActive =
    !!active.country || !!active.city || !!active.trustTier || active.availableOnly;
  // The mobile sheet already carries its own "Filters" header, so the rail is
  // the only variant that renders the label here (avoids a duplicate heading).
  const showHeading = variant === "rail";

  return (
    <div className="flex flex-col gap-7">
      {showHeading || anyActive ? (
        <div className={`flex items-center ${showHeading ? "justify-between" : "justify-end"}`}>
          {showHeading ? (
            <span
              className="plt-mono text-[0.6875rem] uppercase tracking-[0.22em]"
              style={{ color: "var(--plt-muted)" }}
            >
              {c.filters}
            </span>
          ) : null}
          {anyActive ? (
            <button
              type="button"
              onClick={onClearAll}
              className={`rounded text-[0.75rem] font-medium transition-colors hover:underline ${FOCUS_RING}`}
              style={{ color: "var(--plt-forest)" }}
            >
              {c.clearAll}
            </button>
          ) : null}
        </div>
      ) : null}

      <FilterSection title={c.availability}>
        <ToggleRow
          label={c.openNext30}
          checked={active.availableOnly}
          onClick={() => onAvailableOnly(!active.availableOnly)}
        />
      </FilterSection>

      {facets.countries.length > 0 ? (
        <FilterSection title={c.country}>
          <FacetList
            copy={c}
            items={facets.countries.map((row) => ({
              value: row.value,
              label: smartTitleCase(row.value),
              count: row.count,
            }))}
            activeValue={active.country}
            onToggle={(v) => onCountry(active.country === v ? null : v)}
          />
        </FilterSection>
      ) : null}

      {cities.length > 0 ? (
        <FilterSection title={active.country ? c.citiesIn(smartTitleCase(active.country)) : c.city}>
          <FacetList
            copy={c}
            items={cities.map((row) => {
              const ambiguous = (cityNameCounts.get(row.city.toLowerCase()) ?? 0) > 1;
              const label =
                ambiguous && row.country
                  ? `${smartTitleCase(row.city)}, ${smartTitleCase(row.country)}`
                  : smartTitleCase(row.city);
              return { value: cityFacetKey(row.city, row.country), label, count: row.count };
            })}
            activeValue={active.city ? cityFacetKey(active.city, active.country) : null}
            onToggle={(v) => {
              if (active.city && cityFacetKey(active.city, active.country) === v) {
                // Drill *up*: clear the city but keep the country, so an
                // explicitly-chosen country survives deselecting one of its
                // cities (and the grid widens to the whole country, not all).
                onCity(null, active.country);
              } else {
                const { city, country } = parseCityFacetKey(v);
                onCity(city, country);
              }
            }}
          />
        </FilterSection>
      ) : null}

      {trustFacets.length > 0 ? (
        <FilterSection title={c.verification}>
          <div className="flex flex-col gap-1">
            {trustFacets.map((t) => (
              <ToggleRow
                key={t.value}
                label={t.label}
                count={t.count}
                checked={active.trustTier === t.value}
                onClick={() => onTrust(active.trustTier === t.value ? null : t.value)}
              />
            ))}
          </div>
        </FilterSection>
      ) : null}
    </div>
  );
}

function FilterSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2.5">
      <h4
        className="text-[0.8125rem] font-semibold tracking-[-0.005em]"
        style={{ color: "var(--plt-ink)" }}
      >
        {title}
      </h4>
      {children}
    </div>
  );
}

function FacetList({
  copy,
  items,
  activeValue,
  onToggle,
}: {
  copy: DirectoryCopy;
  items: Array<{ value: string; label: string; count: number }>;
  activeValue: string | null;
  onToggle: (value: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? items : items.slice(0, COLLAPSE_AT);
  // Always show the active value even if it would be hidden below the fold.
  const hiddenActive =
    !expanded && activeValue && !visible.some((i) => i.value === activeValue)
      ? items.find((i) => i.value === activeValue)
      : null;

  return (
    <div className="flex flex-col gap-1">
      {visible.map((i) => (
        <ToggleRow
          key={i.value}
          label={i.label}
          count={i.count}
          checked={activeValue === i.value}
          onClick={() => onToggle(i.value)}
        />
      ))}
      {hiddenActive ? (
        <ToggleRow
          key={hiddenActive.value}
          label={hiddenActive.label}
          count={hiddenActive.count}
          checked
          onClick={() => onToggle(hiddenActive.value)}
        />
      ) : null}
      {items.length > COLLAPSE_AT ? (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className={`mt-1 self-start rounded text-[0.75rem] font-medium transition-colors hover:underline ${FOCUS_RING}`}
          style={{ color: "var(--plt-forest)" }}
        >
          {expanded ? copy.showLess : copy.showAll(items.length)}
        </button>
      ) : null}
    </div>
  );
}

function ToggleRow({
  label,
  count,
  checked,
  onClick,
}: {
  label: string;
  count?: number;
  checked: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={checked}
      className={`flex w-full items-center justify-between gap-3 rounded-[11px] px-2.5 py-2 text-left text-[0.8125rem] transition-colors ${FOCUS_RING}`}
      style={{
        background: checked ? "color-mix(in srgb, var(--plt-forest) 8%, var(--plt-bg-raised))" : "transparent",
        color: checked ? "var(--plt-forest-deep)" : "var(--plt-ink-soft)",
      }}
    >
      <span className="flex min-w-0 items-center gap-2">
        <span
          aria-hidden
          className="flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] transition-colors"
          style={{
            border: `1.5px solid ${checked ? "var(--plt-forest)" : "var(--plt-hairline-strong)"}`,
            background: checked ? "var(--plt-forest)" : "transparent",
          }}
        >
          {checked ? (
            <svg width="9" height="9" viewBox="0 0 12 12" fill="none" aria-hidden>
              <path
                d="M2.5 6.5L5 9L9.5 3.5"
                stroke="var(--plt-forest-on)"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ) : null}
        </span>
        <span className="truncate">{label}</span>
      </span>
      {typeof count === "number" ? (
        <span className="shrink-0 text-[0.6875rem]" style={{ color: "var(--plt-muted-soft)" }}>
          {count}
        </span>
      ) : null}
    </button>
  );
}
