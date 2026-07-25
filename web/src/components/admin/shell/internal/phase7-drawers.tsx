"use client";

// ============================================================================
// _phase7-drawers.tsx — Phase 7 UI scaffolding for the field architecture
//
// Three concept-driven drawers that consume the new server actions from
// admin-talent-extras.ts:
//
//   1. PermissionConsentDrawer — talent reviews + approves an agency's
//      OAuth-style request to access their data (granular per-scope toggles).
//
//   2. AgencyMediaCurationPanel — agency staff manages the per-tenant
//      photo layer for a specific talent (overrides, agency-original adds,
//      visibility, sort order).
//
//   3. TrustBadgesPanel — admin view of a talent's trust badges with
//      verification workflow (approve / reject / request more info).
//
// These mount inside the existing TalentProfileShellDrawer for admin
// surfaces. The talent-side consent UX is rendered via the same
// PermissionConsentDrawer when accessed from the talent surface.
// ============================================================================

import React, { useEffect, useState } from "react";
import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";
import {
  createPermissionRequest,
  respondToPermissionRequest,
  revokeDataGrant,
  getTrustBadges,
  createTrustBadge,
  updateTrustBadge,
  getAgencyMediaForTenant,
  addAgencyMedia,
  removeAgencyMedia,
  reorderAgencyMedia,
  type TrustBadge,
  type TrustBadgeKind,
  type DataScope,
  type AgencyMediaRow,
} from "@/lib/server-actions/admin-talent-extras";

// ─── Shared style tokens (kept inline to avoid cross-file dep) ─────────────

const T = {
  ink: "#0B0B0D",
  inkMuted: "#5A5A60",
  surface: "#FFFFFF",
  surfaceAlt: "#F4F2EB",
  border: "#D5D2C7",
  borderSoft: "rgba(11,11,13,0.08)",
  accent: "#0F4F3E",
  accentSoft: "rgba(15,79,62,0.12)",
  red: "#A4361A",
  redSoft: "rgba(164,54,26,0.1)",
  amber: "#9B6D1F",
  amberSoft: "rgba(155,109,31,0.12)",
  indigo: "#5B6BA0",
  indigoSoft: "rgba(91,107,160,0.12)",
  indigoDeep: "#3B4A75",
};

const F_BODY = "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

// ─── 1. PermissionConsentDrawer ────────────────────────────────────────────

// `label` / `description` stay in English as the non-UI fallback (docs, logs,
// tests). UI surfaces render `t(meta.labelKey)` / `t(meta.descriptionKey)` so
// the drawer follows the dashboard locale.
const SCOPE_META: Record<
  DataScope,
  { label: string; description: string; labelKey: string; descriptionKey: string; emoji: string }
> = {
  identity: {
    label: "Identity",
    description: "Name, photo, pronouns, bio, age. The basics.",
    labelKey: "dashboard.adminPhase7Drawers.scopes.identityLabel",
    descriptionKey: "dashboard.adminPhase7Drawers.scopes.identityDesc",
    emoji: "👤",
  },
  media: {
    label: "Media & Portfolio",
    description: "Headshot, gallery, showreel, social links.",
    labelKey: "dashboard.adminPhase7Drawers.scopes.mediaLabel",
    descriptionKey: "dashboard.adminPhase7Drawers.scopes.mediaDesc",
    emoji: "🎨",
  },
  rates: {
    label: "Rates & Booking Terms",
    description: "Pricing, deposit, cancellation policy. Sensitive, agencies often markup.",
    labelKey: "dashboard.adminPhase7Drawers.scopes.ratesLabel",
    descriptionKey: "dashboard.adminPhase7Drawers.scopes.ratesDesc",
    emoji: "💰",
  },
  service_areas: {
    label: "Service Areas",
    description: "Cities you serve, travel radius, willingness to travel.",
    labelKey: "dashboard.adminPhase7Drawers.scopes.serviceAreasLabel",
    descriptionKey: "dashboard.adminPhase7Drawers.scopes.serviceAreasDesc",
    emoji: "📍",
  },
  availability: {
    label: "Availability",
    description: "Days, hours, blackout dates, response time.",
    labelKey: "dashboard.adminPhase7Drawers.scopes.availabilityLabel",
    descriptionKey: "dashboard.adminPhase7Drawers.scopes.availabilityDesc",
    emoji: "📅",
  },
  documents: {
    label: "Documents",
    description: "Government ID, licenses, insurance. Highly sensitive.",
    labelKey: "dashboard.adminPhase7Drawers.scopes.documentsLabel",
    descriptionKey: "dashboard.adminPhase7Drawers.scopes.documentsDesc",
    emoji: "🔒",
  },
  physical: {
    label: "Physical / Casting",
    description: "Height, measurements, hair/eye color, sizes.",
    labelKey: "dashboard.adminPhase7Drawers.scopes.physicalLabel",
    descriptionKey: "dashboard.adminPhase7Drawers.scopes.physicalDesc",
    emoji: "📐",
  },
  experience: {
    label: "Experience & Credits",
    description: "Years, past clients, references, credentials.",
    labelKey: "dashboard.adminPhase7Drawers.scopes.experienceLabel",
    descriptionKey: "dashboard.adminPhase7Drawers.scopes.experienceDesc",
    emoji: "⭐",
  },
};

