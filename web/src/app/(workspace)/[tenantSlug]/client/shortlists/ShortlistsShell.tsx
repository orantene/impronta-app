"use client";

// ShortlistsShell — viewer + send-inquiry surface for /client/shortlists.
//
// Each shortlist card shows the talents on it (initials/photo · name ·
// agency or "Independent") plus a "Send inquiry" button that opens an
// inline form. Submitting POSTs /api/discover/inquiry with the full
// talent array — the server groups by primary tenant and fans out, so
// one shortlist with talents from 3 agencies → 3 inquiries.

import { useEffect, useState } from "react";
import Link from "next/link";
import type { DiscoverShortlistWithTalents } from "../../_data-bridge/discover";

const C = {
  ink:        "#0B0B0D",
  inkMuted:   "rgba(11,11,13,0.55)",
  inkDim:     "rgba(11,11,13,0.35)",
  border:     "rgba(24,24,27,0.16)",
  borderSoft: "rgba(24,24,27,0.08)",
  cardBg:     "#ffffff",
  surface:    "rgba(11,11,13,0.02)",
  accent:     "#0F4F3E",
  accentSoft: "rgba(15,79,62,0.08)",
  accentDeep: "#0F4F3E",
} as const;

const FONT = '"Inter", system-ui, sans-serif';

export function ShortlistsShell({
  shortlists,
  tenantSlug,
}: {
  shortlists: DiscoverShortlistWithTalents[];
  tenantSlug: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, fontFamily: FONT }}>
      {shortlists.map((s) => (
        <ShortlistCard key={s.id} shortlist={s} tenantSlug={tenantSlug} />
      ))}
      <div style={{
        padding: 16, borderRadius: 12,
        background: C.surface, border: `1px dashed ${C.borderSoft}`,
        textAlign: "center", color: C.inkMuted, fontSize: 12.5,
      }}>
        Need more shortlists? Open <Link href={`/${tenantSlug}/client/discover`} style={{ color: C.accent, fontWeight: 600 }}>Discover</Link>, save talent into a new list, and they&apos;ll show up here.
      </div>
    </div>
  );
}

