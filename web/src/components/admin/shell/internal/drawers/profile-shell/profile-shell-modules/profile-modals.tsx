// Phase-1f decomp — InviteClaimBanner · ViewAsClientModal · DiffEntry +
// ProfileDiffModal + computeProfileDiff · PublishCelebrationModal +
// celebrationBtnStyle · ProfileOwnershipPanel.  Byte-for-byte.
"use client";
import React, { useState } from "react";
import { ClaimInvitedState } from "./claim-link-panel";
import {
  COLORS,
  FIELD_CATALOG,
  FONTS,
  FieldRow,
  LocaleBio,
  PROTO_TENANT_ID,
  ProfileLanguage,
  ServiceArea,
  TALENT_TRUST_META,
  TaxonomyChild,
  TaxonomyParent,
  TextInput,
  ToggleControl,
  TrustTier,
  applyWorkspaceFieldOverride,
  sendTalentClaimInvite,
  useAdminShell,
  useDashboardText,
  useWorkspaceFieldOverrideSubscription,
} from "../../drawer-shared";
import {
  ProfileState,
  findChild,
} from "./profile-state";

export function InviteClaimBanner({ stageName, onResend, onTakeOver }: {
  stageName: string;
  onResend: () => void;
  onTakeOver: () => void;
}) {
  const copy = useDashboardText();
  return (
    <div style={{ padding: "10px 18px", borderBottom: `1px solid ${COLORS.amberDeep}30`, display: "flex", alignItems: "center", gap: 10, fontFamily: FONTS.body, flexShrink: 0 }} className="bg-admin-amber-soft">
      <span style={{
        width: 22, height: 22, borderRadius: "50%",
        background: COLORS.amberDeep, color: "#fff",
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        fontSize: 12, flexShrink: 0,
      }}>📧</span>
      <div className="flex-1 min-w-0">
        <div className="text-admin-amber-deep text-admin-12h font-semibold">
          {copy.t("Waiting on {name} to claim this profile").replace("{name}", stageName || copy.t("talent"))}
        </div>
        <div style={{ fontSize: 11, marginTop: 1 }} className="text-admin-ink-muted">
          {copy.t("Invite sent 3 days ago. They'll review, edit, and approve before publish.")}
        </div>
      </div>
      <button type="button" onClick={onResend} style={{
        padding: "6px 12px", borderRadius: 999,
        border: `1px solid ${COLORS.amberDeep}40`, background: "#fff",
        color: COLORS.amberDeep, fontSize: 11.5, fontWeight: 600, cursor: "pointer",
      }}>{copy.t("Resend")}</button>
      <button type="button" onClick={onTakeOver} style={{
        padding: "6px 12px", borderRadius: 999, border: "none",
        background: COLORS.amberDeep, color: "#fff",
        fontSize: 11.5, fontWeight: 600, cursor: "pointer",
      }}>{copy.t("Take over")}</button>
    </div>
  );
}

// ── View-as-client modal ─────────────────────────────────────────────