export function PermissionConsentDrawer({
  open,
  request,
  talentName,
  agencyName,
  agencyAvatar,
  onClose,
  onApproved,
}: {
  open: boolean;
  request: {
    id: string;
    requested_scopes: DataScope[];
    request_message: string | null;
  } | null;
  talentName: string;
  agencyName: string;
  agencyAvatar?: string | null;
  onClose: () => void;
  onApproved?: (approvedScopes: DataScope[]) => void;
}) {
  const t = useT();
  const [approvedScopes, setApprovedScopes] = useState<Set<DataScope>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (request) {
      // Default: approve everything they requested (talent can deselect).
      setApprovedScopes(new Set(request.requested_scopes));
    }
  }, [request]);

  if (!open || !request) return null;

  const toggleScope = (s: DataScope) => {
    setApprovedScopes((prev) => {
      const n = new Set(prev);
      if (n.has(s)) n.delete(s);
      else n.add(s);
      return n;
    });
  };

  const handleResponse = async (decision: "approved" | "denied") => {
    setSubmitting(true);
    setError(null);
    const res = await respondToPermissionRequest({
      request_id: request.id,
      decision,
      approved_scopes: decision === "approved" ? Array.from(approvedScopes) : undefined,
    });
    setSubmitting(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    if (decision === "approved") onApproved?.(Array.from(approvedScopes));
    onClose();
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 200,
      display: "flex", alignItems: "flex-end", justifyContent: "center",
      background: "rgba(11,11,13,0.45)",
      fontFamily: F_BODY,
    }} onClick={onClose}>
      <div style={{
        background: T.surface, borderRadius: "16px 16px 0 0",
        maxWidth: 560, width: "100%", maxHeight: "85vh",
        display: "flex", flexDirection: "column",
      }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{
          padding: "20px 24px 16px", borderBottom: `1px solid ${T.borderSoft}`,
        }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: T.ink, marginBottom: 6 }}>
            {interpolate(t("dashboard.adminPhase7Drawers.consentTitle"), { agencyName })}
          </div>
          <div style={{ fontSize: 13, color: T.inkMuted, lineHeight: 1.5 }}>
            {t("dashboard.adminPhase7Drawers.consentBody")}
          </div>
          {request.request_message && (
            <div style={{
              marginTop: 12, padding: 12, borderRadius: 10,
              background: T.indigoSoft, fontSize: 12.5, color: T.indigoDeep,
              fontStyle: "italic", lineHeight: 1.5,
            }}>
              &quot;{request.request_message}&quot;
            </div>
          )}
        </div>

        {/* Scope list */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
          {request.requested_scopes.map((scope) => {
            const meta = SCOPE_META[scope];
            const approved = approvedScopes.has(scope);
            return (
              <button
                key={scope}
                type="button"
                onClick={() => toggleScope(scope)}
                style={{
                  width: "100%", textAlign: "left",
                  display: "flex", alignItems: "flex-start", gap: 12,
                  padding: "14px 14px", borderRadius: 10,
                  background: approved ? T.accentSoft : T.surface,
                  border: `1px solid ${approved ? T.accent : T.border}`,
                  cursor: "pointer", marginBottom: 8,
                  fontFamily: F_BODY,
                }}
              >
                <span style={{ fontSize: 22, lineHeight: 1 }}>{meta.emoji}</span>
                <div className="flex-1">
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: T.ink, marginBottom: 2 }}>
                    {t(meta.labelKey)}
                  </div>
                  <div style={{ fontSize: 11.5, color: T.inkMuted, lineHeight: 1.4 }}>
                    {t(meta.descriptionKey)}
                  </div>
                </div>
                <span style={{
                  width: 22, height: 22, borderRadius: "50%",
                  border: `2px solid ${approved ? T.accent : T.border}`,
                  background: approved ? T.accent : T.surface,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0,
                }}>
                  {approved && <span style={{ color: "#fff", fontSize: 13, fontWeight: 700 }}>✓</span>}
                </span>
              </button>
            );
          })}
        </div>

        {/* Footer actions */}
        {error && (
          <div style={{
            margin: "0 20px 12px", padding: 10, borderRadius: 8,
            background: T.redSoft, border: `1px solid ${T.red}`,
            fontSize: 12, color: T.ink,
          }}>{error}</div>
        )}

        <div style={{
          padding: "16px 20px", borderTop: `1px solid ${T.borderSoft}`,
          display: "flex", gap: 8, justifyContent: "space-between",
        }}>
          <button type="button" disabled={submitting}
            onClick={() => handleResponse("denied")}
            style={{
              padding: "10px 16px", fontSize: 13, fontWeight: 600,
              borderRadius: 8, border: `1px solid ${T.border}`,
              background: T.surface, color: T.red, cursor: "pointer",
              fontFamily: F_BODY,
            }}>
            {t("dashboard.adminPhase7Drawers.denyRequest")}
          </button>
          <button type="button" disabled={submitting || approvedScopes.size === 0}
            onClick={() => handleResponse("approved")}
            style={{
              padding: "10px 20px", fontSize: 13, fontWeight: 600,
              borderRadius: 8, border: "none",
              background: approvedScopes.size === 0 ? T.inkMuted : T.accent,
              color: "#fff", cursor: approvedScopes.size === 0 ? "not-allowed" : "pointer",
              fontFamily: F_BODY,
            }}>
            {submitting
              ? t("dashboard.adminPhase7Drawers.saving")
              : interpolate(t("dashboard.adminPhase7Drawers.approveNOfM"), {
                  count: approvedScopes.size,
                  total: request.requested_scopes.length,
                })}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── 2. AgencyMediaCurationPanel ───────────────────────────────────────────

