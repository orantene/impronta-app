"use client";

import { useMemo, useState } from "react";

import { ProfessionalCard } from "../_components/ProfessionalCard";
import {
  ALL_DESTINATIONS,
  ALL_EVENT_STYLES,
  ALL_LANGUAGES,
  PROFESSIONALS,
} from "../_data/professionals";
import { SERVICES } from "../_data/services";

/**
 * Directory client-side filter shell.
 *
 * Future systemization:
 *   - Template → `directory-editorial` variant (this one): card grid + chip
 *     filters + optional destination-only toggle.
 *   - Template → `directory-compact` variant: table-first for high-volume
 *     rosters.
 *   - Filters themselves are derived from taxonomy — in production these
 *     come from {services, destinations, languages, event_styles} tables.
 */

const SERVICE_OPTIONS: { slug: string; label: string }[] = [
  { slug: "all", label: "All services" },
  ...SERVICES.map((s) => ({ slug: s.slug, label: s.label })),
];

const DESTINATION_OPTIONS = ["all", ...ALL_DESTINATIONS];
const STYLE_OPTIONS = ["all", ...ALL_EVENT_STYLES];
const LANGUAGE_OPTIONS = ["all", ...ALL_LANGUAGES];

export function DirectoryClient({
  initialService,
  initialDestination,
}: {
  initialService?: string;
  initialDestination?: string;
}) {
  const [service, setService] = useState(initialService ?? "all");
  const [destination, setDestination] = useState(initialDestination ?? "all");
  const [style, setStyle] = useState("all");
  const [language, setLanguage] = useState("all");
  const [destOnly, setDestOnly] = useState(false);

  const filtered = useMemo(() => {
    return PROFESSIONALS.filter((p) => {
      if (service !== "all" && p.serviceSlug !== service) return false;
      if (
        destination !== "all" &&
        !p.destinations.some(
          (d) => d.toLowerCase() === destination.toLowerCase(),
        )
      )
        return false;
      if (style !== "all" && !p.eventStyles.includes(style)) return false;
      if (language !== "all" && !p.languages.includes(language)) return false;
      if (destOnly && !p.travelsGlobally) return false;
      return true;
    });
  }, [service, destination, style, language, destOnly]);

  const activeService = SERVICE_OPTIONS.find((s) => s.slug === service);

  return (
    <>
      <section style={{ padding: "40px 0" }}>
        <div className="muse-shell">
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 20,
              paddingBottom: 32,
              borderBottom: "1px solid var(--muse-line-soft)",
            }}
          >
            <div
              style={{
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              {SERVICE_OPTIONS.map((opt) => (
                <button
                  key={opt.slug}
                  type="button"
                  className="muse-chip"
                  data-active={opt.slug === service || undefined}
                  onClick={() => setService(opt.slug)}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <div
              style={{
                display: "grid",
                gap: 12,
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                alignItems: "center",
              }}
            >
              <Select
                label="Destination"
                value={destination}
                onChange={setDestination}
                options={DESTINATION_OPTIONS.map((d) => ({
                  value: d,
                  label: d === "all" ? "All destinations" : d,
                }))}
              />
              <Select
                label="Event style"
                value={style}
                onChange={setStyle}
                options={STYLE_OPTIONS.map((s) => ({
                  value: s,
                  label: s === "all" ? "All styles" : s,
                }))}
              />
              <Select
                label="Language"
                value={language}
                onChange={setLanguage}
                options={LANGUAGE_OPTIONS.map((l) => ({
                  value: l,
                  label: l === "all" ? "Any language" : l,
                }))}
              />
              <label
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 12,
                  fontSize: 13,
                  padding: "12px 16px",
                  border: "1px solid var(--muse-line)",
                  borderRadius: "var(--muse-radius-pill)",
                  background: destOnly ? "var(--muse-espresso)" : "transparent",
                  color: destOnly ? "var(--muse-ivory)" : "var(--muse-espresso)",
                  cursor: "pointer",
                  justifyContent: "space-between",
                  transition: "all 220ms var(--muse-ease-soft)",
                }}
              >
                <span style={{ letterSpacing: "0.08em", textTransform: "uppercase", fontSize: 11 }}>
                  Destination-ready only
                </span>
                <input
                  type="checkbox"
                  checked={destOnly}
                  onChange={(e) => setDestOnly(e.target.checked)}
                  style={{ accentColor: "var(--muse-blush)" }}
                />
              </label>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "22px 0 34px",
              fontSize: 13,
              color: "var(--muse-muted)",
              letterSpacing: "0.06em",
            }}
          >
            <span>
              Showing <strong style={{ color: "var(--muse-espresso)" }}>{filtered.length}</strong>{" "}
              {filtered.length === 1 ? "professional" : "professionals"}
              {service !== "all" && activeService
                ? ` · ${activeService.label}`
                : ""}
              {destination !== "all" ? ` · ${destination}` : ""}
            </span>
            <button
              type="button"
              className="muse-btn muse-btn--ghost"
              onClick={() => {
                setService("all");
                setDestination("all");
                setStyle("all");
                setLanguage("all");
                setDestOnly(false);
              }}
            >
              Clear filters
            </button>
          </div>

          {filtered.length === 0 ? (
            <EmptyState />
          ) : (
            <div
              style={{
                display: "grid",
                gap: 26,
                gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                paddingBottom: 120,
              }}
            >
              {filtered.map((pro) => (
                <ProfessionalCard key={pro.slug} pro={pro} variant="directory" />
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 14px 8px 18px",
        border: "1px solid var(--muse-line)",
        borderRadius: "var(--muse-radius-pill)",
        background: "#fff",
      }}
    >
      <span
        style={{
          fontSize: 10,
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          color: "var(--muse-muted)",
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          border: 0,
          background: "transparent",
          fontSize: 13,
          color: "var(--muse-espresso)",
          outline: "none",
          minWidth: 100,
        }}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function EmptyState() {
  return (
    <div
      style={{
        padding: "80px 24px",
        textAlign: "center",
        border: "1px dashed var(--muse-line)",
        borderRadius: "var(--muse-radius)",
        background: "var(--muse-ivory-warm)",
      }}
    >
      <div
        style={{
          fontFamily: "var(--muse-font-display)",
          fontStyle: "italic",
          fontWeight: 300,
          fontSize: 38,
          color: "var(--muse-blush)",
        }}
      >
        nothing here yet
      </div>
      <p
        style={{
          marginTop: 12,
          color: "var(--muse-muted)",
          fontSize: 14,
          maxWidth: 400,
          marginInline: "auto",
        }}
      >
        Relax a filter or two, or start an enquiry — your concierge will match
        members not yet public in the directory.
      </p>
    </div>
  );
}
