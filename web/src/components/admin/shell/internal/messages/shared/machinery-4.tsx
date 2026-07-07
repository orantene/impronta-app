"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";
import { loadWorkspaceCoordinatorCandidates, loadCoordinatorAssignCandidates, addSecondaryCoordinatorAction, reassignCoordinatorAction, removeSecondaryCoordinatorAction, loadSecondaryCoordinators, type WorkspaceCoordinatorCandidate, type CoordinatorAssignCandidate, type SecondaryCoordinatorRow } from "@/app/(workspace)/[tenantSlug]/admin/_pipeline-actions";
import { useAdminShell, FONTS, COLORS, meetsRole, type InquiryRecord } from "../../state";
import { Avatar } from "../../primitives";
import { MOCK_CONVERSATIONS, type Conversation } from "../../talent";
import { initialsOf } from "./inbox-identity-1";
import { LiveLineupPanel } from "./machinery-11";
import { DetailsPanel } from "./machinery-7";


// ── ReassignCoordinatorSheet — admin/coord-side flow for actually
// moving a project to a different coordinator. Different shape from the
// client-side coordinator-change control:
//   • Lists workspace coordinators with current load + availability
//   • Requires a handoff note (so the new coord knows context)
//   • Optionally notifies the outgoing coord
//   • Posts a system event to the timeline so all parties see it
// ──
export function ReassignCoordinatorSheet({
  open, onClose, inquiryId, currentCoordName, currentCoordUserId, onSuccess,
  mode = "swap",
}: {
  open: boolean;
  onClose: () => void;
  inquiryId: string;
  currentCoordName: string;
  currentCoordUserId: string | null;
  onSuccess: () => void;
  /** "swap" replaces the current primary; "add_secondary" assigns the
   *  picked user as a secondary coordinator (engine enforces max 2). */
  mode?: "swap" | "add_secondary";
}) {
  const { toast, effectiveTenant } = useAdminShell();
  const t = useT();
  const [picked, setPicked] = useState<string | null>(null);
  const [note, setNote] = useState("");
  // swap → staff-only handoff list; add_secondary → staff + roster talents.
  const [coords, setCoords] = useState<WorkspaceCoordinatorCandidate[] | null>(null);
  const [appointCands, setAppointCands] = useState<CoordinatorAssignCandidate[] | null>(null);
  const [loadingCoords, setLoadingCoords] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  // Assign-time client-thread window: true = full history, false = start fresh.
  const [showHistory, setShowHistory] = useState(true);

  // Fetch real workspace coordinators on open. 2026-05-12 fix A5:
  // replaces the hardcoded mock list with a live agency_memberships
  // pull. Excludes the current coordinator so the picker only shows
  // viable handoff targets.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingCoords(true);
    setError(null);
    if (mode === "add_secondary") {
      loadCoordinatorAssignCandidates(effectiveTenant.slug, {
        excludeUserId: currentCoordUserId,
        inquiryId,
      }).then((r) => {
        if (cancelled) return;
        if (r.ok) setAppointCands(r.data ?? []);
        else { setError(r.error); setAppointCands([]); }
      }).finally(() => {
        if (!cancelled) setLoadingCoords(false);
      });
    } else {
      loadWorkspaceCoordinatorCandidates(effectiveTenant.slug, {
        excludeUserId: currentCoordUserId,
      }).then((r) => {
        if (cancelled) return;
        if (r.ok) setCoords(r.data ?? []);
        else { setError(r.error); setCoords([]); }
      }).finally(() => {
        if (!cancelled) setLoadingCoords(false);
      });
    }
    return () => { cancelled = true; };
  }, [open, mode, inquiryId, effectiveTenant.slug, currentCoordUserId]);

  const reset = () => {
    setPicked(null); setNote("");
    setError(null); setSubmitting(false); setSearch(""); setShowHistory(true);
  };

  const handleClose = () => { reset(); onClose(); };

  const submit = async () => {
    if (!picked || submitting) return;
    if (mode === "swap" && !note.trim()) return;
    setSubmitting(true); setError(null);
    const r = mode === "add_secondary"
      ? await addSecondaryCoordinatorAction(effectiveTenant.slug, inquiryId, picked, showHistory)
      : await reassignCoordinatorAction(effectiveTenant.slug, inquiryId, picked, note.trim());
    setSubmitting(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    toast(mode === "add_secondary" ? t("dashboard.adminTabs.reassign.secondaryAdded") : t("dashboard.adminTabs.reassign.reassigned"));
    onSuccess();
    handleClose();
  };

  if (!open) return null;
  return (
    <div role="dialog" aria-modal="true" aria-label={t("dashboard.adminTabs.reassign.reassignTitle")} style={{
      position: "fixed", inset: 0, zIndex: 9999, fontFamily: FONTS.body,
    }}>
      <div onClick={onClose} style={{
        position: "absolute", inset: 0, background: "rgba(11,11,13,0.45)",
      }} />
      <style dangerouslySetInnerHTML={{ __html:
        "@media (max-width: 720px){"
        + "[data-tulala-reassign-sheet]{"
        + "left:0!important;right:0!important;top:auto!important;bottom:0!important;"
        + "transform:none!important;width:auto!important;max-width:none!important;"
        + "max-height:90vh!important;border-radius:16px 16px 0 0!important;"
        + "}}"
      }} />
      <aside data-tulala-reassign-sheet style={{
        position: "absolute",
        top: "50%", left: "50%", transform: "translate(-50%, -50%)",
        width: 460, maxWidth: "calc(100vw - 32px)", maxHeight: "85vh",
        background: "#fff", borderRadius: 14,
        boxShadow: "0 32px 80px -16px rgba(11,11,13,0.40), 0 8px 24px rgba(11,11,13,0.10)",
        display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        <div style={{
          padding: "14px 16px", borderBottom: `1px solid ${COLORS.borderSoft}`,
          display: "flex", alignItems: "flex-start", gap: 10,
        }}>
          <div className="flex-1 min-w-0">
            <h2 style={{ margin: 0, fontFamily: FONTS.display, fontSize: 16, fontWeight: 700, letterSpacing: -0.2 }} className="text-admin-ink">{mode === "add_secondary" ? t("dashboard.adminTabs.reassign.assignTitle") : t("dashboard.adminTabs.reassign.reassignTitle")}</h2>
            <div style={{ fontSize: 11.5, marginTop: 3 }} className="text-admin-ink-muted">
              {mode === "add_secondary"
                ? t("dashboard.adminTabs.reassign.assignSub")
                : interpolate(t("dashboard.adminTabs.reassign.reassignSub"), { name: currentCoordName })}
            </div>
          </div>
          <button type="button" onClick={handleClose} aria-label={t("dashboard.adminTabs.reassign.close")} style={{
            flexShrink: 0,
            width: 28, height: 28, borderRadius: 8,
            border: "none", background: "transparent",
            color: COLORS.inkMuted, cursor: "pointer", fontSize: 18, lineHeight: 1,
          }}>×</button>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }} className="text-admin-ink-muted">
              {mode === "add_secondary" ? t("dashboard.adminTabs.reassign.whoAssign") : t("dashboard.adminTabs.reassign.pickNew")}
            </div>
            {loadingCoords && (
              <div style={{ padding: "10px 12px", fontSize: 12 }} className="text-admin-ink-muted">{t("dashboard.adminTabs.reassign.loadingWorkspace")}</div>
            )}
            {mode === "add_secondary" ? (
              <>
                {/* Searchable, grouped picker: Staff + Your roster. */}
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.currentTarget.value)}
                  placeholder={t("dashboard.adminTabs.reassign.searchPlaceholder")}
                  style={{
                    width: "100%", padding: "8px 10px", borderRadius: 8, marginBottom: 8,
                    border: `1px solid ${COLORS.borderSoft}`, background: COLORS.surfaceAlt,
                    fontFamily: FONTS.body, fontSize: 12.5, color: COLORS.ink,
                    outline: "none", boxSizing: "border-box",
                  }}
                />
                {!loadingCoords && appointCands != null && appointCands.length === 0 && (
                  <div style={{ padding: "10px 12px", fontSize: 12, borderRadius: 8 }} className="text-admin-ink-muted bg-admin-surface-alt">
                    {t("dashboard.adminTabs.reassign.noneAvailable")}
                  </div>
                )}
                {(["staff", "talent"] as const).map((groupKind) => {
                  const q = search.trim().toLowerCase();
                  const group = (appointCands ?? [])
                    .filter((c) => c.kind === groupKind)
                    .filter((c) => !q || c.displayName.toLowerCase().includes(q) || (c.headline ?? c.role ?? "").toLowerCase().includes(q));
                  if (group.length === 0) return null;
                  return (
                    <div key={groupKind} style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, margin: "2px 0 5px" }} className="text-admin-ink-dim">
                        {groupKind === "staff" ? t("dashboard.adminTabs.reassign.groupStaff") : t("dashboard.adminTabs.reassign.groupRoster")}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                        {group.map((c) => {
                          const initials = c.displayName
                            .split(/\s+/).filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "?";
                          const meta = c.status === "pending_acceptance"
                            ? t("dashboard.adminTabs.reassign.pendingInvite")
                            : (c.kind === "talent" ? (c.headline ?? t("dashboard.adminTabs.reassign.rosterTalent")) : interpolate(t("dashboard.adminTabs.reassign.activeCountRole"), { count: c.activeInquiryCount, role: c.role }));
                          const isPicked = picked === c.userId;
                          return (
                            <button key={c.userId}
                              type="button"
                              onClick={() => setPicked(c.userId)}
                              style={{
                                display: "flex", alignItems: "center", gap: 10,
                                padding: "8px 10px", borderRadius: 10,
                                background: isPicked ? COLORS.surfaceAlt : "#fff",
                                border: `1px solid ${isPicked ? COLORS.accent : COLORS.borderSoft}`,
                                cursor: "pointer",
                                textAlign: "left", fontFamily: FONTS.body,
                              }}>
                              <Avatar size={32} tone="auto" hashSeed={c.displayName} initials={initials} />
                              <div className="flex-1 min-w-0">
                                <div className="text-admin-ink text-admin-13 font-bold">{c.displayName}</div>
                                <div style={{ fontSize: 11, marginTop: 2 }} className="text-admin-ink-muted">{meta}</div>
                              </div>
                              {c.inLineup && (
                                <span style={{
                                  flexShrink: 0, padding: "2px 7px", borderRadius: 999,
                                  fontSize: 10, fontWeight: 700,
                                  background: `${COLORS.accent}1c`, color: COLORS.accent,
                                }}>{t("dashboard.adminTabs.reassign.inLineup")}</span>
                              )}
                              {isPicked && (
                                <span aria-hidden style={{
                                  flexShrink: 0,
                                  width: 18, height: 18, borderRadius: "50%",
                                  background: COLORS.accent, color: "#fff",
                                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                                  fontSize: 11, fontWeight: 700,
                                }}>✓</span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </>
            ) : (
              <>
                {!loadingCoords && coords != null && coords.length === 0 && (
                  <div style={{ padding: "10px 12px", fontSize: 12, borderRadius: 8 }} className="text-admin-ink-muted bg-admin-surface-alt">
                    {t("dashboard.adminTabs.reassign.noOtherMembers")}
                  </div>
                )}
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  {(coords ?? []).map(c => {
                    const initials = c.displayName
                      .split(/\s+/).filter(Boolean).map(w => w[0]).join("").slice(0, 2).toUpperCase() || "?";
                    const meta = c.status === "pending_acceptance"
                      ? t("dashboard.adminTabs.reassign.pendingInvite")
                      : interpolate(t("dashboard.adminTabs.reassign.activeCountRole"), { count: c.activeInquiryCount, role: c.role });
                    const isPicked = picked === c.userId;
                    return (
                      <button key={c.userId}
                        type="button"
                        onClick={() => setPicked(c.userId)}
                        style={{
                          display: "flex", alignItems: "center", gap: 10,
                          padding: "8px 10px", borderRadius: 10,
                          background: isPicked ? COLORS.surfaceAlt : "#fff",
                          border: `1px solid ${isPicked ? COLORS.accent : COLORS.borderSoft}`,
                          cursor: "pointer",
                          textAlign: "left", fontFamily: FONTS.body,
                        }}>
                        <Avatar size={32} tone="auto" hashSeed={c.displayName} initials={initials} />
                        <div className="flex-1 min-w-0">
                          <div className="text-admin-ink text-admin-13 font-bold">{c.displayName}</div>
                          <div style={{ fontSize: 11, marginTop: 2 }} className="text-admin-ink-muted">{meta}</div>
                        </div>
                        {isPicked && (
                          <span aria-hidden style={{
                            flexShrink: 0,
                            width: 18, height: 18, borderRadius: "50%",
                            background: COLORS.accent, color: "#fff",
                            display: "inline-flex", alignItems: "center", justifyContent: "center",
                            fontSize: 11, fontWeight: 700,
                          }}>✓</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
          {mode === "add_secondary" && (
            <div>
              <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }} className="text-admin-ink-muted">
                {t("dashboard.adminTabs.reassign.clientChatHistory")}
              </div>
              {/* Segmented control: full history vs start fresh. Maps to the
                  addSecondaryCoordinator showHistory → participant.visible_from. */}
              <div style={{ display: "flex", gap: 6 }}>
                {([
                  { val: true, label: t("dashboard.adminTabs.reassign.showFullHistory"), hint: t("dashboard.adminTabs.reassign.showFullHistoryHint") },
                  { val: false, label: t("dashboard.adminTabs.reassign.startFresh"), hint: t("dashboard.adminTabs.reassign.startFreshHint") },
                ] as const).map((opt) => {
                  const active = showHistory === opt.val;
                  return (
                    <button key={String(opt.val)} type="button" onClick={() => setShowHistory(opt.val)} style={{
                      flex: 1, padding: "8px 10px", borderRadius: 10, textAlign: "left",
                      border: `1px solid ${active ? COLORS.accent : COLORS.borderSoft}`,
                      background: active ? COLORS.surfaceAlt : "#fff",
                      cursor: "pointer", fontFamily: FONTS.body,
                    }}>
                      <div className="text-admin-ink text-admin-13 font-bold">{opt.label}</div>
                      <div style={{ fontSize: 10.5, marginTop: 2 }} className="text-admin-ink-muted">{opt.hint}</div>
                    </button>
                  );
                })}
              </div>
              {/* Consequence summary — names the appointee + what they get. */}
              {picked && (() => {
                const cand = (appointCands ?? []).find((c) => c.userId === picked);
                const name = cand?.displayName ?? t("dashboard.adminTabs.reassign.thisPerson");
                return (
                  <div style={{ marginTop: 10, padding: "9px 11px", borderRadius: 10, fontSize: 11.5, lineHeight: 1.5 }} className="text-admin-ink-muted bg-admin-surface-alt">
                    {interpolate(t("dashboard.adminTabs.reassign.consequence"), { name })}
                  </div>
                );
              })()}
            </div>
          )}
          {mode === "swap" && (
            <div>
              <label style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6, display: "block" }} className="text-admin-ink-muted">
                {t("dashboard.adminTabs.reassign.handoffNote")}
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.currentTarget.value)}
                placeholder={t("dashboard.adminTabs.reassign.handoffPlaceholder")}
                style={{
                  width: "100%", minHeight: 64, resize: "vertical",
                  padding: 10, borderRadius: 8,
                  border: `1px solid ${COLORS.borderSoft}`,
                  background: COLORS.surfaceAlt,
                  fontFamily: FONTS.body, fontSize: 12.5, color: COLORS.ink,
                  outline: "none", boxSizing: "border-box",
                }}
              />
            </div>
          )}
          {error && (
            <div role="alert" style={{
              padding: "8px 10px", borderRadius: 8, fontSize: 12,
              background: `${COLORS.coral}1c`, color: COLORS.coralDeep ?? COLORS.coral,
              border: `1px solid ${COLORS.coral}40`,
            }}>
              {error}
            </div>
          )}
        </div>
        <div style={{
          padding: 12, borderTop: `1px solid ${COLORS.borderSoft}`,
          display: "flex", gap: 8, justifyContent: "flex-end",
        }}>
          <button type="button" onClick={handleClose} disabled={submitting} style={{
            padding: "8px 14px", borderRadius: 999,
            border: `1px solid ${COLORS.border}`, background: "transparent",
            color: COLORS.ink, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
            fontFamily: FONTS.body,
          }}>{t("dashboard.adminTabs.reassign.cancel")}</button>
          <button type="button"
            disabled={!picked || (mode === "swap" && !note.trim()) || submitting}
            onClick={submit}
            style={{
              padding: "8px 16px", borderRadius: 999,
              border: "none",
              background: (picked && (mode === "add_secondary" || note.trim()) && !submitting) ? COLORS.fill : "rgba(11,11,13,0.12)",
              color: "#fff",
              fontSize: 12.5, fontWeight: 700,
              cursor: (picked && (mode === "add_secondary" || note.trim()) && !submitting) ? "pointer" : "not-allowed",
              fontFamily: FONTS.body,
            }}>
            {submitting
              ? (mode === "add_secondary" ? t("dashboard.adminTabs.reassign.assigning") : t("dashboard.adminTabs.reassign.reassigning"))
              : (mode === "add_secondary" ? t("dashboard.adminTabs.reassign.assign") : t("dashboard.adminTabs.reassign.reassign"))}
          </button>
        </div>
      </aside>
    </div>
  );
}

// Build a stub Conversation from an InquiryRecord — used by admin-side
// surfaces (DetailsPanel) that need to pass a conv to LineupDrawer.
// Falls back to MOCK_CONVERSATIONS when an id matches; otherwise builds
// a minimal shape that satisfies LineupDrawer's read sites.
export function buildConvFromInquiry(inquiry: InquiryRecord): Conversation {
  const real = MOCK_CONVERSATIONS.find(c => c.id === inquiry.id);
  if (real) return real;
  const coord = inquiry.coordinators[0];
  return {
    id: inquiry.id,
    client: inquiry.client.name ?? "Client",
    clientInitials: initialsOf(inquiry.client.name ?? "Client"),
    clientTrust: "verified",
    agency: coord ? "Your workspace" : "—",
    brief: inquiry.title,
    location: inquiry.location.city ?? null,
    date: inquiry.schedule.start,
    stage: inquiry.status === "wrapped" ? "past"
      : inquiry.status === "cancelled" ? "cancelled"
      : inquiry.status === "booked" ? "booked"
      : inquiry.status === "submitted" || inquiry.status === "coordinating" ? "inquiry"
      : "hold",
    leader: coord
      ? { id: coord.id, name: coord.name, initials: coord.initials }
      : { id: "u-stub", name: "Unassigned", initials: "—" },
    iAmCoordinator: false,
    lastMessage: { sender: "system", preview: "", ageHrs: 0 },
    seen: true,
    unreadCount: 0,
    pinned: {},
    participants: [],
    source: undefined,
    outcome: undefined,
  } as unknown as Conversation;
}

// ── AdminParticipantsActions — quick access to the lineup from the
// admin Participants card. The DB-backed editor is LiveLineupPanel;
// this drawer is view-only until coordinator handoff/add flows are
// persisted.
export function AdminParticipantsActions({ inquiry, planTier = "agency" }: {
  inquiry: InquiryRecord;
  /** Workspace plan tier — gates the Reassign Coordinator button.
   *  A Free workspace has no team to reassign to, so the button hides
   *  there. Studio / Agency / Hub-Network all surface it. */
  planTier?: "free" | "studio" | "agency" | "hub-network";
}) {
  const { state, toast, effectiveTenant } = useAdminShell();
  const t = useT();
  const router = useRouter();
  // S0.3 retirement: drawer retired. "View lineup" toasts the admin to
  // the Lineup tab where LiveLineupPanel is the canonical surface.
  const openLineupTab = () => toast(t("dashboard.adminTabs.participants.openLineupToast"));
  const [reassignOpen, setReassignOpen] = useState(false);
  const [reassignMode, setReassignMode] = useState<"swap" | "add_secondary">("swap");
  const [removing, startRemove] = useTransition();
  // WS6 — real secondary coordinators loaded from the DB (coordinators[] holds
  // only the primary on this data path; fixtures.ts:513). Drives Remove chips.
  const [secondaryCoords, setSecondaryCoords] = useState<SecondaryCoordinatorRow[]>([]);
  useEffect(() => {
    let cancelled = false;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(inquiry.id);
    if (!isUuid) { setSecondaryCoords([]); return; }
    loadSecondaryCoordinators(effectiveTenant.slug, inquiry.id).then((r) => {
      if (!cancelled && r.ok) setSecondaryCoords(r.data ?? []);
    });
    return () => { cancelled = true; };
  }, [inquiry.id, effectiveTenant.slug]);
  const conv = buildConvFromInquiry(inquiry);
  void conv;
  const currentCoord = inquiry.coordinators[0];
  const removeCoord = (c: SecondaryCoordinatorRow) => {
    const base = interpolate(t("dashboard.adminTabs.participants.removeConfirm"), { name: c.name });
    const extra = c.inLineup ? t("dashboard.adminTabs.participants.removeConfirmLineup") : "";
    if (!confirm(base + extra)) return;
    startRemove(async () => {
      const r = await removeSecondaryCoordinatorAction(effectiveTenant.slug, inquiry.id, c.userId);
      if (!r.ok) toast(interpolate(t("dashboard.adminTabs.participants.removeFailed"), { error: r.error }));
      else { toast(interpolate(t("dashboard.adminTabs.participants.removed"), { name: c.name })); router.refresh(); }
    });
  };
  const canEdit = inquiry.status !== "wrapped" && inquiry.status !== "cancelled";
  // Phase 3 of System User direction — permission ladder:
  //   • Add talent: requires coordinator+ (anyone managing projects can
  //     add talent to a project they're on)
  //   • Reassign coordinator: requires admin+ (moves project ownership
  //     between team members — privileged operation)
  //   • Free workspaces have no team to reassign to, so reassign hides
  //     regardless of role.
  const canViewLineup = meetsRole(state.role, "manager");
  const canReassign = meetsRole(state.role, "admin")
    && planTier !== "free"
    && !!currentCoord;
  if (!canEdit) return null;
  if (!canViewLineup && !canReassign) return null;
  return (
    <>
      <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 8 }}>
        {canViewLineup && (
          <button type="button" onClick={openLineupTab} style={{
            padding: "6px 12px", fontSize: 11.5, fontWeight: 600,
            borderRadius: 999, border: "none",
            background: COLORS.fill, color: "#fff", cursor: "pointer",
            display: "inline-flex", alignItems: "center", gap: 5,
            fontFamily: FONTS.body,
          }}>
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
              <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            {t("dashboard.adminTabs.participants.viewLineup")}
          </button>
        )}
        {canReassign && (
          <>
            <button type="button" onClick={() => { setReassignMode("swap"); setReassignOpen(true); }} style={{
              padding: "6px 12px", fontSize: 11.5, fontWeight: 600,
              borderRadius: 999, border: `1px solid ${COLORS.border}`,
              background: "transparent", color: COLORS.ink, cursor: "pointer",
              fontFamily: FONTS.body,
            }}>{t("dashboard.adminTabs.participants.reassignCoordinator")}</button>
            <button type="button" onClick={() => { setReassignMode("add_secondary"); setReassignOpen(true); }} style={{
              padding: "6px 12px", fontSize: 11.5, fontWeight: 600,
              borderRadius: 999, border: `1px solid ${COLORS.border}`,
              background: "transparent", color: COLORS.ink, cursor: "pointer",
              fontFamily: FONTS.body,
            }}>{t("dashboard.adminTabs.participants.assignCoordinator")}</button>
            {secondaryCoords.map((c) => (
              <button key={c.userId} type="button" disabled={removing} onClick={() => removeCoord(c)} style={{
                padding: "6px 12px", fontSize: 11.5, fontWeight: 600,
                borderRadius: 999, border: `1px solid ${COLORS.coral}55`,
                background: "transparent", color: COLORS.coralDeep ?? COLORS.coral,
                cursor: removing ? "not-allowed" : "pointer", fontFamily: FONTS.body,
                display: "inline-flex", alignItems: "center", gap: 5,
              }}>
                <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden>
                  <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                </svg>
                {interpolate(t("dashboard.adminTabs.participants.removeName"), { name: c.name.split(" ")[0] })}
              </button>
            ))}
          </>
        )}
        {/* Free-tier upgrade nudge — Reassign hides on Free, but
            instead of leaving silence, surface a soft upsell so the
            user knows the affordance exists at higher tiers. Same
            amber palette as the create-workspace Free-cap explainer
            for visual consistency. */}
        {planTier === "free" && currentCoord && meetsRole(state.role, "admin") && (
          /* Phase A C1 — was disabled chrome. Now a clickable upsell
             that toasts the user with the reason and the upgrade path. */
          <button type="button"
            onClick={() => toast(t("dashboard.adminTabs.participants.upgradeToast"))}
            title={t("dashboard.adminTabs.participants.upgradeTitle")}
            style={{
              padding: "6px 12px", fontSize: 11.5, fontWeight: 600,
              borderRadius: 999, border: `1px dashed rgba(214,158,46,0.5)`,
              background: "rgba(214,158,46,0.08)", color: "#7C5A14",
              cursor: "pointer", fontFamily: FONTS.body,
              display: "inline-flex", alignItems: "center", gap: 5,
            }}>
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden>
              <path d="M6 1l1.5 3.2L11 5l-2.5 2.4.6 3.4L6 9l-3.1 1.8.6-3.4L1 5l3.5-.8L6 1z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
            </svg>
            {t("dashboard.adminTabs.participants.reassignStudio")}
          </button>
        )}
      </div>
      {/* LineupDrawer retired (S0.3). "View lineup" toasts user to the
          Lineup tab where the canonical LiveLineupPanel handles add/
          remove with real engine writes. */}
      {currentCoord && (
        <ReassignCoordinatorSheet
          open={reassignOpen}
          onClose={() => setReassignOpen(false)}
          inquiryId={inquiry.id}
          currentCoordName={currentCoord.name}
          currentCoordUserId={currentCoord.id}
          onSuccess={() => router.refresh()}
          mode={reassignMode}
        />
      )}
    </>
  );
}