export function ViewAsClientModal({ stageName, tagline, primaryRes, secondaryTypes, specialties, serviceArea, photos, languages, trust, bios, onClose }: {
  stageName: string;
  tagline: string;
  primaryRes: { parent: TaxonomyParent; child: TaxonomyChild } | null;
  secondaryTypes: string[];
  specialties: string[];
  serviceArea: ServiceArea;
  photos: string[];
  languages: ProfileLanguage[];
  trust: TrustTier;
  bios: LocaleBio[];
  onClose: () => void;
}) {
  const { bridgeTenantIdentity, effectiveTenant } = useAdminShell();
  const copy = useDashboardText();
  const workspaceScopeTenantId =
    bridgeTenantIdentity?.tenantId
    ?? bridgeTenantIdentity?.slug
    ?? effectiveTenant.slug
    ?? PROTO_TENANT_ID;
  // Phase E follow-up — public preview honors catalog visibility +
  // workspace overrides. A field renders ONLY if its catalog entry's
  // resolved `defaultVisibility` includes "public" (or `showInPublic`
  // is true). Talent + admin can flip these via Workspace Field
  // Settings; this modal updates immediately via the subscription.
  useWorkspaceFieldOverrideSubscription();
  const isPublic = (catalogId: string, fallback = false): boolean => {
    const entry = FIELD_CATALOG.find(f => f.id === catalogId);
    if (!entry) return fallback;
    const resolved = applyWorkspaceFieldOverride(entry, workspaceScopeTenantId);
    if (!resolved.enabled) return false;
    if (resolved.showInPublic === true) return true;
    if (resolved.showInPublic === false) return false;
    return resolved.defaultVisibility?.includes("public") ?? fallback;
  };
  const showTagline       = isPublic("identity.tagline", true);
  const showSecondaries   = isPublic("identity.tagline", true); // grouped under tagline gating
  const showSpecialties   = true; // specialties live on talent type taxonomy, not a single catalog field
  const showBio           = isPublic("bios", true);
  const showLanguages     = isPublic("languages", true);
  const showLocation      = isPublic("serviceArea.homeBase", true);

  const trustMeta = TALENT_TRUST_META[trust];
  const enBio = bios.find(b => b.locale === "en")?.text ?? "";
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 220,
      background: "rgba(11,11,13,0.55)", backdropFilter: "blur(10px)",
      display: "flex", alignItems: "flex-end", justifyContent: "center",
      fontFamily: FONTS.body,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: "100%", maxWidth: 480, maxHeight: "95vh",
        background: "#fff", borderRadius: "20px 20px 0 0",
        boxShadow: "0 -10px 40px -8px rgba(11,11,13,0.35)",
        overflowY: "auto",
      }}>
        <div className="relative">
          <div style={{ aspectRatio: "4 / 3.5", background: photos[0]
              ? `url(${photos[0]}) center/cover, ${COLORS.surfaceAlt}`
              : COLORS.surfaceAlt, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 36 }} className="text-admin-ink-muted">{!photos[0] && "📷"}</div>
          <button type="button" onClick={onClose} aria-label={copy.t("Close")} style={{
            position: "absolute", top: 12, right: 12,
            width: 34, height: 34, borderRadius: "50%",
            background: "rgba(255,255,255,0.92)", border: "none", cursor: "pointer",
            color: COLORS.ink, fontSize: 16, lineHeight: 1, fontWeight: 600,
          }}>✕</button>
          <div style={{
            position: "absolute", top: 12, left: 12,
            padding: "5px 12px", borderRadius: 999,
            background: "rgba(11,11,13,0.65)", color: "#fff",
            backdropFilter: "blur(8px)",
            fontSize: 10.5, fontWeight: 600,
          }}>👁 {copy.t("Client preview")}</div>
        </div>
        <div style={{ padding: "16px 22px 24px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
            <h2 style={{ margin: 0, fontFamily: FONTS.display, fontSize: 22, fontWeight: 700, letterSpacing: -0.3, lineHeight: 1.1 }} className="text-admin-ink">{stageName || copy.t("Untitled profile")}</h2>
            <span style={{
              fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 999,
              background: trustMeta.bg, color: trustMeta.fg,
            }}>{trustMeta.emoji} {trustMeta.label}</span>
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }} className="text-admin-accent-deep">
            {primaryRes ? primaryRes.child.label : "—"}
          </div>
          {showTagline && tagline && (
            <div style={{ fontSize: 12.5, fontStyle: "italic", marginBottom: 6 }} className="text-admin-ink-muted">
              {tagline}
            </div>
          )}
          {showLocation && (
            <div style={{ fontSize: 12, marginBottom: 10 }} className="text-admin-ink-muted">
              📍 {[serviceArea.homeBase, ...serviceArea.serviceCities].filter(Boolean).slice(0, 4).join(" · ") || "—"}
            </div>
          )}
          {showSecondaries && secondaryTypes.length > 0 && (
            <div style={{ fontSize: 11.5, marginBottom: 8 }} className="text-admin-ink-muted">
              {copy.t("Also available as:")} {secondaryTypes.map(id => findChild(id)?.child.label).filter(Boolean).join(" · ")}
            </div>
          )}
          {showSpecialties && specialties.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 12 }}>
              {specialties.slice(0, 8).map(s => (
                <span key={s} style={{
                  fontSize: 10.5, fontWeight: 500, padding: "2px 9px", borderRadius: 999,
                  background: COLORS.indigoSoft, color: COLORS.indigoDeep,
                }}>{s}</span>
              ))}
            </div>
          )}
          {showBio && enBio && (
            <p style={{ fontSize: 13, lineHeight: 1.55, marginTop: 8, marginBottom: 12 }} className="text-admin-ink">
              {enBio}
            </p>
          )}
          {photos.length > 1 && (
            <div style={{
              display: "flex", gap: 6, marginRight: -22, paddingRight: 22, marginTop: 4,
              overflowX: "auto", scrollbarWidth: "none",
            }}>
              {photos.slice(1, 8).map((p, i) => (
                <div key={i} style={{
                  flexShrink: 0,
                  width: 96, aspectRatio: "3 / 4", borderRadius: 8,
                  background: `url(${p}) center/cover, ${COLORS.surfaceAlt}`,
                }} />
              ))}
            </div>
          )}
          {showLanguages && languages.length > 0 && (
            <div style={{ marginTop: 14, fontSize: 11.5 }} className="text-admin-ink-muted">
              <strong className="text-admin-ink">{copy.t("Languages")} · </strong>
              {languages.map(l => `${l.language} (${l.level})`).join(" · ")}
            </div>
          )}
        </div>
        <div style={{
          padding: "12px 22px max(14px, env(safe-area-inset-bottom)) 22px",
          borderTop: `1px solid ${COLORS.borderSoft}`,
          display: "flex", gap: 8, alignItems: "center",
        }}>
          <button type="button" onClick={onClose} style={{
            padding: "11px 16px", borderRadius: 999,
            border: `1px solid ${COLORS.border}`, background: "#fff",
            color: COLORS.ink,
            fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}>{copy.t("Close preview")}</button>
          <div style={{ flex: 1, padding: "12px 18px", borderRadius: 999, color: "#fff", fontSize: 13.5, fontWeight: 600, textAlign: "center" }} className="bg-admin-fill">
            {copy.t("Send inquiry")}
          </div>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// ProfileDiffModal — used by both:
//   #15 Admin diff view (admin reviews talent's pending self-edit)
//   #18 Talent preview (talent sees own changes before submitting)
// ════════════════════════════════════════════════════════════════════

export type DiffEntry = { fieldId: string; fieldLabel: string; before: string; after: string };

export function ProfileDiffModal({ entries, mode, onClose, onApproveAll, onRejectAll, onApplyDecisions, onSubmit }: {
  entries: DiffEntry[];
  mode: "admin" | "talent";
  onClose: () => void;
  onApproveAll?: () => void;
  onRejectAll?: () => void;
  /** Per-field commit. Keys are field ids; missing entries are treated as approved.
   *  Called when admin presses "Apply decisions". */
  onApplyDecisions?: (rejected: Set<string>) => void;
  onSubmit?: () => void;
}) {
  const copy = useDashboardText();
  const isAdmin = mode === "admin";
  // Per-field decisions tracked internally. "rejected" means revert to `before`,
  // "approved" / undecided means accept talent's submission.
  const [decisions, setDecisions] = useState<Map<string, "approved" | "rejected">>(new Map());
  const setDecision = (id: string, d: "approved" | "rejected") =>
    setDecisions(m => { const next = new Map(m); next.set(id, d); return next; });
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 250,
      background: "rgba(11,11,13,0.55)", backdropFilter: "blur(10px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: FONTS.body,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: "100%", maxWidth: 560, maxHeight: "92vh",
        background: "#fff", borderRadius: 16,
        display: "flex", flexDirection: "column", overflow: "hidden",
        boxShadow: "0 30px 60px -10px rgba(11,11,13,0.4)",
      }}>
        <div style={{
          padding: "16px 20px", borderBottom: `1px solid ${COLORS.borderSoft}`,
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <div className="flex-1">
            <h2 style={{ margin: 0, fontFamily: FONTS.display, fontSize: 18, fontWeight: 700, letterSpacing: -0.2 }} className="text-admin-ink">{isAdmin ? copy.t("Review changes") : copy.t("What you've changed")}</h2>
            <p style={{ margin: "3px 0 0", fontSize: 12, lineHeight: 1.4 }} className="text-admin-ink-muted">
              {entries.length === 0
                ? copy.t("No changes since the last published version.")
                : (isAdmin
                    ? copy.t(entries.length === 1 ? "{count} field modified by talent." : "{count} fields modified by talent.")
                    : copy.t(entries.length === 1 ? "{count} field you've changed." : "{count} fields you've changed.")).replace("{count}", String(entries.length))}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label={copy.t("Close")} style={{
            width: 28, height: 28, borderRadius: 8, border: "none",
            background: "transparent", color: COLORS.inkMuted,
            fontSize: 14, lineHeight: 1, cursor: "pointer",
          }}>✕</button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 20px" }}>
          {entries.length === 0 ? (
            <div style={{ padding: "30px 20px", textAlign: "center", fontSize: 13 }} className="text-admin-ink-muted">
              <div style={{ fontSize: 32, marginBottom: 8 }}>✓</div>
              {copy.t("All clear, nothing has changed.")}
            </div>
          ) : (
            <div className="flex flex-col gap-3.5">
              {entries.map(e => (
                <div key={e.fieldId} style={{
                  padding: 12, borderRadius: 10,
                  background: COLORS.surface, border: `1px solid ${COLORS.borderSoft}`,
                }}>
                  <div style={{
                    display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8,
                    marginBottom: 6,
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase" }} className="text-admin-ink-muted">
                      {copy.t(e.fieldLabel)}
                    </div>
                    {isAdmin && (() => {
                      const d = decisions.get(e.fieldId);
                      return (
                        <div className="inline-flex gap-1">
                          <button type="button" onClick={() => setDecision(e.fieldId, "rejected")}
                            aria-pressed={d === "rejected"}
                            style={{
                              padding: "3px 9px", borderRadius: 999,
                              border: `1px solid ${d === "rejected" ? COLORS.red : "rgba(176,48,58,0.30)"}`,
                              background: d === "rejected" ? COLORS.red : "rgba(176,48,58,0.06)",
                              color: d === "rejected" ? "#fff" : COLORS.red,
                              fontSize: 10.5, fontWeight: 600, cursor: "pointer",
                          }}>✕ {copy.t("Reject")}</button>
                          <button type="button" onClick={() => setDecision(e.fieldId, "approved")}
                            aria-pressed={d === "approved"}
                            style={{
                              padding: "3px 9px", borderRadius: 999,
                              border: `1px solid ${d === "approved" ? COLORS.successDeep : "rgba(46,125,91,0.30)"}`,
                              background: d === "approved" ? COLORS.successDeep : COLORS.successSoft,
                              color: d === "approved" ? "#fff" : COLORS.successDeep,
                              fontSize: 10.5, fontWeight: 600, cursor: "pointer",
                          }}>✓ {copy.t("Approve")}</button>
                        </div>
                      );
                    })()}
                  </div>
                  <div className="flex flex-col gap-1">
                    {e.before && (
                      <div style={{ padding: "8px 10px", borderRadius: 8, background: "rgba(176,48,58,0.06)", borderLeft: `3px solid rgba(176,48,58,0.4)`, fontSize: 12.5, lineHeight: 1.4, textDecoration: "line-through" }} className="text-admin-ink-muted">{e.before}</div>
                    )}
                    {e.after && (
                      <div style={{ padding: "8px 10px", borderRadius: 8, borderLeft: `3px solid ${COLORS.successDeep}`, fontSize: 12.5, lineHeight: 1.4, fontWeight: 500 }} className="bg-admin-success-soft text-admin-ink">{e.after}</div>
                    )}
                    {!e.before && (
                      <div style={{ fontSize: 10.5, fontStyle: "italic", marginTop: -2 }} className="text-admin-ink-dim">
                        {copy.t("+ new field")}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div style={{
          padding: "12px 20px",
          borderTop: `1px solid ${COLORS.borderSoft}`,
          display: "flex", gap: 8, alignItems: "center", justifyContent: "flex-end",
        }}>
          <button type="button" onClick={onClose} style={{
            padding: "9px 14px", borderRadius: 999,
            border: `1px solid ${COLORS.border}`, background: "#fff", color: COLORS.ink,
            fontFamily: FONTS.body, fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}>{isAdmin ? copy.t("Close") : copy.t("Keep editing")}</button>
          {isAdmin && entries.length > 0 && (() => {
            const rejected = new Set([...decisions.entries()].filter(([, v]) => v === "rejected").map(([k]) => k));
            const approved = new Set([...decisions.entries()].filter(([, v]) => v === "approved").map(([k]) => k));
            const hasMixed = rejected.size > 0 || approved.size > 0;
            const allRejected = rejected.size === entries.length;
            const allApproved = approved.size === entries.length;
            // Mixed decisions → show "Apply N decisions"
            if (hasMixed && !allRejected && !allApproved) {
              return (
                <button type="button" onClick={() => onApplyDecisions?.(rejected)} style={{
                  padding: "9px 16px", borderRadius: 999, border: "none",
                  background: COLORS.fill, color: "#fff",
                  fontFamily: FONTS.body, fontSize: 13, fontWeight: 600, cursor: "pointer",
                }}>{copy.t("Apply · approve {approved} · reject {rejected}").replace("{approved}", String(approved.size)).replace("{rejected}", String(rejected.size))}{decisions.size < entries.length ? ` · ${copy.t("{count} pending").replace("{count}", String(entries.length - decisions.size))}` : ""}</button>
              );
            }
            return (
              <>
                {onRejectAll && (
                  <button type="button" onClick={onRejectAll} style={{
                    padding: "9px 14px", borderRadius: 999,
                    border: `1px solid rgba(176,48,58,0.30)`, background: "#fff", color: COLORS.red,
                    fontFamily: FONTS.body, fontSize: 13, fontWeight: 600, cursor: "pointer",
                  }}>{copy.t("Reject all")}</button>
                )}
                {onApproveAll && (
                  <button type="button" onClick={onApproveAll} style={{
                    padding: "9px 16px", borderRadius: 999, border: "none",
                    background: COLORS.fill, color: "#fff",
                    fontFamily: FONTS.body, fontSize: 13, fontWeight: 600, cursor: "pointer",
                  }}>{copy.t("Approve all")}</button>
                )}
              </>
            );
          })()}
          {!isAdmin && onSubmit && entries.length > 0 && (
            <button type="button" onClick={onSubmit} style={{
              padding: "9px 16px", borderRadius: 999, border: "none",
              background: COLORS.fill, color: "#fff",
              fontFamily: FONTS.body, fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}>{copy.t("Submit for review")}</button>
          )}
        </div>
      </div>
    </div>
  );
}

// Compute changes between two ProfileState snapshots.

export function computeProfileDiff(before: ProfileState | null, after: ProfileState): DiffEntry[] {
  if (!before) {
    const out: DiffEntry[] = [];
    if (after.identity.stageName) out.push({ fieldId: "stageName", fieldLabel: "Stage name", before: "", after: after.identity.stageName });
    if (after.primaryType) {
      const p = findChild(after.primaryType);
      out.push({ fieldId: "primaryType", fieldLabel: "Primary Talent Type", before: "", after: p?.child.label ?? after.primaryType });
    }
    return out;
  }
  const out: DiffEntry[] = [];
  if (before.identity.stageName !== after.identity.stageName) {
    out.push({ fieldId: "stageName", fieldLabel: "Stage name", before: before.identity.stageName, after: after.identity.stageName });
  }
  if (before.tagline !== after.tagline) {
    out.push({ fieldId: "tagline", fieldLabel: "Tagline", before: before.tagline, after: after.tagline });
  }
  if (before.primaryType !== after.primaryType) {
    const b = before.primaryType ? findChild(before.primaryType)?.child.label ?? before.primaryType : "—";
    const a = after.primaryType ? findChild(after.primaryType)?.child.label ?? after.primaryType : "—";
    out.push({ fieldId: "primaryType", fieldLabel: "Primary Talent Type", before: b, after: a });
  }
  if (JSON.stringify([...before.secondaryTypes].sort()) !== JSON.stringify([...after.secondaryTypes].sort())) {
    out.push({
      fieldId: "secondaryTypes", fieldLabel: "Secondary roles",
      before: before.secondaryTypes.map(id => findChild(id)?.child.label ?? id).join(" · "),
      after: after.secondaryTypes.map(id => findChild(id)?.child.label ?? id).join(" · "),
    });
  }
  const bBio = before.bios.find(b => b.locale === before.bioActiveLocale)?.text ?? "";
  const aBio = after.bios.find(b => b.locale === after.bioActiveLocale)?.text ?? "";
  if (bBio !== aBio) {
    out.push({ fieldId: "bio", fieldLabel: "Bio", before: bBio, after: aBio });
  }
  if (before.serviceArea.homeBase !== after.serviceArea.homeBase) {
    out.push({ fieldId: "homeBase", fieldLabel: "Home base", before: before.serviceArea.homeBase, after: after.serviceArea.homeBase });
  }
  if (JSON.stringify(before.serviceArea.serviceCities) !== JSON.stringify(after.serviceArea.serviceCities)) {
    out.push({
      fieldId: "serviceCities", fieldLabel: "Service cities",
      before: before.serviceArea.serviceCities.join(" · "),
      after: after.serviceArea.serviceCities.join(" · "),
    });
  }
  if (JSON.stringify(before.languages) !== JSON.stringify(after.languages)) {
    out.push({
      fieldId: "languages", fieldLabel: "Languages",
      before: before.languages.map(l => `${l.language} (${l.level})`).join(" · "),
      after: after.languages.map(l => `${l.language} (${l.level})`).join(" · "),
    });
  }
  const bPhotos = before.albumsPro.reduce((n, a) => n + a.items.length, 0);
  const aPhotos = after.albumsPro.reduce((n, a) => n + a.items.length, 0);
  if (bPhotos !== aPhotos) {
    out.push({ fieldId: "photos", fieldLabel: "Photos", before: `${bPhotos} photo${bPhotos === 1 ? "" : "s"}`, after: `${aPhotos} photo${aPhotos === 1 ? "" : "s"}` });
  }
  return out;
}

// #8 — Publish celebration modal. Pops the moment a profile goes live;
// gives the admin a share toolkit (copy link / QR / IG-story / PDF).

export function PublishCelebrationModal({ stageName, slug, tenantSlug, profileUrl: profileUrlProp, onClose, onCopyLink, onShare }: {
  stageName: string;
  slug: string;
  tenantSlug: string;
  profileUrl?: string; // REAL public URL (host + /t/<code>); slug fallback fabricates a non-route
  onClose: () => void;
  onCopyLink: () => void;
  onShare: () => void;
}) {
  const { toast } = useAdminShell();
  const copy = useDashboardText();
  const profileUrl = profileUrlProp ?? `https://tulala.digital/${tenantSlug}/t/${slug}`;
  // 2026 #8 — Web Share API. Triggers the native iOS / Android / desktop
  // share sheet (Messages, WhatsApp, AirDrop, Slack, etc). Falls back
  // to clipboard copy when the API isn't available (older browsers).
  const supportsShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const handleNativeShare = async () => {
    if (!supportsShare) {
      try { await navigator.clipboard.writeText(profileUrl); toast(copy.t("Link copied. Share sheet unavailable.")); }
      catch { toast(copy.t("Couldn't open share sheet")); }
      return;
    }
    try {
      await navigator.share({
        title: copy.t("{name} on Tulala").replace("{name}", stageName),
        text: copy.t("Check out {name}'s profile").replace("{name}", stageName),
        url: profileUrl,
      });
      onShare();
    } catch (err) {
      // User canceled the share sheet — silent.
      if ((err as DOMException)?.name !== "AbortError") {
        toast(copy.t("Share canceled"));
      }
    }
  };
  // Web Share Files (level 2) — for the "model card PDF" CTA. Detected
  // separately because Files-level support is narrower than basic share.
  const supportsShareFiles = supportsShare
    && typeof navigator !== "undefined"
    && typeof (navigator as Navigator & { canShare?: (data: ShareData) => boolean }).canShare === "function";
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 240,
      background: "rgba(11,11,13,0.55)", backdropFilter: "blur(10px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: FONTS.body,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: "100%", maxWidth: 420,
        background: "#fff", borderRadius: 18,
        padding: "26px 22px 20px",
        boxShadow: "0 30px 60px -10px rgba(11,11,13,0.4)",
        textAlign: "center",
      }}>
        <div style={{ fontSize: 42, lineHeight: 1, marginBottom: 8 }}>🎉</div>
        <h2 style={{ margin: 0, fontFamily: FONTS.display, fontSize: 22, fontWeight: 700, letterSpacing: -0.3, lineHeight: 1.15 }} className="text-admin-ink">{copy.t("{name} is live").replace("{name}", stageName || copy.t("Profile"))}</h2>
        <p style={{ margin: "6px 0 16px", fontSize: 13, lineHeight: 1.5 }} className="text-admin-ink-muted">{copy.t("Share the link, drop the QR in a deck, or send the model card.")}</p>
        {/* Link card */}
        <div style={{ padding: "10px 14px", borderRadius: 10, border: `1px solid ${COLORS.borderSoft}`, fontFamily: FONTS.mono, fontSize: 12, marginBottom: 14, textAlign: "left", overflowX: "auto" }} className="bg-admin-surface text-admin-ink">{profileUrl}</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
          <button type="button" onClick={() => {
            if (typeof navigator !== "undefined" && navigator.clipboard) {
              navigator.clipboard.writeText(profileUrl).then(() => onCopyLink()).catch(() => onCopyLink());
            } else { onCopyLink(); }
          }} style={celebrationBtnStyle()}>📋 {copy.t("Copy link")}</button>
          <button type="button" onClick={handleNativeShare} style={celebrationBtnStyle()}
            title={supportsShare ? copy.t("Open share sheet") : copy.t("Share sheet unavailable, will copy link")}
          >
            📲 {supportsShare ? copy.t("Share") : copy.t("Copy")}
          </button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
          <button type="button" onClick={onShare} style={celebrationBtnStyle()}>▦ {copy.t("QR code")}</button>
          <button type="button" onClick={onShare} style={celebrationBtnStyle()}
            title={supportsShareFiles ? copy.t("Share PDF via system sheet") : copy.t("Download PDF")}
          >📄 {copy.t("PDF model card")}</button>
        </div>
        <button type="button" onClick={onClose} style={{
          padding: "10px 18px", borderRadius: 999, border: "none",
          background: COLORS.fill, color: "#fff",
          fontFamily: FONTS.body, fontSize: 13, fontWeight: 600, cursor: "pointer",
          width: "100%",
        }}>{copy.t("Done")}</button>
      </div>
    </div>
  );
}

export function celebrationBtnStyle(): React.CSSProperties {
  return {
    padding: "9px 12px", borderRadius: 10,
    border: `1px solid ${COLORS.borderSoft}`, background: "#fff", color: COLORS.ink,
    fontFamily: FONTS.body, fontSize: 12, fontWeight: 600, cursor: "pointer",
  };
}

// Profile ownership panel — surfaced in the Profile Shell admin section.
// Drives the agency-managed → talent-claimed transition. Three states:
//   1. unclaimed (no invite sent) — admin has full control; offer to send
//   2. invited (claim email sent, not yet accepted) — show resent / cancel
//   3. claimed (talent owns it) — show co-edit settings + revoke option
//
// In production these states are stored on `talent_profiles.ownership`
// with timestamps. The prototype keeps it local for the demo.

export function ProfileOwnershipPanel({
  talentProfileId,
  talentName,
  contactEmail,
}: {
  talentProfileId?: string;
  talentName: string;
  contactEmail?: string;
}) {
  const { toast } = useAdminShell();
  const copy = useDashboardText();
  type OwnershipState = "unclaimed" | "invited" | "claimed";
  const [state, setState] = useState<OwnershipState>("unclaimed");
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [email, setEmail] = useState(contactEmail ?? "");
  const [phone, setPhone] = useState("");
  const [includePassword, setIncludePassword] = useState(false);

  // Co-edit permissions when claimed — admin still keeps oversight on
  // sensitive fields by default (rates, status).
  const [coEditPermissions, setCoEditPermissions] = useState({
    media: true,
    bio: true,
    languages: true,
    skills: true,
    rates: false,
    availability: true,
    status: false,
  });

  // The claim link the action hands back. Surfacing it is not a nicety: the
  // agency-entered contact details on a pre-launch roster are frequently
  // placeholders (live data: 13 of 47 Impronta addresses are unroutable, and
  // the rest were typed from memory), and SMS delivery is not wired. The link
  // is therefore the ONLY channel an admin can rely on — they paste it into
  // WhatsApp, which is how this roster actually communicates.
  const [inviteLink, setInviteLink] = useState<string | null>(null);

  /** Absolute, host-correct link an admin can paste anywhere. */
  const toAbsolute = (path: string) =>
    typeof window === "undefined" ? path : new URL(path, window.location.origin).toString();

  const runInvite = async (isResend: boolean) => {
    if (!email.trim() && !phone.trim()) {
      toast(copy.t("Add an email or phone first"));
      return;
    }
    if (!talentProfileId) return;
    const res = await sendTalentClaimInvite({
      talent_profile_id: talentProfileId,
      email: email.trim() || undefined,
      phone: phone.trim() || undefined,
      resend: isResend,
    });
    if (!res.ok) { toast(copy.t("Failed to send invite, try again")); return; }
    if (res.redeem_url) setInviteLink(toAbsolute(res.redeem_url));
    setState("invited");
    setShowInviteForm(false);
    toast(
      isResend
        ? copy.t("Resent claim invite to {contact}").replace("{contact}", email || phone)
        : copy.t("Claim invite sent to {contact}").replace("{contact}", email || phone),
    );
  };

  const sendInvite = () => runInvite(false);
  // Previously a toast and nothing else — no invite was ever re-issued. Now it
  // calls the same action, which revokes the prior pending invite and mints a
  // fresh one (see sendTalentClaimInvite).
  const resendInvite = () => runInvite(true);
  const cancelInvite = () => {
    setState("unclaimed");
    setInviteLink(null);
    toast(copy.t("Claim invite cancelled"));
  };
  const revoke = () => {
    setState("unclaimed");
    toast(copy.t("{name} ownership revoked, back to agency-managed").replace("{name}", talentName));
  };

  if (state === "unclaimed") {
    return (
      <div style={{ fontFamily: FONTS.body }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 11px", borderRadius: 999, background: "rgba(11,11,13,0.04)", fontSize: 12, marginBottom: 10, width: "fit-content" }} className="text-admin-ink-muted">
          <span style={{
            width: 6, height: 6, borderRadius: "50%",
            background: COLORS.inkMuted,
          }} />
          {copy.t("You own this profile · talent has no account yet")}
        </div>
        {!showInviteForm ? (
          <button type="button" onClick={() => setShowInviteForm(true)} style={{
            padding: "9px 14px", borderRadius: 999, border: "none",
            background: COLORS.fill, color: "#fff",
            fontFamily: FONTS.body, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
          }}>
            ✉ {copy.t("Send claim invite to {name}").replace("{name}", talentName)}
          </button>
        ) : (
          <div style={{
            background: "#fff", borderRadius: 12,
            border: `1.5px solid ${COLORS.accent}`,
            padding: 14,
          }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 10 }} className="text-admin-accent-deep">
              {copy.t("Send claim invite")}
            </div>
            <FieldRow label={copy.t("Email")} hint={copy.t("Talent receives a one-tap claim link.")}>
              <TextInput type="email" placeholder="talent@example.com"
                value={email} onChange={(e) => setEmail(e.target.value)} />
            </FieldRow>
            <FieldRow label={copy.t("Phone")} optional hint={copy.t("Recorded on the invite. Send the link yourself; SMS delivery is not switched on.")}>
              <TextInput type="text" placeholder="+34 612 345 678"
                value={phone} onChange={(e) => setPhone(e.target.value)} />
            </FieldRow>
            <FieldRow label={copy.t("One-time password")} optional>
              <ToggleControl value={includePassword} onChange={setIncludePassword}
                label={copy.t("Send a 6-digit code instead of a link · for talent without email")} />
            </FieldRow>
            <div style={{ padding: "8px 11px", borderRadius: 8, fontSize: 11.5, marginBottom: 12, lineHeight: 1.5 }} className="bg-admin-indigo-soft text-admin-indigo-deep">
              <strong>{copy.t("What happens next:")}</strong> {copy.t("{name} gets an email · clicks \"Claim my profile\" · creates a password · can edit any field you've enabled below. Your existing data stays, they just become the owner.").replace("{name}", talentName)}
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" onClick={() => setShowInviteForm(false)} style={{
                padding: "8px 14px", borderRadius: 999, border: `1px solid ${COLORS.border}`,
                background: "transparent", color: COLORS.ink,
                fontFamily: FONTS.body, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
              }}>{copy.t("Cancel")}</button>
              <button type="button" onClick={sendInvite} style={{
                padding: "8px 14px", borderRadius: 999, border: "none",
                background: COLORS.fill, color: "#fff",
                fontFamily: FONTS.body, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
              }}>{copy.t("Send invite")}</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (state === "invited") {
    return (
      <ClaimInvitedState
        contact={email || phone} talentName={talentName} inviteLink={inviteLink}
        t={copy.t} onToast={toast} onResend={resendInvite} onCancel={cancelInvite}
      />
    );
  }

  // claimed
  return (
    <div style={{ fontFamily: FONTS.body }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 11px", borderRadius: 999, fontSize: 12, marginBottom: 10, width: "fit-content", fontWeight: 600 }} className="bg-admin-success-soft text-admin-success-deep">
        <span style={{ width: 6, height: 6, borderRadius: "50%", }} />
        ✓ {copy.t("{name} owns this profile").replace("{name}", talentName)}
      </div>
      <div style={{
        background: "#fff", borderRadius: 10, border: `1px solid ${COLORS.borderSoft}`, padding: 12, marginBottom: 10 }} className="bg-admin-green">
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 8 }} className="text-admin-ink-muted">{copy.t("What talent can edit")}</div>
        <div className="flex flex-col gap-1.5">
          {([
            { key: "media",        label: "Photos + albums" },
            { key: "bio",          label: "Bio + tagline" },
            { key: "languages",    label: "Languages + skills" },
            { key: "skills",       label: "Skills + contexts" },
            { key: "availability", label: "Availability calendar" },
            { key: "rates",        label: "Rates + pricing", admin: true },
            { key: "status",       label: "Profile status (publish / hide)", admin: true },
          ] as const).map((p) => {
            const v = coEditPermissions[p.key];
            return (
              <label key={p.key} style={{
                display: "flex", alignItems: "center", gap: 10,
                cursor: "pointer", fontSize: 12.5, color: COLORS.ink,
              }}>
                <button type="button" onClick={() => setCoEditPermissions(c => ({ ...c, [p.key]: !v }))}
                  aria-pressed={v}
                  style={{
                    width: 32, height: 18, borderRadius: 999, border: "none", cursor: "pointer", padding: 0,
                    background: v ? COLORS.accent : "rgba(11,11,13,0.12)",
                    position: "relative", flexShrink: 0,
                  }}>
                  <span style={{
                    position: "absolute", top: 2, left: v ? 16 : 2,
                    width: 14, height: 14, borderRadius: "50%", background: "#fff",
                  }} />
                </button>
                <span>{copy.t(p.label)}</span>
                {"admin" in p && p.admin && (
                  <span style={{
                    fontSize: 9, fontWeight: 700, color: "#7A5A1F",
                    padding: "1px 6px", borderRadius: 999,
                    background: "rgba(184,135,49,0.14)",
                    textTransform: "uppercase", letterSpacing: 0.4,
                  }}>{copy.t("admin default")}</span>
                )}
              </label>
            );
          })}
        </div>
      </div>
      <div className="flex gap-2 flex-wrap">
        <button type="button" onClick={() => toast(copy.t("Sent {name} a notification").replace("{name}", talentName))} style={{
          padding: "8px 13px", borderRadius: 999, border: `1px solid ${COLORS.border}`,
          background: "transparent", color: COLORS.ink,
          fontFamily: FONTS.body, fontSize: 12, fontWeight: 600, cursor: "pointer",
        }}>✉ {copy.t("Message {name}").replace("{name}", talentName)}</button>
        <button type="button" onClick={revoke} style={{
          padding: "8px 13px", borderRadius: 999, border: `1px solid ${COLORS.border}`,
          background: "transparent", color: COLORS.red,
          fontFamily: FONTS.body, fontSize: 12, fontWeight: 600, cursor: "pointer",
        }}>↶ {copy.t("Revoke ownership")}</button>
      </div>
      <div style={{ fontSize: 11, marginTop: 8, lineHeight: 1.5 }} className="text-admin-ink-dim">
        {copy.t("Revoking returns the profile to agency-managed. Talent's account stays, but they lose edit access on this profile.")}
      </div>
    </div>
  );
}