export function AgencyMediaCurationPanel({
  talentProfileId,
  talentName,
}: {
  talentProfileId: string;
  talentName: string;
}) {
  const t = useT();
  const [rows, setRows] = useState<AgencyMediaRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = async () => {
    setLoading(true);
    setError(null);
    const res = await getAgencyMediaForTenant({ talent_profile_id: talentProfileId });
    if (res.ok) setRows(res.rows);
    else setError(res.error);
    setLoading(false);
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload closes over talentProfileId and stable setters; re-fetch when the talent changes
  }, [talentProfileId]);

  const handleRemove = async (id: string) => {
    if (!confirm(t("dashboard.adminPhase7Drawers.confirmRemoveFromLayer"))) return;
    await removeAgencyMedia({ agency_talent_media_id: id });
    reload();
  };

  return (
    <div style={{ fontFamily: F_BODY }}>
      <div style={{
        padding: 12, borderRadius: 8,
        background: T.indigoSoft, border: `1px solid rgba(91,107,160,0.18)`,
        fontSize: 12, color: T.indigoDeep, marginBottom: 12, lineHeight: 1.5,
      }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>
          {interpolate(t("dashboard.adminPhase7Drawers.agencyPhotoLayerFor"), { talentName })}
        </div>
        <div>{t("dashboard.adminPhase7Drawers.agencyPhotoLayerBody")}</div>
      </div>

      {loading && (
        <div style={{ color: T.inkMuted, fontSize: 12 }}>
          {t("dashboard.adminPhase7Drawers.loading")}
        </div>
      )}
      {error && (
        <div style={{
          padding: 10, borderRadius: 8, background: T.redSoft,
          border: `1px solid ${T.red}`, fontSize: 12, color: T.ink, marginBottom: 12,
        }}>{error}</div>
      )}

      {rows && rows.length === 0 && (
        <div style={{
          padding: 16, borderRadius: 8, background: T.surfaceAlt,
          border: `1px dashed ${T.border}`,
          fontSize: 12, color: T.inkMuted, textAlign: "center",
        }}>
          {t("dashboard.adminPhase7Drawers.noAgencyPhotos")}
        </div>
      )}

      {rows && rows.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {rows.map((r) => (
            <div key={r.id} style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "8px 10px", borderRadius: 8,
              background: T.surface, border: `1px solid ${T.border}`,
            }}>
              <span style={{
                width: 40, height: 40, borderRadius: 6,
                background: T.surfaceAlt, flexShrink: 0,
              }} />
              <div className="flex-1 min-w-0">
                <div style={{ fontSize: 12.5, fontWeight: 600, color: T.ink }}>
                  {r.master_media_id
                    ? t("dashboard.adminPhase7Drawers.rowOverride")
                    : t("dashboard.adminPhase7Drawers.rowAgencyOriginal")}
                  {!r.is_visible_on_agency_site && (
                    <span style={{
                      marginLeft: 8, fontSize: 9, fontWeight: 700,
                      padding: "1px 5px", borderRadius: 3,
                      background: T.inkMuted, color: "#fff",
                    }}>{t("dashboard.adminPhase7Drawers.hidden")}</span>
                  )}
                </div>
                {r.caption && (
                  <div style={{ fontSize: 11, color: T.inkMuted, marginTop: 1 }}>{r.caption}</div>
                )}
              </div>
              <button type="button" onClick={() => handleRemove(r.id)}
                style={{
                  padding: "4px 10px", fontSize: 11, fontWeight: 600,
                  borderRadius: 6, border: `1px solid ${T.border}`,
                  background: T.surface, color: T.red, cursor: "pointer",
                  fontFamily: F_BODY,
                }}>{t("dashboard.adminPhase7Drawers.remove")}</button>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 12, fontSize: 11, color: T.inkMuted, fontStyle: "italic" }}>
        {t("dashboard.adminPhase7Drawers.uploadShipsNextSlice")}
      </div>
    </div>
  );
}

