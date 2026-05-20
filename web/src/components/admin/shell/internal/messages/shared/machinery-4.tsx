"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { loadWorkspaceCoordinatorCandidates, addSecondaryCoordinatorAction, reassignCoordinatorAction, type WorkspaceCoordinatorCandidate } from "@/app/(workspace)/[tenantSlug]/admin/_pipeline-actions";
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
  const [picked, setPicked] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [notifyOutgoing, setNotifyOutgoing] = useState(true);
  const [coords, setCoords] = useState<WorkspaceCoordinatorCandidate[] | null>(null);
  const [loadingCoords, setLoadingCoords] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch real workspace coordinators on open. 2026-05-12 fix A5:
  // replaces the hardcoded mock list with a live agency_memberships
  // pull. Excludes the current coordinator so the picker only shows
  // viable handoff targets.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingCoords(true);
    setError(null);
    loadWorkspaceCoordinatorCandidates(effectiveTenant.slug, {
      excludeUserId: currentCoordUserId,
    }).then((r) => {
      if (cancelled) return;
      if (r.ok) setCoords(r.data ?? []);
      else { setError(r.error); setCoords([]); }
    }).finally(() => {
      if (!cancelled) setLoadingCoords(false);
    });
    return () => { cancelled = true; };
  }, [open, effectiveTenant.slug, currentCoordUserId]);

  const reset = () => {
    setPicked(null); setNote(""); setNotifyOutgoing(true);
    setError(null); setSubmitting(false);
  };

  const handleClose = () => { reset(); onClose(); };

  const submit = async () => {
    if (!picked || submitting) return;
    if (mode === "swap" && !note.trim()) return;
    setSubmitting(true); setError(null);
    const r = mode === "add_secondary"
      ? await addSecondaryCoordinatorAction(effectiveTenant.slug, inquiryId, picked)
      : await reassignCoordinatorAction(effectiveTenant.slug, inquiryId, picked, note.trim());
    setSubmitting(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    toast(mode === "add_secondary" ? "Secondary coordinator added" : "Coordinator reassigned");
    onSuccess();
    handleClose();
  };

  if (!open) return null;
  return (
    <div role="dialog" aria-modal="true" aria-label="Reassign coordinator" style={{
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
            <h2 style={{ margin: 0, fontFamily: FONTS.display, fontSize: 16, fontWeight: 700, letterSpacing: -0.2 }} className="text-admin-ink">{mode === "add_secondary" ? "Add coordinator" : "Reassign coordinator"}</h2>
            <div style={{ fontSize: 11.5, marginTop: 3 }} className="text-admin-ink-muted">
              {mode === "add_secondary"
                ? `Add a secondary coordinator alongside ${currentCoordName}.`
                : `Move this project from ${currentCoordName} to a teammate.`}
            </div>
          </div>
          <button type="button" onClick={handleClose} aria-label="Close" style={{
            flexShrink: 0,
            width: 28, height: 28, borderRadius: 8,
            border: "none", background: "transparent",
            color: COLORS.inkMuted, cursor: "pointer", fontSize: 18, lineHeight: 1,
          }}>×</button>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }} className="text-admin-ink-muted">
              Pick the new coordinator
            </div>
            {loadingCoords && (
              <div style={{ padding: "10px 12px", fontSize: 12 }} className="text-admin-ink-muted">Loading workspace…</div>
            )}
            {!loadingCoords && coords != null && coords.length === 0 && (
              <div style={{ padding: "10px 12px", fontSize: 12, borderRadius: 8 }} className="text-admin-ink-muted bg-admin-surface-alt">
                No other workspace members can take over this inquiry yet. Invite a teammate from Settings → Team.
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {(coords ?? []).map(c => {
                const initials = c.displayName
                  .split(/\s+/).filter(Boolean).map(w => w[0]).join("").slice(0, 2).toUpperCase() || "?";
                const meta = c.status === "pending_acceptance"
                  ? "Pending invite acceptance"
                  : `${c.activeInquiryCount} active · ${c.role}`;
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
                      <div style={{ fontSize: 13, fontWeight: 700 }} className="text-admin-ink">{c.displayName}</div>
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
          </div>
          {mode === "swap" && (
            <div>
              <label style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6, display: "block" }} className="text-admin-ink-muted">
                Handoff note (required)
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.currentTarget.value)}
                placeholder="Where is this project? What does the new coordinator need to know?"
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
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, cursor: "pointer" }} className="text-admin-ink">
            <input
              type="checkbox"
              checked={notifyOutgoing}
              onChange={(e) => setNotifyOutgoing(e.currentTarget.checked)}
              style={{ width: 14, height: 14, cursor: "pointer" }}
            />
            Notify {currentCoordName} (sends a system message in the team thread)
          </label>
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
          }}>Cancel</button>
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
              ? (mode === "add_secondary" ? "Adding…" : "Reassigning…")
              : (mode === "add_secondary" ? "Add coordinator" : "Reassign")}
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
  const { state, toast } = useAdminShell();
  const router = useRouter();
  // S0.3 retirement: drawer retired. "View lineup" toasts the admin to
  // the Lineup tab where LiveLineupPanel is the canonical surface.
  const openLineupTab = () => toast("Open the Lineup tab in this conversation to manage talent");
  const [reassignOpen, setReassignOpen] = useState(false);
  const [reassignMode, setReassignMode] = useState<"swap" | "add_secondary">("swap");
  const conv = buildConvFromInquiry(inquiry);
  void conv;
  const currentCoord = inquiry.coordinators[0];
  const canEdit = inquiry.status !== "wrapped" && inquiry.status !== "cancelled";
  // Phase 3 of System User direction — permission ladder:
  //   • Add talent: requires coordinator+ (anyone managing projects can
  //     add talent to a project they're on)
  //   • Reassign coordinator: requires admin+ (moves project ownership
  //     between team members — privileged operation)
  //   • Free workspaces have no team to reassign to, so reassign hides
  //     regardless of role.
  const canViewLineup = meetsRole(state.role, "coordinator");
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
            View lineup
          </button>
        )}
        {canReassign && (
          <>
            <button type="button" onClick={() => { setReassignMode("swap"); setReassignOpen(true); }} style={{
              padding: "6px 12px", fontSize: 11.5, fontWeight: 600,
              borderRadius: 999, border: `1px solid ${COLORS.border}`,
              background: "transparent", color: COLORS.ink, cursor: "pointer",
              fontFamily: FONTS.body,
            }}>Reassign coordinator</button>
            <button type="button" onClick={() => { setReassignMode("add_secondary"); setReassignOpen(true); }} style={{
              padding: "6px 12px", fontSize: 11.5, fontWeight: 600,
              borderRadius: 999, border: `1px solid ${COLORS.border}`,
              background: "transparent", color: COLORS.ink, cursor: "pointer",
              fontFamily: FONTS.body,
            }}>+ Add coordinator</button>
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
            onClick={() => toast("Reassigning a coordinator needs a Studio or Agency workspace. Upgrade in Settings → Plan.")}
            title="Upgrade to unlock"
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
            Reassign · Studio plan
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
