"use client";

/**
 * ProfileVisibilityCard — launcher for the talent's visibility controls.
 *
 * Shows a one-line summary of the talent's current visibility and opens
 * ProfileVisibilityDrawer, which holds the two talent-controlled layers:
 *   - global   → talent_profiles.is_publicly_hidden
 *   - per-site → agency_talent_roster.talent_site_hidden (one per agency)
 *
 * This card owns all the state so its summary stays in sync with the drawer.
 * Lives in the talent/settings route folder (not under components/admin/shell)
 * so inline styles are unconstrained.
 */

import { useState } from "react";
import { setTalentProfileVisibility, setTalentSiteVisibility } from "./actions";
import { ProfileVisibilityDrawer, type AgencySite } from "./ProfileVisibilityDrawer";

const C = {
  ink:        "#0B0B0D",
  inkMuted:   "rgba(11,11,13,0.62)",
  borderSoft: "rgba(24,24,27,0.08)",
  accentDeep: "#093328",
  accentSoft: "rgba(15,79,62,0.10)",
  slateDeep:  "#3A4651",
  slateSoft:  "rgba(82,96,109,0.10)",
} as const;

const FONT = '"Inter", system-ui, sans-serif';

export function ProfileVisibilityCard({
  tenantSlug,
  talentId,
  initialHidden,
  agencies,
  onOpenRepresentation,
}: {
  tenantSlug: string;
  talentId: string;
  initialHidden: boolean;
  agencies: AgencySite[];
  /** When set (admin shell), opens the unified Representation drawer. */
  onOpenRepresentation?: () => void;
}) {
  const [hidden, setHidden] = useState(initialHidden);
  const [siteHidden, setSiteHidden] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(agencies.map((a) => [a.id, a.talentSiteHidden])),
  );
  const [globalPending, setGlobalPending] = useState(false);
  const [sitePendingId, setSitePendingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const openVisibility = () => {
    if (onOpenRepresentation) {
      onOpenRepresentation();
      return;
    }
    setDrawerOpen(true);
  };

  const toggleGlobal = async (nextVisible: boolean) => {
    if (globalPending) return;
    const nextHidden = !nextVisible;
    setHidden(nextHidden);
    setErrorMsg(null);
    setGlobalPending(true);
    const res = await setTalentProfileVisibility(tenantSlug, talentId, nextHidden);
    setGlobalPending(false);
    if (!res.ok) {
      setHidden(!nextHidden); // revert
      setErrorMsg(res.error);
    }
  };

  const toggleSite = async (agency: AgencySite, nextVisible: boolean) => {
    if (sitePendingId) return;
    const nextHidden = !nextVisible;
    setSiteHidden((s) => ({ ...s, [agency.id]: nextHidden }));
    setErrorMsg(null);
    setSitePendingId(agency.id);
    const res = await setTalentSiteVisibility(tenantSlug, talentId, agency.id, nextHidden);
    setSitePendingId(null);
    if (!res.ok) {
      setSiteHidden((s) => ({ ...s, [agency.id]: !nextHidden })); // revert
      setErrorMsg(res.error);
    }
  };

  // Summary line.
  const shownSites = agencies.filter((a) => !(siteHidden[a.id] ?? a.talentSiteHidden)).length;
  const summary = hidden
    ? "Hidden everywhere"
    : agencies.length > 0
      ? `Visible across Tulala · on ${shownSites} of ${agencies.length} agency site${agencies.length === 1 ? "" : "s"}`
      : "Visible across Tulala";

  return (
    <>
      <button
        type="button"
        onClick={openVisibility}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          width: "100%",
          textAlign: "left",
          padding: "14px 16px",
          marginBottom: 16,
          borderRadius: 12,
          background: hidden ? C.slateSoft : "#fff",
          border: `1px solid ${hidden ? "rgba(82,96,109,0.28)" : C.borderSoft}`,
          cursor: "pointer",
          fontFamily: FONT,
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
            background: hidden ? "rgba(82,96,109,0.16)" : C.accentSoft,
            color: hidden ? C.slateDeep : C.accentDeep,
          }}
        >
          {hidden ? (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c6.5 0 10 7 10 7a13.2 13.2 0 0 1-1.67 2.68" />
              <path d="M6.61 6.61A13.5 13.5 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.39-1.61" />
              <path d="m2 2 20 20" />
              <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
            </svg>
          ) : (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          )}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>Profile visibility</div>
          <div style={{ fontSize: 11.5, color: C.inkMuted, marginTop: 1, lineHeight: 1.45 }}>
            {summary}
          </div>
        </div>
        <span style={{ fontSize: 12, fontWeight: 600, color: C.accentDeep, flexShrink: 0 }}>
          Manage →
        </span>
      </button>

      <ProfileVisibilityDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        globalHidden={hidden}
        globalPending={globalPending}
        onToggleGlobal={toggleGlobal}
        agencies={agencies}
        siteHidden={siteHidden}
        sitePendingId={sitePendingId}
        onToggleSite={toggleSite}
        errorMsg={errorMsg}
      />
    </>
  );
}