// ─── 3. TrustBadgesPanel ───────────────────────────────────────────────────

// English `label` is the non-UI fallback; UI renders `t(meta.labelKey)`.
const BADGE_META: Record<TrustBadgeKind, { label: string; labelKey: string; emoji: string }> = {
  identity: { label: "Identity verified", labelKey: "dashboard.adminPhase7Drawers.badges.identity", emoji: "🪪" },
  background_check: { label: "Background check", labelKey: "dashboard.adminPhase7Drawers.badges.backgroundCheck", emoji: "🔍" },
  license: { label: "License verified", labelKey: "dashboard.adminPhase7Drawers.badges.license", emoji: "📜" },
  insurance: { label: "Insurance verified", labelKey: "dashboard.adminPhase7Drawers.badges.insurance", emoji: "🛡️" },
  social_account: { label: "Social account verified", labelKey: "dashboard.adminPhase7Drawers.badges.socialAccount", emoji: "🔗" },
  media_authentic: { label: "Media authentic", labelKey: "dashboard.adminPhase7Drawers.badges.mediaAuthentic", emoji: "📸" },
  agency_approved: { label: "Agency approved", labelKey: "dashboard.adminPhase7Drawers.badges.agencyApproved", emoji: "✅" },
};

const BADGE_STATUS_META = {
  pending: { color: T.amber, bg: T.amberSoft, label: "Pending", labelKey: "dashboard.adminPhase7Drawers.badgeStatus.pending" },
  verified: { color: T.accent, bg: T.accentSoft, label: "Verified", labelKey: "dashboard.adminPhase7Drawers.badgeStatus.verified" },
  rejected: { color: T.red, bg: T.redSoft, label: "Rejected", labelKey: "dashboard.adminPhase7Drawers.badgeStatus.rejected" },
  expired: { color: T.inkMuted, bg: T.surfaceAlt, label: "Expired", labelKey: "dashboard.adminPhase7Drawers.badgeStatus.expired" },
};

