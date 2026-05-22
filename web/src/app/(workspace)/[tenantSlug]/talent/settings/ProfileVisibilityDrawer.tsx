"use client";

/**
 * ProfileVisibilityDrawer — the talent's visibility control surface.
 *
 * Holds two layers of talent-controlled visibility:
 *   - Global switch  → talent_profiles.is_publicly_hidden (every site at once)
 *   - Per-agency-site switches → agency_talent_roster.talent_site_hidden
 *     (opt out of one agency's public site while staying visible elsewhere)
 *
 * The global switch overrides the per-site switches: while the talent is
 * globally hidden the per-site rows render disabled.
 *
 * Presentational + action-wiring only — all state lives in ProfileVisibilityCard
 * (so the card's summary line stays in sync). Lives in the talent/settings route
 * folder so inline styles are unconstrained.
 */

import { Toggle } from "@/components/admin/shell/internal/primitives";

export type AgencySite = {
  /** agency id — also the tenant_id on the agency_talent_roster row. */
  id: string;
  agencyName: string;
  /** roster_only | site_visible | featured — the agency's own eye. */
  agencyVisibility: string;
  /** talent's per-site opt-out for this agency. */
  talentSiteHidden: boolean;
};

const C = {
  ink:        "#0B0B0D",
  inkMuted:   "rgba(11,11,13,0.62)",
  inkDim:     "rgba(11,11,13,0.42)",
  border:     "rgba(24,24,27,0.12)",
  borderSoft: "rgba(24,24,27,0.08)",
  accentDeep: "#093328",
  accentSoft: "rgba(15,79,62,0.10)",
  slate:      "#52606D",
  slateDeep:  "#3A4651",
  slateSoft:  "rgba(82,96,109,0.10)",
  error:      "#c0392b",
} as const;

const FONT = '"Inter", system-ui, sans-serif';

function EyeGlyph({ open }: { open: boolean }) {
  return open ? (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ) : (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c6.5 0 10 7 10 7a13.2 13.2 0 0 1-1.67 2.68" />
      <path d="M6.61 6.61A13.5 13.5 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.39-1.61" />
      <path d="m2 2 20 20" />
      <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
    </svg>
  );
}

function AgencySiteRow({
  agency,
  siteHidden,
  globalHidden,
  pending,
  onToggle,
}: {
  agency: AgencySite;
  siteHidden: boolean;
  globalHidden: boolean;
  pending: boolean;
  onToggle: (nextVisible: boolean) => void;
}) {
  const shown = !siteHidden && !globalHidden;
  const eyeOff = agency.agencyVisibility === "roster_only";
  const note = globalHidden
    ? "Paused — your profile is hidden everywhere"
    : eyeOff
      ? `${agency.agencyName} hasn't listed you publicly yet — your choice is saved for when they do`
      : siteHidden
        ? "Hidden from this agency's site"
        : "Shown on this agency's site";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 0",
        borderTop: `1px solid ${C.borderSoft}`,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: globalHidden ? C.inkDim : C.ink }}>
          {agency.agencyName}
        </div>
        <div style={{ fontSize: 11, color: C.inkMuted, marginTop: 1, lineHeight: 1.4 }}>
          {note}
        </div>
      </div>
      <Toggle
        on={shown}
        onChange={(v) => { if (!globalHidden && !pending) onToggle(v); }}
        label={`Show on ${agency.agencyName}'s site`}
      />
    </div>
  );
}

export function ProfileVisibilityDrawer({
  open,
  onClose,
  globalHidden,
  globalPending,
  onToggleGlobal,
  agencies,
  siteHidden,
  sitePendingId,
  onToggleSite,
  errorMsg,
}: {
  open: boolean;
  onClose: () => void;
  globalHidden: boolean;
  globalPending: boolean;
  onToggleGlobal: (nextVisible: boolean) => void;
  agencies: AgencySite[];
  /** agency id → current per-site hidden state */
  siteHidden: Record<string, boolean>;
  /** agency id currently mid-save, or null */
  sitePendingId: string | null;
  onToggleSite: (agency: AgencySite, nextVisible: boolean) => void;
  errorMsg: string | null;
}) {
  if (!open) return null;
  const visible = !globalHidden;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Profile visibility"
      style={{ position: "fixed", inset: 0, zIndex: 4000, fontFamily: FONT }}
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: "absolute", inset: 0, background: "rgba(11,11,13,0.42)" }}
      />
      {/* Panel */}
      <div
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          height: "100%",
          width: "min(440px, 100vw)",
          background: "#fff",
          boxShadow: "-12px 0 40px -12px rgba(11,11,13,0.35)",
          display: "flex",
          flexDirection: "column",
          overflowY: "auto",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "16px 18px",
            borderBottom: `1px solid ${C.borderSoft}`,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.ink }}>Profile visibility</div>
            <div style={{ fontSize: 11.5, color: C.inkMuted, marginTop: 1 }}>
              Control where your profile appears.
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              border: `1px solid ${C.borderSoft}`,
              background: "#fff",
              color: C.inkMuted,
              cursor: "pointer",
              fontSize: 16,
              lineHeight: 1,
              flexShrink: 0,
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Global switch */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "14px 14px",
              borderRadius: 12,
              background: globalHidden ? C.slateSoft : C.accentSoft,
              border: `1px solid ${globalHidden ? "rgba(82,96,109,0.28)" : "rgba(15,79,62,0.18)"}`,
            }}
          >
            <span
              aria-hidden
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                flexShrink: 0,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                background: globalHidden ? "rgba(82,96,109,0.16)" : "rgba(15,79,62,0.14)",
                color: globalHidden ? C.slateDeep : C.accentDeep,
              }}
            >
              <EyeGlyph open={visible} />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>
                Visible across Tulala
              </div>
              <div style={{ fontSize: 11.5, color: C.inkMuted, marginTop: 1, lineHeight: 1.45 }}>
                {visible
                  ? "Your profile can appear on agency directories, search and public pages."
                  : "Hidden everywhere — you won't appear on any site until you turn this back on."}
              </div>
            </div>
            <Toggle
              on={visible}
              onChange={(v) => { if (!globalPending) onToggleGlobal(v); }}
              label="Visible across Tulala"
            />
          </div>

          {/* Per-agency sites */}
          <div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: 0.6,
                textTransform: "uppercase",
                color: C.inkMuted,
                marginBottom: 2,
              }}
            >
              Agency sites
            </div>
            <div style={{ fontSize: 11.5, color: C.inkMuted, lineHeight: 1.45, marginBottom: 4 }}>
              {globalHidden
                ? "Turn your profile back on above to choose individual sites."
                : "Choose which of your agencies may show you on their public site."}
            </div>
            {agencies.length === 0 ? (
              <div style={{ fontSize: 12, color: C.inkDim, padding: "12px 0" }}>
                You&apos;re not on any agency roster yet.
              </div>
            ) : (
              agencies.map((a) => (
                <AgencySiteRow
                  key={a.id}
                  agency={a}
                  siteHidden={siteHidden[a.id] ?? a.talentSiteHidden}
                  globalHidden={globalHidden}
                  pending={sitePendingId === a.id}
                  onToggle={(v) => onToggleSite(a, v)}
                />
              ))
            )}
          </div>

          {errorMsg && (
            <div role="alert" style={{ fontSize: 11.5, color: C.error }}>
              {errorMsg}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
