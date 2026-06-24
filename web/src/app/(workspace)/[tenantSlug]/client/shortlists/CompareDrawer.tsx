"use client";

// CompareDrawer — Pro side-by-side comparison modal for a shortlist.
//
// Extracted from ShortlistsShell so that file stays under the max-lines gate.
// Self-contained: fetches each talent's detail from /api/discover/talent/:id,
// renders a fixed row set (photo / name / category / location / agency /
// languages / response / bio) as a table-like grid. Esc + backdrop close.

import { useEffect, useState } from "react";
import type { DiscoverShortlistTalent } from "../../_data-bridge/discover";

const C = {
  ink:        "#0B0B0D",
  inkMuted:   "rgba(11,11,13,0.55)",
  inkDim:     "rgba(11,11,13,0.35)",
  borderSoft: "rgba(24,24,27,0.08)",
  cardBg:     "#ffffff",
  accent:     "#0F4F3E",
  accentSoft: "rgba(15,79,62,0.08)",
} as const;

const FONT = '"Inter", system-ui, sans-serif';

/** Local mirror of DiscoverTalentDetail (API response shape). */
type CompareDetail = {
  id: string;
  displayName: string;
  primaryTypeLabel: string | null;
  secondaryTypeLabels: string[];
  homeCity: string | null;
  homeCountry: string | null;
  agencyName: string | null;
  isExclusive: boolean;
  bio: string | null;
  responseTime: "1h" | "4h" | "24h" | "48h" | null;
  languages: string[];
  headshotUrl: string | null;
};

export function CompareDrawer({
  shortlistName,
  talents,
  onClose,
}: {
  shortlistName: string;
  talents: DiscoverShortlistTalent[];
  onClose: () => void;
}) {
  const [details, setDetails] = useState<Map<string, CompareDetail>>(() => new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all(
      talents.map((t) =>
        fetch(`/api/discover/talent/${t.talentId}`)
          .then((r) => (r.ok ? r.json() : null))
          .then((j: { talent?: CompareDetail } | null) => j?.talent ?? null)
          .catch(() => null),
      ),
    ).then((rows) => {
      if (cancelled) return;
      const map = new Map<string, CompareDetail>();
      rows.forEach((row, i) => {
        const id = talents[i]?.talentId;
        if (row && id) map.set(id, row);
      });
      setDetails(map);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [talents]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const ROWS: Array<{ label: string; render: (d: CompareDetail | undefined, t: DiscoverShortlistTalent) => React.ReactNode }> = [
    {
      label: "",
      render: (d, t) => {
        const url = d?.headshotUrl ?? t.headshotUrl;
        if (url) {
          return (
            <div style={{
              width: "100%", aspectRatio: "4 / 5", borderRadius: 10,
              background: `url(${url}) center/cover no-repeat`,
            }} />
          );
        }
        return (
          <div style={{
            width: "100%", aspectRatio: "4 / 5", borderRadius: 10,
            background: C.accentSoft, color: C.accent,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 28, fontWeight: 700,
          }}>
            {t.displayName.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("")}
          </div>
        );
      },
    },
    { label: "Name", render: (_d, t) => <strong>{t.displayName}</strong> },
    {
      label: "Category",
      render: (d, t) => {
        const primary = d?.primaryTypeLabel ?? t.primaryTypeLabel ?? "—";
        const secondary = d?.secondaryTypeLabels ?? [];
        return (
          <span>
            {primary}
            {secondary.length > 0 && (
              <span style={{ color: C.inkDim, fontSize: 11 }}>
                <br />+ {secondary.join(" · ")}
              </span>
            )}
          </span>
        );
      },
    },
    {
      label: "Location",
      render: (_d, t) =>
        t.homeCity || t.homeCountry
          ? [t.homeCity, t.homeCountry].filter(Boolean).join(" · ")
          : <span style={{ color: C.inkDim }}>—</span>,
    },
    {
      label: "Agency",
      render: (_d, t) => t.agencyName
        ? <span>{t.agencyName}{t.isExclusive && <span style={{ color: C.inkDim, fontSize: 11 }}> · exclusive</span>}</span>
        : <span style={{ color: C.inkDim }}>Independent</span>,
    },
    {
      label: "Languages",
      render: (d) =>
        (d?.languages?.length ?? 0) > 0
          ? d!.languages.join(" · ")
          : <span style={{ color: C.inkDim }}>—</span>,
    },
    {
      label: "Response",
      render: (d) => d?.responseTime
        ? `within ${d.responseTime}`
        : <span style={{ color: C.inkDim }}>—</span>,
    },
    {
      label: "Bio",
      render: (d) => d?.bio
        ? <span style={{ fontSize: 12, color: C.inkMuted, lineHeight: 1.5 }}>{d.bio}</span>
        : <span style={{ color: C.inkDim }}>—</span>,
    },
  ];

  return (
    <div
      role="dialog"
      aria-modal
      aria-label={`Compare talents on ${shortlistName}`}
      style={{
        position: "fixed", inset: 0, zIndex: 60,
        background: "rgba(11,11,13,0.55)",
        backdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20,
        fontFamily: FONT,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: C.cardBg,
          borderRadius: 14,
          maxWidth: 1200, width: "100%", maxHeight: "90vh",
          display: "flex", flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 24px 80px -16px rgba(11,11,13,0.4)",
        }}
      >
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 18px",
          borderBottom: `1px solid ${C.borderSoft}`,
        }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>
            ⇄ Compare · {shortlistName} · {talents.length} talents
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close compare"
            style={{
              width: 32, height: 32, borderRadius: "50%",
              border: `1px solid ${C.borderSoft}`,
              background: "transparent", color: C.ink,
              fontSize: 16, lineHeight: 1, cursor: "pointer",
            }}
          >
            ✕
          </button>
        </div>

        <div style={{
          overflow: "auto", flex: 1,
          padding: 18,
        }}>
          {loading ? (
            <div style={{ padding: 24, color: C.inkMuted }}>Loading talent details…</div>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: `120px repeat(${talents.length}, minmax(180px, 1fr))`,
                gap: 0,
              }}
            >
              {ROWS.map((row, ri) => (
                <CompareRowFragment
                  key={row.label || `row-${ri}`}
                  label={row.label}
                  values={talents.map((t) => row.render(details.get(t.talentId), t))}
                  borderBottom={ri < ROWS.length - 1}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CompareRowFragment({
  label,
  values,
  borderBottom,
}: {
  label: string;
  values: React.ReactNode[];
  borderBottom: boolean;
}) {
  const borderStyle = borderBottom ? `1px solid ${C.borderSoft}` : "none";
  return (
    <>
      <div
        style={{
          padding: "10px 12px",
          fontSize: 10.5, fontWeight: 700, letterSpacing: 0.4,
          textTransform: "uppercase", color: C.inkDim,
          borderBottom: borderStyle,
          display: "flex", alignItems: "center",
        }}
      >
        {label}
      </div>
      {values.map((v, i) => (
        <div
          key={i}
          style={{
            padding: "10px 12px",
            fontSize: 13, color: C.ink,
            borderBottom: borderStyle,
            borderLeft: `1px solid ${C.borderSoft}`,
            verticalAlign: "top",
          }}
        >
          {v}
        </div>
      ))}
    </>
  );
}