export function TrustBadgesPanel({
  talentProfileId,
}: {
  talentProfileId: string;
}) {
  const t = useT();
  const [badges, setBadges] = useState<TrustBadge[] | null>(null);
  const [loading, setLoading] = useState(false);

  const reload = async () => {
    setLoading(true);
    const res = await getTrustBadges({ talent_profile_id: talentProfileId });
    if (res.ok) setBadges(res.badges);
    setLoading(false);
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload closes over talentProfileId and stable setters; re-fetch when the talent changes
  }, [talentProfileId]);

  const handleVerify = async (badgeId: string) => {
    await updateTrustBadge({ badge_id: badgeId, status: "verified" });
    reload();
  };

  const handleReject = async (badgeId: string) => {
    const reason = prompt(t("dashboard.adminPhase7Drawers.rejectionReasonPrompt")) ?? undefined;
    await updateTrustBadge({ badge_id: badgeId, status: "rejected", notes: reason });
    reload();
  };

  const handleStartBadge = async (kind: TrustBadgeKind) => {
    await createTrustBadge({
      talent_profile_id: talentProfileId,
      badge_kind: kind,
      scope: "agency",
    });
    reload();
  };

  const allBadgeKinds: TrustBadgeKind[] = [
    "identity", "background_check", "license", "insurance",
    "social_account", "media_authentic", "agency_approved",
  ];

  const byKind = new Map<string, TrustBadge>();
  for (const b of badges ?? []) {
    if (!byKind.has(b.badge_kind) || b.status === "verified") {
      byKind.set(b.badge_kind, b);
    }
  }

  return (
    <div style={{ fontFamily: F_BODY }}>
      <div style={{
        fontSize: 13, color: T.ink, fontWeight: 600, marginBottom: 4,
      }}>{t("dashboard.adminPhase7Drawers.trustBadgesTitle")}</div>
      <div style={{
        fontSize: 11.5, color: T.inkMuted, marginBottom: 12, lineHeight: 1.5,
      }}>
        {t("dashboard.adminPhase7Drawers.trustBadgesHint")}
      </div>

      {loading && (
        <div style={{ color: T.inkMuted, fontSize: 12 }}>
          {t("dashboard.adminPhase7Drawers.loading")}
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        {allBadgeKinds.map((kind) => {
          const meta = BADGE_META[kind];
          const badge = byKind.get(kind);
          const statusMeta = badge ? BADGE_STATUS_META[badge.status] : null;
          return (
            <div key={kind} style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "10px 12px", borderRadius: 8,
              background: badge?.status === "verified" ? T.accentSoft : T.surface,
              border: `1px solid ${badge?.status === "verified" ? T.accent : T.border}`,
            }}>
              <span className="text-xl">{meta.emoji}</span>
              <div className="flex-1">
                <div style={{ fontSize: 12.5, fontWeight: 600, color: T.ink }}>
                  {t(meta.labelKey)}
                </div>
                {badge ? (
                  <div style={{ fontSize: 10.5, color: T.inkMuted, marginTop: 1 }}>
                    {interpolate(t("dashboard.adminPhase7Drawers.badgeSubmittedPending"), {
                      source: t(
                        badge.scope === "platform"
                          ? "dashboard.adminPhase7Drawers.badgeSourcePlatform"
                          : "dashboard.adminPhase7Drawers.badgeSourceAgency",
                      ),
                    })}
                    {badge.verified_at &&
                      interpolate(t("dashboard.adminPhase7Drawers.badgeVerifiedOn"), {
                        date: new Date(badge.verified_at).toLocaleDateString(),
                      })}
                    {badge.expires_at &&
                      interpolate(t("dashboard.adminPhase7Drawers.badgeExpiresOn"), {
                        date: new Date(badge.expires_at).toLocaleDateString(),
                      })}
                  </div>
                ) : (
                  <div style={{ fontSize: 10.5, color: T.inkMuted, marginTop: 1 }}>
                    {t("dashboard.adminPhase7Drawers.notStarted")}
                  </div>
                )}
              </div>
              {badge && statusMeta && (
                <span style={{
                  fontSize: 9.5, fontWeight: 700, padding: "3px 7px", borderRadius: 4,
                  background: statusMeta.bg, color: statusMeta.color,
                  letterSpacing: 0.4, textTransform: "uppercase",
                }}>{t(statusMeta.labelKey)}</span>
              )}
              {badge?.status === "pending" && (
                <>
                  <button type="button" onClick={() => handleVerify(badge.id)}
                    style={{
                      padding: "4px 10px", fontSize: 11, fontWeight: 600,
                      borderRadius: 6, border: "none",
                      background: T.accent, color: "#fff", cursor: "pointer",
                      fontFamily: F_BODY,
                    }}>{t("dashboard.adminPhase7Drawers.verify")}</button>
                  <button type="button" onClick={() => handleReject(badge.id)}
                    style={{
                      padding: "4px 10px", fontSize: 11, fontWeight: 600,
                      borderRadius: 6, border: `1px solid ${T.border}`,
                      background: T.surface, color: T.red, cursor: "pointer",
                      fontFamily: F_BODY,
                    }}>{t("dashboard.adminPhase7Drawers.reject")}</button>
                </>
              )}
              {!badge && (
                <button type="button" onClick={() => handleStartBadge(kind)}
                  style={{
                    padding: "4px 10px", fontSize: 11, fontWeight: 600,
                    borderRadius: 6, border: `1px dashed ${T.border}`,
                    background: T.surface, color: T.inkMuted, cursor: "pointer",
                    fontFamily: F_BODY,
                  }}>{t("dashboard.adminPhase7Drawers.startBadge")}</button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── 4. RequestPermissionButton — agency-side trigger ──────────────────────
//
// Shown when an agency tries to add a CLAIMED talent to their roster but
// doesn't yet have a data grant. Opens a small inline form to compose the
// permission request.

export function RequestPermissionButton({
  talentProfileId,
  talentName,
  onRequested,
}: {
  talentProfileId: string;
  talentName: string;
  onRequested?: () => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [scopes, setScopes] = useState<Set<DataScope>>(new Set([
    "identity", "media", "service_areas", "availability",
  ]));
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allScopes: DataScope[] = [
    "identity", "media", "rates", "service_areas",
    "availability", "documents", "physical", "experience",
  ];

  const toggleScope = (s: DataScope) => {
    setScopes((prev) => {
      const n = new Set(prev);
      if (n.has(s)) n.delete(s);
      else n.add(s);
      return n;
    });
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    const res = await createPermissionRequest({
      talent_profile_id: talentProfileId,
      requested_scopes: Array.from(scopes),
      request_message: message || null,
    });
    setSubmitting(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setOpen(false);
    onRequested?.();
  };

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        style={{
          padding: "8px 14px", fontSize: 12, fontWeight: 600,
          borderRadius: 8, border: `1px solid ${T.accent}`,
          background: T.accent, color: "#fff", cursor: "pointer",
          fontFamily: F_BODY,
        }}>{interpolate(t("dashboard.adminPhase7Drawers.requestAccessTo"), { talentName })}</button>
    );
  }

  return (
    <div style={{
      padding: 14, borderRadius: 10,
      background: T.surface, border: `1px solid ${T.border}`,
      fontFamily: F_BODY,
    }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: T.ink, marginBottom: 8 }}>
        {interpolate(t("dashboard.adminPhase7Drawers.requestAccessToData"), { talentName })}
      </div>
      <div style={{ fontSize: 11.5, color: T.inkMuted, marginBottom: 10, lineHeight: 1.4 }}>
        {t("dashboard.adminPhase7Drawers.requestAccessHint")}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
        {allScopes.map((s) => {
          const meta = SCOPE_META[s];
          const on = scopes.has(s);
          return (
            <button key={s} type="button" onClick={() => toggleScope(s)}
              style={{
                padding: "5px 10px", fontSize: 11, fontWeight: 600,
                borderRadius: 999, cursor: "pointer",
                background: on ? T.accent : T.surface,
                color: on ? "#fff" : T.ink,
                border: `1px solid ${on ? T.accent : T.border}`,
                fontFamily: F_BODY,
              }}>
              {meta.emoji} {t(meta.labelKey)}
            </button>
          );
        })}
      </div>

      <textarea value={message} onChange={(e) => setMessage(e.target.value)}
        placeholder={t("dashboard.adminPhase7Drawers.optionalMessagePlaceholder")}
        rows={3}
        style={{
          width: "100%", padding: 10, borderRadius: 8,
          border: `1px solid ${T.border}`, fontSize: 12,
          fontFamily: F_BODY, resize: "vertical",
          marginBottom: 10,
        }}/>

      {error && (
        <div style={{
          padding: 8, borderRadius: 6, background: T.redSoft,
          border: `1px solid ${T.red}`, fontSize: 11.5, color: T.ink, marginBottom: 8,
        }}>{error}</div>
      )}

      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
        <button type="button" disabled={submitting} onClick={() => setOpen(false)}
          style={{
            padding: "6px 12px", fontSize: 12, fontWeight: 600,
            borderRadius: 6, border: `1px solid ${T.border}`,
            background: T.surface, color: T.inkMuted, cursor: "pointer",
            fontFamily: F_BODY,
          }}>{t("dashboard.adminPhase7Drawers.cancel")}</button>
        <button type="button" disabled={submitting || scopes.size === 0} onClick={handleSubmit}
          style={{
            padding: "6px 14px", fontSize: 12, fontWeight: 600,
            borderRadius: 6, border: "none",
            background: scopes.size === 0 ? T.inkMuted : T.accent,
            color: "#fff", cursor: scopes.size === 0 ? "not-allowed" : "pointer",
            fontFamily: F_BODY,
          }}>
          {submitting
            ? t("dashboard.adminPhase7Drawers.sending")
            : interpolate(t("dashboard.adminPhase7Drawers.sendRequestNScopes"), {
                count: scopes.size,
              })}
        </button>
      </div>
    </div>
  );
}
