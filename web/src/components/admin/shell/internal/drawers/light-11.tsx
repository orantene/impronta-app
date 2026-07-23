"use client";

import React, { useState, useEffect, useRef, useMemo, useId, useTransition, useCallback, startTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  ActivityLogPanel,
  COLORS,
  DrawerShell,
  FONTS,
  PrimaryButton,
  ROSTER_AGENCY,
  ROSTER_FREE,
  SecondaryButton,
  StateChipMini,
  SubjectRiskScoreRow,
  VERIFICATION_TYPE_META,
  VR_STATUS_META,
  VerificationRequest,
  VerificationType,
  useAdminShell
} from "./drawer-shared";
import { useDashboardText } from "../dashboard-i18n";

// Phase 1d (remediation §4): 2 leaf drawer bodies, byte-for-byte from
// drawers.tsx; referenced ONLY by the DrawerSwitch barrel (zero cross-edges).

export function TrustVerificationQueueDrawer() {
  const { closeDrawer, verificationRequests, approveVerificationRequest, rejectVerificationRequest, updateVerificationRequest, toast, isVerificationMethodEnabled } = useAdminShell();
  const copy = useDashboardText();
  const tt = copy.t;
  type Tab = "all" | "submitted" | "in_review" | "needs_more_info" | "approved" | "rejected";
  const [activeTab, setActiveTab] = useState<Tab>("submitted");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [rejectReasonModal, setRejectReasonModal] = useState<{ id: string; talent: string } | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [search, setSearch] = useState("");
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set());
  const [methodFilter, setMethodFilter] = useState<VerificationType | "all">("all");

  const allRoster = useMemo(() => [...ROSTER_AGENCY, ...ROSTER_FREE], []);
  const talentNameForId = (id: string) => allRoster.find(t => t.id === id)?.name ?? id;

  const q = search.trim().toLowerCase();
  const filtered = verificationRequests.filter(r => {
    if (activeTab === "all") {
      // skip nothing on All tab
    } else if (activeTab === "submitted") {
      if (r.status !== "submitted" && r.status !== "pending_user_action") return false;
    } else if (r.status !== activeTab) {
      return false;
    }
    if (methodFilter !== "all" && r.verificationType !== methodFilter) return false;
    if (!q) return true;
    return talentNameForId(r.subjectId).toLowerCase().includes(q)
      || (r.claimedIdentifier ?? "").toLowerCase().includes(q)
      || (r.verificationCode ?? "").toLowerCase().includes(q)
      || r.verificationType.includes(q)
      || r.method.includes(q);
  }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const cur = activeId ? verificationRequests.find(r => r.id === activeId) ?? null : (filtered[0] ?? null);
  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: "submitted",       label: tt("Pending"),     count: verificationRequests.filter(r => r.status === "submitted" || r.status === "pending_user_action").length },
    { id: "in_review",       label: tt("In review"),   count: verificationRequests.filter(r => r.status === "in_review").length },
    { id: "needs_more_info", label: tt("Needs info"),  count: verificationRequests.filter(r => r.status === "needs_more_info").length },
    { id: "approved",        label: tt("Approved"),    count: verificationRequests.filter(r => r.status === "approved").length },
    { id: "rejected",        label: tt("Rejected"),    count: verificationRequests.filter(r => r.status === "rejected").length },
    { id: "all",             label: tt("All"),         count: verificationRequests.length },
  ];

  const talentNameFor = (id: string) => talentNameForId(id);

  const onApprove = (req: VerificationRequest) => {
    approveVerificationRequest(req.id);
    toast(copy.isSpanish
      ? `${VERIFICATION_TYPE_META[req.verificationType].label} aprobado para ${talentNameFor(req.subjectId)}`
      : `Approved ${VERIFICATION_TYPE_META[req.verificationType].label} for ${talentNameFor(req.subjectId)}`);
  };
  const onMarkInReview = (req: VerificationRequest) => {
    updateVerificationRequest(req.id, { status: "in_review" });
    toast(tt("Marked in review"));
  };
  const onRequestMoreInfo = (req: VerificationRequest) => {
    const msg = window.prompt(tt("What does the talent need to add or fix?"));
    if (!msg) return;
    updateVerificationRequest(req.id, { status: "needs_more_info", publicMessage: msg });
    toast(copy.isSpanish
      ? `Se le pidió más información a ${talentNameFor(req.subjectId)}`
      : `Asked ${talentNameFor(req.subjectId)} for more info`);
  };
  const startReject = (req: VerificationRequest) => {
    setRejectReason("");
    setRejectModalOpen(true);
    setRejectReasonModal({ id: req.id, talent: talentNameFor(req.subjectId) });
  };
  const [, setRejectModalOpen] = useState(false);
  const confirmReject = () => {
    if (!rejectReasonModal || !rejectReason.trim()) {
      toast(tt("Add a reason — talent will see it"));
      return;
    }
    rejectVerificationRequest(rejectReasonModal.id, rejectReason, rejectReason);
    toast(copy.isSpanish
      ? `Rechazado · motivo enviado a ${rejectReasonModal.talent}`
      : `Rejected — reason sent to ${rejectReasonModal.talent}`);
    setRejectReasonModal(null);
    setRejectReason("");
  };

  return (
    <>
      <DrawerShell
        open
        onClose={closeDrawer}
        title={tt("Trust & Verification queue")}
        description={copy.isSpanish
          ? `${verificationRequests.length} solicitudes en total · ${tabs[0].count} necesitan tu revisión`
          : `${verificationRequests.length} total requests · ${tabs[0].count} need your review`}
        width={760}
        footer={<SecondaryButton onClick={closeDrawer}>{tt("Close")}</SecondaryButton>}
      >
        {/* Tabs */}
        <div style={{
          display: "flex", gap: 4, padding: 4,
          background: "rgba(11,11,13,0.04)", borderRadius: 999,
          marginBottom: 14, overflowX: "auto", scrollbarWidth: "none",
        }}>
          {tabs.map(t => {
            const active = activeTab === t.id;
            return (
              <button key={t.id} type="button" onClick={() => { setActiveTab(t.id); setActiveId(null); }} style={{
                flexShrink: 0,
                padding: "6px 12px", borderRadius: 999, border: "none",
                background: active ? "#fff" : "transparent",
                color: active ? COLORS.ink : COLORS.inkMuted,
                fontFamily: FONTS.body, fontSize: 12, fontWeight: active ? 600 : 500,
                cursor: "pointer",
                boxShadow: active ? "0 1px 2px rgba(11,11,13,0.06)" : "none",
                display: "inline-flex", alignItems: "center", gap: 5,
              }}>
                {t.label}
                {t.count > 0 && (
                  <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 999, background: active ? "rgba(11,11,13,0.06)" : "rgba(11,11,13,0.08)", fontWeight: 700 }} className="text-admin-ink-muted">{t.count}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Toolbar: search + bulk actions */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
            <span aria-hidden style={{
              position: "absolute", top: "50%", left: 12, transform: "translateY(-50%)",
              color: COLORS.inkMuted, fontSize: 13, pointerEvents: "none",
            }}>⌕</span>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={tt("Search by name, IG handle, code, type…")}
              style={{
                width: "100%", boxSizing: "border-box",
                padding: "8px 30px 8px 32px", borderRadius: 999,
                border: `1px solid ${COLORS.borderSoft}`,
                fontFamily: FONTS.body, fontSize: 12.5,
                color: COLORS.ink, outline: "none", background: "#fff",
              }}
            />
            {search && (
              <button type="button" onClick={() => setSearch("")} aria-label={tt("Clear")} style={{
                position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)",
                width: 22, height: 22, borderRadius: "50%", border: "none",
                background: "rgba(11,11,13,0.06)", color: COLORS.inkMuted,
                fontSize: 12, lineHeight: 1, cursor: "pointer",
              }}>×</button>
            )}
          </div>
          <select value={methodFilter} onChange={(e) => setMethodFilter(e.target.value as VerificationType | "all")} style={{
            padding: "7px 10px", borderRadius: 999, border: `1px solid ${COLORS.borderSoft}`,
            background: "#fff", color: COLORS.ink, fontFamily: FONTS.body, fontSize: 12,
            cursor: "pointer",
          }}>
            <option value="all">{tt("All methods")}</option>
            {(["instagram_verified","tulala_verified","agency_confirmed","phone_verified","id_verified","business_verified","domain_verified","payment_verified"] as const)
              .filter(t => isVerificationMethodEnabled(t))
              .map(t => (
                <option key={t} value={t}>{VERIFICATION_TYPE_META[t].label}</option>
              ))}
          </select>
          {bulkSelected.size > 0 && (
            <>
              <span className="text-admin-ink-muted text-admin-11h font-medium">
                {bulkSelected.size} {tt("selected")}
              </span>
              <button type="button" onClick={() => {
                bulkSelected.forEach((id) => approveVerificationRequest(id));
                toast(copy.isSpanish
                  ? `${bulkSelected.size} solicitudes aprobadas`
                  : `Approved ${bulkSelected.size} requests`);
                setBulkSelected(new Set());
              }} style={{
                padding: "5px 11px", borderRadius: 999, border: "none",
                background: COLORS.accent, color: "#fff",
                fontFamily: FONTS.body, fontSize: 11.5, fontWeight: 600, cursor: "pointer",
              }}>{tt("Approve all")}</button>
              <button type="button" onClick={() => setBulkSelected(new Set())} style={{
                padding: "5px 11px", borderRadius: 999,
                background: "transparent", color: COLORS.inkMuted,
                border: `1px solid ${COLORS.borderSoft}`,
                fontFamily: FONTS.body, fontSize: 11.5, fontWeight: 500, cursor: "pointer",
              }}>{tt("Clear")}</button>
            </>
          )}
        </div>

        {/* Two-pane on desktop, stacked on mobile */}
        <div data-tulala-tvq-body style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: 14, minHeight: 400 }}>
          <style>{`
            @media (max-width: 760px) {
              [data-tulala-tvq-body] { grid-template-columns: 1fr !important; }
            }
          `}</style>
          {/* List */}
          <div style={{
            background: "#fff", border: `1px solid ${COLORS.borderSoft}`,
            borderRadius: 12, overflow: "hidden",
            display: "flex", flexDirection: "column",
          }}>
            {filtered.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", fontFamily: FONTS.body, fontSize: 12 }} className="text-admin-ink-muted">
                {tt("Nothing here.")}
              </div>
            ) : filtered.map((r, i) => {
              const isActive = (cur?.id) === r.id;
              const meta = VR_STATUS_META[r.status];
              const typeMeta = VERIFICATION_TYPE_META[r.verificationType];
              const isApprovable = r.status === "submitted" || r.status === "in_review" || r.status === "needs_more_info";
              const isSelected = bulkSelected.has(r.id);
              return (
                <div key={r.id} style={{
                  padding: "10px 12px",
                  background: isActive ? "rgba(15,79,62,0.04)" : "#fff",
                  borderTop: i === 0 ? "none" : `1px solid ${COLORS.borderSoft}`,
                  borderLeft: isActive ? `3px solid ${COLORS.accent}` : "3px solid transparent",
                  fontFamily: FONTS.body,
                  display: "flex", gap: 8, alignItems: "flex-start",
                }}>
                  {isApprovable && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setBulkSelected((s) => {
                          const next = new Set(s);
                          if (next.has(r.id)) next.delete(r.id); else next.add(r.id);
                          return next;
                        });
                      }}
                      aria-label={isSelected ? tt("Deselect") : tt("Select for bulk")}
                      style={{
                        width: 16, height: 16, borderRadius: 4, marginTop: 2,
                        border: `1.5px solid ${isSelected ? COLORS.accent : COLORS.borderSoft}`,
                        background: isSelected ? COLORS.accent : "#fff",
                        cursor: "pointer", padding: 0, flexShrink: 0,
                        display: "inline-flex", alignItems: "center", justifyContent: "center",
                      }}>
                      {isSelected && <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
                    </button>
                  )}
                  <button type="button" onClick={() => setActiveId(r.id)} style={{
                    flex: 1, minWidth: 0,
                    padding: 0, background: "transparent", border: "none",
                    cursor: "pointer", textAlign: "left",
                    fontFamily: FONTS.body, display: "flex", flexDirection: "column", gap: 4,
                  }}>
                    <div className="flex items-center gap-1.5">
                      <span style={{ fontSize: 13, fontWeight: 600, flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} className="text-admin-ink">
                        {talentNameFor(r.subjectId)}
                      </span>
                      <StateChipMini label={tt(meta.label)} tone={meta.tone} />
                    </div>
                    <div style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 6 }} className="text-admin-ink-muted">
                      <span>{typeMeta.emoji} {typeMeta.shortLabel}</span>
                      {r.claimedIdentifier && <span className="text-admin-ink-dim">· {r.claimedIdentifier}</span>}
                    </div>
                    <div className="text-admin-ink-dim text-admin-10h">
                      {new Date(r.createdAt).toLocaleDateString()} · {tt("code")} {r.verificationCode ?? "—"}
                    </div>
                  </button>
                </div>
              );
            })}
          </div>

          {/* Detail */}
          <div style={{
            background: "#fff", border: `1px solid ${COLORS.borderSoft}`,
            borderRadius: 12, padding: 16,
            fontFamily: FONTS.body,
          }}>
            {!cur ? (
              <div className="text-admin-ink-muted text-xs">{tt("Select a request to review.")}</div>
            ) : (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ fontFamily: FONTS.display, fontSize: 18, fontWeight: 600, letterSpacing: -0.2 }} className="text-admin-ink">
                    {talentNameFor(cur.subjectId)}
                  </span>
                  <StateChipMini label={tt(VR_STATUS_META[cur.status].label)} tone={VR_STATUS_META[cur.status].tone} />
                </div>
                <div style={{ fontSize: 12, marginBottom: 16 }} className="text-admin-ink-muted">
                  {VERIFICATION_TYPE_META[cur.verificationType].emoji} {VERIFICATION_TYPE_META[cur.verificationType].label}
                  {" · "}{tt("via")} {cur.method.replace(/_/g, " ")}
                </div>

                {/* Profile preview */}
                {cur.method === "instagram_dm" && (
                  <div style={{ padding: "12px 14px", borderRadius: 10, border: `1px solid ${COLORS.borderSoft}`, marginBottom: 14, fontFamily: FONTS.body }} className="bg-admin-surface">
                    <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: 0.4, marginBottom: 6, textTransform: "uppercase" }} className="text-admin-ink-muted">
                      {tt("What talent was instructed to do")}
                    </div>
                    <div style={{ fontSize: 12, lineHeight: 1.5 }} className="text-admin-ink">
                      {tt("Send a DM from")} <strong>{cur.claimedIdentifier ?? "(handle)"}</strong> {tt("to")} <strong>@tulala.digital</strong> {tt("with this code:")}
                    </div>
                    <div style={{ marginTop: 8, padding: "8px 12px", background: "#fff", borderRadius: 8, border: `1px solid ${COLORS.borderSoft}`, fontFamily: FONTS.mono ?? FONTS.body, fontSize: 14, fontWeight: 700, textAlign: "center", letterSpacing: 1 }} className="text-admin-ink">{cur.verificationCode ?? "—"}</div>
                    <div style={{ marginTop: 8, fontSize: 11 }} className="text-admin-ink-muted">
                      {tt("Profile:")} <a href={cur.targetUrl ?? "#"} style={{ color: COLORS.accentDeep, textDecoration: "none" }}>{cur.targetUrl ?? "—"}</a>
                    </div>
                    <div style={{ marginTop: 6, fontSize: 11 }} className="text-admin-ink-dim">
                      {tt("Manual review: confirm DM was received, sender matches handle, code matches.")}
                    </div>
                  </div>
                )}

                {cur.method === "manual_review" && (
                  <div style={{ padding: "12px 14px", borderRadius: 10, border: `1px solid ${COLORS.borderSoft}`, marginBottom: 14, fontSize: 12, lineHeight: 1.5 }} className="bg-admin-surface text-admin-ink">
                    <strong>{tt("Manual review.")}</strong> {tt("Open the profile and confirm: 3+ photos, bio, primary type, no suspicious content.")}
                  </div>
                )}

                {(cur.evidenceUrl || cur.evidenceNote) && (
                  <div style={{
                    marginBottom: 14, padding: "10px 12px", borderRadius: 10,
                    background: "#fff", border: `1px solid ${COLORS.borderSoft}`,
                  }}>
                    <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 6 }} className="text-admin-ink-dim">{tt("Evidence from talent")}</div>
                    {cur.evidenceUrl && (
                      <div style={{ marginBottom: cur.evidenceNote ? 6 : 0, fontSize: 12 }}>
                        <a href={cur.evidenceUrl} target="_blank" rel="noopener noreferrer" style={{
                          color: COLORS.accentDeep, textDecoration: "none", fontWeight: 600, wordBreak: "break-all",
                        }}>
                          ↗ {cur.evidenceUrl}
                        </a>
                      </div>
                    )}
                    {cur.evidenceNote && (
                      <div style={{ fontSize: 12, lineHeight: 1.5, whiteSpace: "pre-wrap" }} className="text-admin-ink">
                        {cur.evidenceNote}
                      </div>
                    )}
                  </div>
                )}

                {cur.publicMessage && (
                  <div style={{ marginBottom: 14, fontSize: 11.5 }} className="text-admin-ink-muted">
                    <strong>{tt("Public message:")}</strong> {cur.publicMessage}
                  </div>
                )}
                {cur.adminNotes && (
                  <div style={{ marginBottom: 14, padding: "8px 11px", borderRadius: 8, fontSize: 11.5, lineHeight: 1.5 }} className="bg-admin-amber-soft text-admin-amber-deep">
                    <strong>{tt("Admin notes:")}</strong> {cur.adminNotes}
                  </div>
                )}

                {/* Risk/health score for the subject — admin-only signal. */}
                <SubjectRiskScoreRow subjectType={cur.subjectType} subjectId={cur.subjectId} />

                {/* Activity log — derived from request lifecycle fields. */}
                <ActivityLogPanel request={cur} />

                {/* Decision panel */}
                {(cur.status === "submitted" || cur.status === "in_review" || cur.status === "needs_more_info") && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 16 }}>
                    {cur.status !== "in_review" && (
                      <SecondaryButton onClick={() => onMarkInReview(cur)}>{tt("Mark in review")}</SecondaryButton>
                    )}
                    <SecondaryButton onClick={() => onRequestMoreInfo(cur)}>{tt("Request more info")}</SecondaryButton>
                    <SecondaryButton onClick={() => startReject(cur)}>{tt("Reject")}</SecondaryButton>
                    <PrimaryButton onClick={() => onApprove(cur)}>{tt("Approve")}</PrimaryButton>
                  </div>
                )}
                {cur.status === "approved" && cur.reviewedAt && (
                  <div style={{ padding: "10px 12px", borderRadius: 10, marginTop: 16, fontSize: 12, fontWeight: 600 }} className="bg-admin-success-soft text-admin-success-deep">
                    ✓ {tt("Approved")} · {new Date(cur.reviewedAt).toLocaleString()}
                  </div>
                )}
                {cur.status === "rejected" && cur.rejectionReason && (
                  <div style={{ padding: "10px 12px", borderRadius: 10, marginTop: 16, background: "rgba(200,40,40,0.08)", fontSize: 12, lineHeight: 1.5 }} className="text-admin-red">
                    <strong>{tt("Rejected.")}</strong> {cur.rejectionReason}
                  </div>
                )}
                {cur.status === "pending_user_action" && (
                  <div style={{ padding: "10px 12px", borderRadius: 10, marginTop: 16, fontSize: 12 }} className="bg-admin-amber-soft text-admin-amber-deep">
                    {tt("Waiting for talent to send the DM and tap \"I sent it.\"")}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </DrawerShell>

      {/* Rejection reason modal */}
      {rejectReasonModal && (
        <div onClick={() => setRejectReasonModal(null)} style={{
          position: "fixed", inset: 0, zIndex: 220,
          background: "rgba(11,11,13,0.42)", backdropFilter: "blur(6px)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontFamily: FONTS.body,
        }}>
          <div onClick={(e) => e.stopPropagation()} style={{
            width: "calc(100% - 48px)", maxWidth: 460,
            background: "#fff", borderRadius: 16, padding: 22,
            boxShadow: "0 24px 80px -20px rgba(11,11,13,0.45)",
          }}>
            <div style={{ fontFamily: FONTS.display, fontSize: 18, fontWeight: 600, letterSpacing: -0.2, marginBottom: 6 }} className="text-admin-ink">{copy.isSpanish ? `¿Rechazar la verificación de ${rejectReasonModal.talent}?` : `Reject ${rejectReasonModal.talent}'s verification?`}</div>
            <div style={{ fontSize: 12.5, marginBottom: 14, lineHeight: 1.5 }} className="text-admin-ink-muted">
              {tt("Talent will see this reason. Be specific so they can fix it and resubmit.")}
            </div>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder={tt("e.g. DM not received from claimed handle. Make sure you sent the message from @your-handle, not a different account.")}
              rows={4} autoFocus
              style={{
                width: "100%", boxSizing: "border-box", padding: "10px 12px",
                borderRadius: 10, border: `1px solid ${COLORS.border}`,
                fontFamily: FONTS.body, fontSize: 13, color: COLORS.ink, outline: "none",
                resize: "vertical", marginBottom: 14,
              }}
            />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" onClick={() => setRejectReasonModal(null)} style={{
                padding: "9px 16px", borderRadius: 999, border: `1px solid ${COLORS.border}`,
                background: "transparent", color: COLORS.ink,
                fontFamily: FONTS.body, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
              }}>{tt("Cancel")}</button>
              <button type="button" onClick={confirmReject} disabled={!rejectReason.trim()} style={{
                padding: "9px 16px", borderRadius: 999, border: "none",
                background: rejectReason.trim() ? COLORS.red : "rgba(11,11,13,0.10)",
                color: rejectReason.trim() ? "#fff" : COLORS.inkDim,
                fontFamily: FONTS.body, fontSize: 12.5, fontWeight: 600,
                cursor: rejectReason.trim() ? "pointer" : "default",
              }}>{tt("Send rejection")}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ════════════════════════════════════════════════════════════════════
// Disputed Claims — admin queue for resolving talent-disputed agency
// claims. Three outcomes:
//   "release" — talent is right, agency loses ownership.
//   "uphold"  — agency is right, claim returns to pending state.
//   "remove"  — neither owns it; profile is taken down.
// ════════════════════════════════════════════════════════════════════


export function DisputedClaimsDrawer() {
  const { closeDrawer, profileClaims, resolveProfileClaimDispute, toast } = useAdminShell();
  const copy = useDashboardText();
  const tt = copy.t;
  const [activeId, setActiveId] = useState<string | null>(null);
  const [adminNotes, setAdminNotes] = useState("");

  const allRoster = useMemo(() => [...ROSTER_AGENCY, ...ROSTER_FREE], []);
  const talentNameForId = (id: string) => allRoster.find(t => t.id === id)?.name ?? id;

  const disputed = profileClaims.filter(c => c.status === "disputed").sort((a,b) => b.updatedAt.localeCompare(a.updatedAt));
  const cur = activeId ? profileClaims.find(c => c.id === activeId) ?? null : (disputed[0] ?? null);

  const handleResolve = (outcome: "release" | "uphold" | "remove") => {
    if (!cur) return;
    const labels = {
      release: tt("Released to talent"),
      uphold:  tt("Agency claim upheld"),
      remove:  tt("Profile removed"),
    };
    resolveProfileClaimDispute(cur.id, outcome, adminNotes || undefined);
    toast(labels[outcome]);
    setAdminNotes("");
    setActiveId(null);
  };

  const fmt = (iso: string) => { try { return new Date(iso).toLocaleString(); } catch { return iso; } };

  return (
    <DrawerShell
      open
      onClose={closeDrawer}
      title={tt("Disputed claims")}
      description={copy.isSpanish
        ? `${disputed.length} ${disputed.length === 1 ? "reclamación necesita" : "reclamaciones necesitan"} revisión del admin`
        : `${disputed.length} claim${disputed.length === 1 ? "" : "s"} need admin review`}
      width={760}
      footer={<SecondaryButton onClick={closeDrawer}>{tt("Close")}</SecondaryButton>}
    >
      {disputed.length === 0 ? (
        <div style={{ padding: "24px 18px", borderRadius: 12, border: `1px solid ${COLORS.borderSoft}`, textAlign: "center", fontSize: 13 }} className="bg-admin-surface text-admin-ink-muted">
          {tt("No disputed claims. When a talent flags an agency-created profile as not theirs, it will appear here for review.")}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 0.9fr) 1.6fr", gap: 14 }}>
          {/* List */}
          <div style={{
            border: `1px solid ${COLORS.borderSoft}`, borderRadius: 12,
            background: "#fff", maxHeight: "70vh", overflowY: "auto",
          }}>
            {disputed.map(c => {
              const active = cur?.id === c.id;
              return (
                <button key={c.id} type="button" onClick={() => setActiveId(c.id)} style={{
                  display: "block", width: "100%", textAlign: "left",
                  padding: "10px 12px", border: "none", background: active ? COLORS.surface : "transparent",
                  borderBottom: `1px solid ${COLORS.borderSoft}`, cursor: "pointer",
                  fontFamily: FONTS.body,
                }}>
                  <div className="text-admin-ink text-admin-13 font-semibold">
                    {talentNameForId(c.profileId)}
                  </div>
                  <div style={{ fontSize: 11, marginTop: 2 }} className="text-admin-ink-muted">
                    {c.email ?? c.phone ?? "—"}
                  </div>
                  <div style={{ fontSize: 11, marginTop: 4, fontWeight: 600 }} className="text-admin-red">
                    {tt("Disputed")} · {fmt(c.updatedAt)}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Detail */}
          <div style={{
            border: `1px solid ${COLORS.borderSoft}`, borderRadius: 12,
            background: "#fff", padding: 16,
          }}>
            {!cur ? (
              <div className="text-admin-ink-muted text-admin-12h">{tt("Pick a claim to review.")}</div>
            ) : (
              <>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
                  <div style={{ fontFamily: FONTS.display, fontSize: 18, fontWeight: 600, letterSpacing: -0.2 }} className="text-admin-ink">
                    {talentNameForId(cur.profileId)}
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase" }} className="text-admin-red">
                    {tt("Disputed")}
                  </div>
                </div>
                <div style={{ fontSize: 12, marginBottom: 10 }} className="text-admin-ink-muted">
                  {tt("Claim invitation")} {cur.id} · {tt("invited by agency on")} {fmt(cur.createdAt)}
                </div>

                <div className="mb-3.5">
                  <SubjectRiskScoreRow subjectType="talent_profile" subjectId={cur.profileId} />
                </div>

                <div style={{ padding: "10px 12px", borderRadius: 10, background: "rgba(200,40,40,0.06)", border: `1px solid rgba(200,40,40,0.20)`, fontSize: 12.5, lineHeight: 1.5, marginBottom: 14 }} className="text-admin-ink">
                  <strong className="text-admin-red">{tt("Talent's report.")}</strong> {tt("They followed the invite link, saw a profile listed under")} {cur.email ?? tt("this address")}, {tt("and flagged it as not theirs.")}
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, padding: "12px 14px", borderRadius: 10, border: `1px solid ${COLORS.borderSoft}`, marginBottom: 14, fontSize: 12 }} className="bg-admin-surface">
                  <div>
                    <div style={{ fontSize: 11, marginBottom: 2 }} className="text-admin-ink-muted">{tt("Invite sent to")}</div>
                    <div style={{ fontWeight: 600 }} className="text-admin-ink">{cur.email ?? cur.phone ?? "—"}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, marginBottom: 2 }} className="text-admin-ink-muted">{tt("Invited by")}</div>
                    <div style={{ fontWeight: 600 }} className="text-admin-ink">{cur.invitedByAgencyId ?? "—"}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, marginBottom: 2 }} className="text-admin-ink-muted">{tt("Created")}</div>
                    <div className="text-admin-ink">{fmt(cur.createdAt)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, marginBottom: 2 }} className="text-admin-ink-muted">{tt("Disputed")}</div>
                    <div className="text-admin-ink">{fmt(cur.updatedAt)}</div>
                  </div>
                </div>

                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 8 }} className="text-admin-ink-dim">{tt("Admin notes (internal)")}</div>
                <textarea
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  rows={3}
                  placeholder={tt("Outcome reasoning. Visible to admins only.")}
                  style={{
                    width: "100%", boxSizing: "border-box", padding: "10px 12px",
                    borderRadius: 10, border: `1px solid ${COLORS.border}`,
                    fontFamily: FONTS.body, fontSize: 12.5, color: COLORS.ink, outline: "none",
                    resize: "vertical", marginBottom: 14,
                  }}
                />

                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 8 }} className="text-admin-ink-dim">{tt("Resolution")}</div>
                <div className="flex flex-col gap-2">
                  <button type="button" onClick={() => handleResolve("release")} style={{
                    textAlign: "left", padding: "10px 14px", borderRadius: 10,
                    border: `1px solid ${COLORS.border}`, background: "#fff",
                    cursor: "pointer", fontFamily: FONTS.body,
                  }}>
                    <div className="text-admin-ink text-admin-13 font-semibold">{tt("Release to talent")}</div>
                    <div style={{ fontSize: 11.5, marginTop: 2 }} className="text-admin-ink-muted">
                      {tt("Talent is right. Profile is freed from agency control. Status → Released.")}
                    </div>
                  </button>
                  <button type="button" onClick={() => handleResolve("uphold")} style={{
                    textAlign: "left", padding: "10px 14px", borderRadius: 10,
                    border: `1px solid ${COLORS.border}`, background: "#fff",
                    cursor: "pointer", fontFamily: FONTS.body,
                  }}>
                    <div className="text-admin-ink text-admin-13 font-semibold">{tt("Uphold agency claim")}</div>
                    <div style={{ fontSize: 11.5, marginTop: 2 }} className="text-admin-ink-muted">
                      {tt("Agency is right (paperwork checks out). Re-issue invite. Status → Invite sent.")}
                    </div>
                  </button>
                  <button type="button" onClick={() => handleResolve("remove")} style={{
                    textAlign: "left", padding: "10px 14px", borderRadius: 10,
                    border: `1px solid rgba(200,40,40,0.30)`, background: "rgba(200,40,40,0.04)",
                    cursor: "pointer", fontFamily: FONTS.body,
                  }}>
                    <div className="text-admin-red text-admin-13 font-semibold">{tt("Remove profile")}</div>
                    <div style={{ fontSize: 11.5, marginTop: 2 }} className="text-admin-ink-muted">
                      {tt("Neither party owns it. Take the profile down entirely.")}
                    </div>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </DrawerShell>
  );
}

// ════════════════════════════════════════════════════════════════════
// Talent Trust Detail — talent-side view of their own verification
// state with CTAs to start each flow. Verify Instagram opens a modal
// with DM instructions + a unique code; "I sent it" flips request to
// submitted, where it lands in the admin queue.
// ════════════════════════════════════════════════════════════════════

// Trust Health panel — talent-facing summary card. Shows the same
// risk score admins see (transparently, with friendly framing) plus
// the next 1-3 verifications that would lift the score the most.
// Each suggestion is an actionable button that opens the right drawer.