function ShortlistCard({
  shortlist,
  tenantSlug,
}: {
  shortlist: DiscoverShortlistWithTalents;
  tenantSlug: string;
}) {
  const [inquireOpen, setInquireOpen] = useState(false);
  const [eventDate, setEventDate] = useState("");
  const [eventLocation, setEventLocation] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);

  // Per-tenant tally for the fan-out preview line. Uses routesToTenantId
  // (= the actual fallback ladder used by /api/discover/inquiry) so the
  // preview matches what happens on submit. Talents on a Free workspace
  // roster route to that workspace; only talents with NO active roster
  // anywhere are truly "not routable."
  const tenantBuckets = new Map<string, { name: string; count: number }>();
  let noRosterCount = 0;
  for (const t of shortlist.talents) {
    if (t.routesToTenantId && t.routesToTenantName) {
      const existing = tenantBuckets.get(t.routesToTenantId);
      tenantBuckets.set(t.routesToTenantId, {
        name: t.routesToTenantName,
        count: (existing?.count ?? 0) + 1,
      });
    } else {
      noRosterCount += 1;
    }
  }
  const routableCount = shortlist.talents.length - noRosterCount;

  return (
    <div
      style={{
        background: C.cardBg,
        border: `1px solid ${C.borderSoft}`,
        borderRadius: 14,
        padding: 16,
        fontFamily: FONT,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 600, color: C.ink, marginBottom: 4 }}>
            {shortlist.name}
          </div>
          <div style={{ fontSize: 12, color: C.inkMuted }}>
            {shortlist.talents.length} {shortlist.talents.length === 1 ? "talent" : "talents"}
            {tenantBuckets.size > 0 && (
              <span>
                {" · "}
                Routes to {tenantBuckets.size} {tenantBuckets.size === 1 ? "workspace" : "workspaces"}
              </span>
            )}
            {noRosterCount > 0 && (
              <span style={{ color: C.inkDim }}>
                {" · "}
                {noRosterCount} need direct outreach
              </span>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={() => setCompareOpen(true)}
            disabled={shortlist.talents.length < 2}
            title={shortlist.talents.length < 2 ? "Need at least 2 talents to compare" : "Open side-by-side comparison"}
            style={{
              height: 36, padding: "0 14px", borderRadius: 8,
              background: "transparent",
              border: `1px solid ${shortlist.talents.length < 2 ? C.borderSoft : C.border}`,
              color: shortlist.talents.length < 2 ? C.inkDim : C.ink,
              fontFamily: FONT, fontSize: 12.5, fontWeight: 600,
              cursor: shortlist.talents.length < 2 ? "not-allowed" : "pointer",
            }}
          >
            ⇄ Compare
          </button>
          <button
            type="button"
            onClick={() => { setInquireOpen((v) => !v); setResult(null); }}
            disabled={routableCount === 0}
            style={{
              height: 36, padding: "0 14px", borderRadius: 8,
              background: routableCount === 0 ? "rgba(11,11,13,0.10)" : (inquireOpen ? C.accentSoft : C.accent),
              border: `1px solid ${inquireOpen ? C.accent : "transparent"}`,
              color: routableCount === 0 ? C.inkDim : (inquireOpen ? C.accentDeep : "#fff"),
              fontFamily: FONT, fontSize: 12.5, fontWeight: 600,
              cursor: routableCount === 0 ? "not-allowed" : "pointer",
            }}
          >
            {inquireOpen ? "Cancel" : `Send inquiry${routableCount > 0 ? "" : " (no agencies)"}`}
          </button>
        </div>
      </div>

      {shortlist.talents.length > 0 && (
        <div style={{
          marginTop: 14,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
          gap: 10,
        }}>
          {shortlist.talents.map((t) => (
            <div
              key={t.talentId}
              style={{
                display: "flex", flexDirection: "column", gap: 4,
                padding: 8, borderRadius: 10,
                border: `1px solid ${C.borderSoft}`,
                background: C.surface,
              }}
            >
              <div style={{
                aspectRatio: "1/1", borderRadius: 8,
                background: t.headshotUrl
                  ? `url(${t.headshotUrl}) center/cover no-repeat`
                  : C.accentSoft,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 16, fontWeight: 700, color: C.accent,
                marginBottom: 4,
              }}>
                {!t.headshotUrl && t.displayName.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("")}
              </div>
              <div style={{ fontSize: 11.5, fontWeight: 600, color: C.ink, lineHeight: 1.2 }}>
                {t.displayName}
              </div>
              <div style={{ fontSize: 10, color: C.inkMuted }}>
                {t.primaryTypeLabel ?? "—"}
              </div>
              <div style={{ fontSize: 9.5, color: C.inkDim, marginTop: 1 }}>
                {t.agencyName ?? "Independent"}
              </div>
            </div>
          ))}
        </div>
      )}

      {inquireOpen && routableCount > 0 && (
        <div style={{
          marginTop: 14, padding: 12,
          border: `1px solid ${C.borderSoft}`, borderRadius: 10,
          background: C.surface,
          display: "flex", flexDirection: "column", gap: 10,
        }}>
          <div style={{ fontSize: 11.5, color: C.inkMuted }}>
            One inquiry per workspace. {Array.from(tenantBuckets.values())
              .map((b) => `${b.name} (${b.count})`)
              .join(" · ")}
            {noRosterCount > 0 && ` · ${noRosterCount} talent${noRosterCount === 1 ? "" : "s"} not on any roster — reach via public profile.`}
          </div>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11, color: C.inkMuted }}>
            Event date (optional)
            <input
              type="date"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              style={{
                height: 34, padding: "0 10px", borderRadius: 8,
                border: `1px solid ${C.borderSoft}`, background: "#fff",
                color: C.ink, fontFamily: FONT, fontSize: 13,
              }}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11, color: C.inkMuted }}>
            Event location (optional)
            <input
              type="text"
              placeholder="e.g. Milan, Italy"
              value={eventLocation}
              onChange={(e) => setEventLocation(e.target.value)}
              style={{
                height: 34, padding: "0 10px", borderRadius: 8,
                border: `1px solid ${C.borderSoft}`, background: "#fff",
                color: C.ink, fontFamily: FONT, fontSize: 13,
              }}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11, color: C.inkMuted }}>
            Brief
            <textarea
              placeholder="Quick context: brand, role, scope, dates if known."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              style={{
                padding: "8px 10px", borderRadius: 8,
                border: `1px solid ${C.borderSoft}`, background: "#fff",
                color: C.ink, fontFamily: FONT, fontSize: 13,
                resize: "vertical",
              }}
            />
          </label>
          {result && (
            <div style={{
              padding: "8px 10px", borderRadius: 8, fontSize: 12,
              background: result.ok ? "rgba(46,125,91,0.10)" : "rgba(176,48,58,0.10)",
              color: result.ok ? "#1B5C45" : "#B0303A",
              border: `1px solid ${result.ok ? "rgba(46,125,91,0.30)" : "rgba(176,48,58,0.30)"}`,
            }}>
              {result.text}
            </div>
          )}
          <button
            type="button"
            disabled={submitting}
            onClick={async () => {
              setSubmitting(true);
              setResult(null);
              try {
                const res = await fetch("/api/discover/inquiry", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    talentIds: shortlist.talents.map((t) => t.talentId),
                    eventDate: eventDate || undefined,
                    eventLocation: eventLocation || undefined,
                    message: message || undefined,
                    sourceShortlistId: shortlist.id,
                  }),
                });
                const j = await res.json();
                if (res.ok && j.inquiries?.length > 0) {
                  const created = j.inquiries.length;
                  const skipped = j.skipped?.length ?? 0;
                  setResult({
                    ok: true,
                    text: `Sent ${created} ${created === 1 ? "inquiry" : "inquiries"} to ${created === 1 ? "the workspace" : `${created} workspaces`}.${skipped > 0 ? ` ${skipped} talent${skipped === 1 ? " was" : "s were"} skipped (not on any roster) — reach them directly.` : ""}`,
                  });
                  setEventDate("");
                  setEventLocation("");
                  setMessage("");
                } else {
                  setResult({
                    ok: false,
                    text: j.error === "no_routable_talents"
                      ? "No agencies to route to — every talent on this shortlist is independent."
                      : "Couldn't send — try again in a moment.",
                  });
                }
              } catch {
                setResult({ ok: false, text: "Network issue — try again." });
              } finally {
                setSubmitting(false);
              }
            }}
            style={{
              height: 38, borderRadius: 8,
              background: submitting ? "rgba(11,11,13,0.4)" : C.accent,
              color: "#fff", border: "none",
              fontFamily: FONT, fontSize: 13, fontWeight: 600,
              cursor: submitting ? "not-allowed" : "pointer",
            }}
          >
            {submitting
              ? "Sending…"
              : `Send ${tenantBuckets.size} ${tenantBuckets.size === 1 ? "inquiry" : "inquiries"}`}
          </button>
        </div>
      )}

      {compareOpen && (
        <CompareDrawer
          shortlistName={shortlist.name}
          talents={shortlist.talents.slice(0, 6)}
          onClose={() => setCompareOpen(false)}
        />
      )}
    </div>
  );
}

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

function CompareDrawer({
  shortlistName,
  talents,
  onClose,
}: {
  shortlistName: string;
  talents: import("../../_data-bridge/discover").DiscoverShortlistTalent[];
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

  const ROWS: Array<{ label: string; render: (d: CompareDetail | undefined, t: import("../../_data-bridge/discover").DiscoverShortlistTalent) => React.ReactNode }> = [
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
          // eslint-disable-next-line react/no-array-index-key
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
