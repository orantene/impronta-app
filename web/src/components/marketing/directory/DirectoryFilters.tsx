"use client";

import { useState } from "react";
import {
  orderedTrustFacets,
  type DirectoryActiveFilters,
  type DirectoryFacets,
} from "./shared";

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
  onCountry,
  onCity,
  onAvailableOnly,
  onTrust,
  onClearAll,
}: {
  facets: DirectoryFacets;
  active: DirectoryActiveFilters;
  onCountry: (value: string | null) => void;
  onCity: (value: string | null) => void;
  onAvailableOnly: (value: boolean) => void;
  onTrust: (value: string | null) => void;
  onClearAll: () => void;
}) {
  const trustFacets = orderedTrustFacets(facets.trustTiers);
  const cities = active.country
    ? facets.cities.filter((c) => c.country === active.country)
    : facets.cities;

  const anyActive =
    !!active.country || !!active.city || !!active.trustTier || active.availableOnly;

  return (
    <div className="flex flex-col gap-7">
      <div className="flex items-center justify-between">
        <span
          className="plt-mono text-[0.6875rem] uppercase tracking-[0.22em]"
          style={{ color: "var(--plt-muted)" }}
        >
          Filters
        </span>
        {anyActive ? (
          <button
            type="button"
            onClick={onClearAll}
            className="text-[0.75rem] font-medium transition-colors hover:underline"
            style={{ color: "var(--plt-forest)" }}
          >
            Clear all
          </button>
        ) : null}
      </div>

      <FilterSection title="Availability">
        <ToggleRow
          label="Open in the next 30 days"
          checked={active.availableOnly}
          onClick={() => onAvailableOnly(!active.availableOnly)}
        />
      </FilterSection>

      {facets.countries.length > 0 ? (
        <FilterSection title="Country">
          <FacetList
            items={facets.countries.map((c) => ({ value: c.value, label: c.value, count: c.count }))}
            activeValue={active.country}
            onToggle={(v) => onCountry(active.country === v ? null : v)}
          />
        </FilterSection>
      ) : null}

      {cities.length > 0 ? (
        <FilterSection title={active.country ? `Cities in ${active.country}` : "City"}>
          <FacetList
            items={cities.map((c) => ({ value: c.value, label: c.value, count: c.count }))}
            activeValue={active.city}
            onToggle={(v) => onCity(active.city === v ? null : v)}
          />
        </FilterSection>
      ) : null}

      {trustFacets.length > 0 ? (
        <FilterSection title="Verification">
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
  items,
  activeValue,
  onToggle,
}: {
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
          className="mt-1 self-start text-[0.75rem] font-medium transition-colors hover:underline"
          style={{ color: "var(--plt-forest)" }}
        >
          {expanded ? "Show less" : `Show all ${items.length}`}
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
      className="flex w-full items-center justify-between gap-3 rounded-[11px] px-2.5 py-2 text-left text-[0.8125rem] transition-colors"
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
