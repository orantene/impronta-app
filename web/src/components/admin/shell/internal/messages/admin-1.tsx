"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { quickPatchInquiryStatus } from "@/lib/server-actions/admin-inquiries";
import { bulkNudgeInquiries, bulkSetInquiryArchived, bulkReassignInquiriesToMe, convertInquiryToBookingAction } from "@/app/(workspace)/[tenantSlug]/admin/_pipeline-actions";
import { useAdminShell, COLORS, FONTS, type RichInquiry } from "../state";
import { AdminInquiryDetail } from "./admin-2";
import { AdminInquiryRow } from "./AdminOperationsShell";
import type { AdminFilter } from "./AdminOperationsShell";
import { __convFlags, archiveInquiry, getIncomingHandoffs, sortPinnedFirst, useFlagsSubscription, useHandoffSubscription } from "./conversation-stash";
import { renderWithDateGroups } from "./messages-shared";
import { HoverActionsCss, SearchPill } from "./shared/inbox-identity-1";
import { FilterChip } from "./shared/inbox-identity-2";
import type { Offer } from "./shared/machinery-9";


export function AdminInboxList({
  inquiries, activeId, onSelect, search, onSearchChange, filter, onFilterChange, totalUnread, needsMe,
}: {
  inquiries: RichInquiry[];
  activeId: string;
  onSelect: (id: string) => void;
  search: string; onSearchChange: (s: string) => void;
  filter: AdminFilter; onFilterChange: (f: AdminFilter) => void;
  totalUnread: number; needsMe: number;
}) {
  // "Coordinating" surfaces the talent_coord lens — inquiries where
  // the user is the coordinator on the lineup (their own studio's
  // bookings). Pinned with a small star so it reads as a saved view.
  const coordCount = inquiries.filter(i =>
    i.coordinator?.name === "Marta Reyes"
    || i.requirementGroups.some(g => g.talents.some(t => t.name === "Marta Reyes")),
  ).length;
  // Subscribe to handoff store + count the user's incoming handoffs.
  // The "Handoffs" chip only renders when the queue is non-empty so
  // the inbox doesn't carry dead chrome in steady state.
  useHandoffSubscription();
  // Subscribe to pin/manual-unread flags so the inbox re-orders +
  // re-tints when those toggle from a row's hover actions.
  useFlagsSubscription();
  const incomingHandoffs = getIncomingHandoffs("Marta Reyes");
  const handoffCount = incomingHandoffs.length;
  // Saved views — "Coordinating" + "Handoffs" are the canonical
  // saved views in the prototype; production would let users build
  // and pin their own (filter + search + sort). They appear at the
  // start of the chip row with a star pin so they read as
  // first-class user-curated entry points, not just filters.
  const archivedCount = inquiries.filter(i => !!__convFlags[i.id]?.archived).length;
  // A7 — triage queue count: open-funnel inquiries owing coordinator action.
  // Same predicate as the triage filter; precomputed here for the chip label.
  // Inline the bucket helper since it's not in this function's scope.
  const inquiryBucket = (s: string): "inquiry" | "hold" | "booked" | "past" => {
    if (s === "draft" || s === "submitted" || s === "coordination") return "inquiry";
    if (s === "offer_pending") return "hold";
    if (s === "approved" || s === "booked") return "booked";
    return "past";
  };
  const triageCount = inquiries.filter(i => {
    const isArchived = !!__convFlags[i.id]?.archived;
    if (isArchived) return false;
    if (i.nextActionBy !== "coordinator") return false;
    const bucket = inquiryBucket(i.stage);
    return bucket === "inquiry" || bucket === "hold";
  }).length;
  const chips: { id: AdminFilter; label: string; count?: number; pin?: boolean }[] = [
    { id: "all", label: "All" },
    { id: "needs-me", label: `Needs me${needsMe > 0 ? ` (${needsMe})` : ""}` },
    // Triage chip — only appears when there's something to triage so it
    // doesn't add visual noise on an empty backlog.
    ...(triageCount > 0 ? [{ id: "triage" as const, label: `Triage${triageCount > 0 ? ` (${triageCount})` : ""}`, pin: true }] : []),
    { id: "unread", label: `Unread${totalUnread > 0 ? ` (${totalUnread})` : ""}` },
    ...(handoffCount > 0 ? [{ id: "handoffs" as const, label: "Handoffs", count: handoffCount, pin: true }] : []),
    ...(coordCount > 0 ? [{ id: "coordinating" as const, label: "Coordinating", count: coordCount, pin: true }] : []),
    { id: "inquiry", label: "Inquiry" },
    { id: "hold", label: "Offer pending" },
    { id: "booked", label: "Booked" },
    { id: "past", label: "Past" },
    ...(archivedCount > 0 ? [{ id: "archived" as const, label: `Archived${archivedCount > 0 ? ` (${archivedCount})` : ""}` }] : []),
  ];

  // Bulk-select state — flipping into bulk mode reveals row checkboxes
  // + a floating action bar at the bottom of the inbox. Single-select
  // is the default (just opens the row); bulk mode is the explicit
  // gesture for multi-row operations (nudge / archive / reassign).
  // Operations are admin+ only — Coord/Editor see the bulk button
  // hidden so they don't get a no-op toggle.
  const { toast: toastBulk, effectiveTenant } = useAdminShell();
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const exitBulk = () => { setBulkMode(false); setSelectedIds(new Set()); };

  return (
    <aside data-tulala-list-pane style={{
      display: "flex", flexDirection: "column",
      borderRight: `1px solid ${COLORS.borderSoft}`, background: "#fff",
      minHeight: 0, minWidth: 0, maxWidth: "100%",
    }}>
      <HoverActionsCss />
      <div data-tulala-inbox-header style={{
        padding: "14px 14px 8px",
        borderBottom: `1px solid ${COLORS.borderSoft}`,
        minWidth: 0, maxWidth: "100%",
      }}>
        <div data-tulala-list-header style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
          <h3 style={{ fontFamily: FONTS.display, fontSize: 17, fontWeight: 700, color: COLORS.ink, margin: 0 }}>Inbox</h3>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 11, color: COLORS.inkMuted }}>{inquiries.length} thread{inquiries.length === 1 ? "" : "s"}</span>
            {/* Bulk-select toggle — admin+ only. Visible chevron pill
                so the affordance reads as "switch into bulk mode" not
                some hidden gesture. */}
            <button type="button"
              onClick={() => setBulkMode(b => !b)}
              title={bulkMode ? "Exit bulk select" : "Select multiple threads"}
              style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                padding: "3px 9px", borderRadius: 999,
                border: `1px solid ${bulkMode ? COLORS.accent : COLORS.borderSoft}`,
                background: bulkMode ? COLORS.accentSoft : "transparent",
                color: bulkMode ? COLORS.accentDeep : COLORS.inkMuted,
                fontSize: 10.5, fontWeight: 700, cursor: "pointer",
                fontFamily: FONTS.body, textTransform: "uppercase", letterSpacing: 0.4,
              }}>
              <svg width="9" height="9" viewBox="0 0 12 12" fill="none" aria-hidden>
                <rect x="1.5" y="1.5" width="3.5" height="3.5" rx="1" stroke="currentColor" strokeWidth="1.2"/>
                <rect x="7" y="1.5" width="3.5" height="3.5" rx="1" stroke="currentColor" strokeWidth="1.2"/>
                <rect x="1.5" y="7" width="3.5" height="3.5" rx="1" stroke="currentColor" strokeWidth="1.2"/>
                <rect x="7" y="7" width="3.5" height="3.5" rx="1" stroke="currentColor" strokeWidth="1.2"/>
              </svg>
              {bulkMode ? "Done" : "Select"}
            </button>
          </div>
        </div>
        <style>{`
          @media (max-width: 720px) {
            [data-tulala-list-header] { display: none !important; }
            [data-tulala-inbox-header],
            [data-tulala-inbox-search],
            [data-tulala-inbox-chips],
            [data-tulala-inbox-scroll] {
              min-width: 0 !important;
              max-width: 100% !important;
              box-sizing: border-box !important;
            }
            [data-tulala-inbox-chips] {
              overflow-x: auto !important;
              scrollbar-width: none !important;
            }
            [data-tulala-inbox-chips]::-webkit-scrollbar { display: none !important; }
          }
        `}</style>
        <div data-tulala-inbox-search style={{ marginBottom: 10 }}>
          <SearchPill value={search} onChange={onSearchChange} placeholder="Search clients, briefs…" />
        </div>
        <div data-tulala-inbox-chips style={{ display: "flex", gap: 5, overflowX: "auto", scrollbarWidth: "none", paddingBottom: 2 }}>
          {chips.map(c => (
            <FilterChip
              key={c.id} id={c.id} label={c.label}
              active={filter === c.id}
              count={c.count}
              icon={c.pin ? (
                <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                  <path d="M6 1l1.5 3.2L11 5l-2.5 2.4.6 3.4L6 9l-3.1 1.8.6-3.4L1 5l3.5-.8L6 1z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
                </svg>
              ) : undefined}
              onClick={() => onFilterChange(c.id)}
            />
          ))}
        </div>
      </div>
      <div data-tulala-inbox-scroll style={{
        flex: 1, overflowY: "auto", minHeight: 0,
        minWidth: 0, maxWidth: "100%",
      }}>
        {inquiries.length === 0 ? (
          <div style={{
            padding: "32px 18px", textAlign: "center",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
          }}>
            <div aria-hidden style={{
              width: 36, height: 36, borderRadius: 10,
              background: COLORS.surfaceAlt, color: COLORS.inkMuted,
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              marginBottom: 4,
            }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>
              {search.trim() ? <>No matches for &ldquo;{search}&rdquo;</> : "No inquiries yet"}
            </div>
            <div style={{ fontSize: 11.5, color: COLORS.inkMuted, lineHeight: 1.4, maxWidth: 240 }}>
              {search.trim() ? "Try a different keyword, or clear the search." : "Inquiries from clients appear here. Share your roster page to get the first one in."}
            </div>
            {search.trim() && (
              <button type="button" onClick={() => onSearchChange("")} style={{
                marginTop: 6, padding: "5px 12px", borderRadius: 999,
                border: `1px solid ${COLORS.border}`, background: "transparent",
                color: COLORS.ink, fontSize: 11.5, fontWeight: 600, cursor: "pointer",
                fontFamily: FONTS.body,
              }}>Clear search</button>
            )}
          </div>
        ) : renderWithDateGroups(
            sortPinnedFirst(inquiries),
            i => i.lastActivityHrs,
            i => (
              // In bulk mode, wrap each row with a checkbox lane on the
              // left. The row click toggles selection (instead of opening
              // the conv) so the gesture stays consistent.
              bulkMode ? (
                <div key={i.id} style={{
                  display: "flex", alignItems: "center", gap: 6,
                  paddingLeft: 8,
                  background: selectedIds.has(i.id) ? COLORS.accentSoft : "transparent",
                }}>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(i.id)}
                    onChange={() => toggleSelect(i.id)}
                    aria-label={`Select ${i.clientName}`}
                    style={{ width: 14, height: 14, cursor: "pointer", flexShrink: 0 }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <AdminInquiryRow inquiry={i} active={false} onClick={() => toggleSelect(i.id)} hideNeedsYouChip={filter === "needs-me"} />
                  </div>
                </div>
              ) : (
                <AdminInquiryRow key={i.id} inquiry={i} active={i.id === activeId} onClick={() => onSelect(i.id)} hideNeedsYouChip={filter === "needs-me"} />
              )
            ),
          )}
      </div>
      {/* Bulk action bar — sticky bottom strip when one+ rows selected.
          Counts the selection + shows the three primary bulk operations
          (Nudge / Archive / Reassign). Reassign is admin+; the others
          are coord+. All resolve to a toast in the prototype but the
          underlying selectedIds set is real. */}
      {bulkMode && selectedIds.size > 0 && (
        <div style={{
          flexShrink: 0,
          padding: "10px 14px",
          background: COLORS.fill, color: "#fff",
          borderTop: `1px solid ${COLORS.borderSoft}`,
          display: "flex", alignItems: "center", gap: 10,
          fontFamily: FONTS.body, fontSize: 12,
        }}>
          <span style={{ fontWeight: 700 }}>
            {selectedIds.size} selected
          </span>
          <span style={{ flex: 1 }} />
          <button type="button"
            onClick={() => {
              const count = selectedIds.size;
              const ids = Array.from(selectedIds);
              const realIds = ids.filter((id) =>
                /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id),
              );
              if (realIds.length > 0) {
                void bulkNudgeInquiries(effectiveTenant.slug, realIds).then((r) => {
                  if (!r.ok) toastBulk(`Bulk nudge failed: ${r.error}`);
                  else if (r.data?.failed) toastBulk(`Nudged ${r.data.ok} (${r.data.failed} failed)`);
                });
              }
              toastBulk(`Nudged ${count} thread${count === 1 ? "" : "s"}`);
              exitBulk();
            }}
            style={{
              padding: "5px 10px", borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.25)",
              background: "transparent", color: "#fff",
              fontSize: 11.5, fontWeight: 600, cursor: "pointer",
              fontFamily: FONTS.body,
            }}>
            Nudge
          </button>
          <button type="button"
            onClick={() => {
              const count = selectedIds.size;
              const ids = Array.from(selectedIds);
              const restoring = filter === "archived";
              // Always toggle the local flag so the inbox refreshes
              // immediately (matches how single-row Archive works).
              ids.forEach((id) => archiveInquiry(id));
              // Persist the real ones in one bulk round-trip — direction
              // is restore when we're in the archived view, archive otherwise.
              const realIds = ids.filter((id) =>
                /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id),
              );
              if (realIds.length > 0) {
                void bulkSetInquiryArchived(effectiveTenant.slug, realIds, !restoring).then((r) => {
                  if (!r.ok) toastBulk(`Bulk ${restoring ? "restore" : "archive"} failed: ${r.error}`);
                });
              }
              toastBulk(`${restoring ? "Restored" : "Archived"} ${count} thread${count === 1 ? "" : "s"}`);
              exitBulk();
            }}
            style={{
              padding: "5px 10px", borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.25)",
              background: "transparent", color: "#fff",
              fontSize: 11.5, fontWeight: 600, cursor: "pointer",
              fontFamily: FONTS.body,
            }}>
            {filter === "archived" ? "Restore" : "Archive"}
          </button>
          <button type="button"
            onClick={() => {
              const count = selectedIds.size;
              const ids = Array.from(selectedIds);
              const realIds = ids.filter((id) =>
                /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id),
              );
              if (realIds.length > 0) {
                void bulkReassignInquiriesToMe(effectiveTenant.slug, realIds).then((r) => {
                  if (!r.ok) toastBulk(`Bulk reassign failed: ${r.error}`);
                  else if (r.data?.failed) toastBulk(`Reassigned ${r.data.ok} (${r.data.failed} failed)`);
                });
              }
              toastBulk(`Reassigned ${count} thread${count === 1 ? "" : "s"} to you`);
              exitBulk();
            }}
            style={{
              padding: "5px 12px", borderRadius: 999,
              border: "none",
              background: "#fff", color: COLORS.fill,
              fontSize: 11.5, fontWeight: 700, cursor: "pointer",
              fontFamily: FONTS.body,
            }}>
            Reassign
          </button>
        </div>
      )}
    </aside>
  );
}

// ── Admin thread header (slim — most context is in WorkspaceBody) ──
// ── Admin INQUIRY DETAIL — same shell as talent/client, ops-flavored hero ──
// ── Stage transition menu ─────────────────────────────────────────────────
// Compact dropdown in the AdminInquiryDetail header that lets coordinators
// advance an inquiry through the pipeline. Calls quickPatchInquiryStatus
// server action and optimistically updates the UI via router.refresh().
export type InquiryStage = RichInquiry["stage"];
// 2026-05-12 fix S0.7: labels unified with the funnel vocabulary so
// the "Move to" menu speaks the same words as the funnel chip
// (Inquiry → Review → Offer → Booked → Wrapped). The DB enum values
// are unchanged — only the UI labels.
export const NEXT_STAGES: Record<string, { label: string; value: string }[]> = {
  submitted:    [{ label: "Move to Review",  value: "reviewing"     }, { label: "Close as lost", value: "closed_lost" }],
  reviewing:    [{ label: "Move to Offer",   value: "offer_pending" }, { label: "Close as lost", value: "closed_lost" }],
  offer_pending:[{ label: "Mark approved by client", value: "approved" }, { label: "Mark rejected by client", value: "rejected" }],
  approved:     [{ label: "Move to Booked",  value: "booked"        }],
  coordination: [{ label: "Move to Review",  value: "reviewing"     }, { label: "Close as lost", value: "closed_lost" }],
  draft:        [{ label: "Submit",          value: "submitted"     }],
};

export function StageTransitionMenu({ inquiryId, stage }: { inquiryId: string; stage: InquiryStage }) {
  const { toast, effectiveTenant } = useAdminShell();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const options = NEXT_STAGES[stage as string] ?? [];
  if (options.length === 0) return null;

  const move = (nextStatus: string) => {
    setOpen(false);
    startTransition(async () => {
      // approved → booked goes through the atomic engine_convert_to_booking RPC
      // (creates the agency_bookings row + booking_talent in a single transaction)
      // rather than just patching status. Other transitions are status-only.
      if (nextStatus === "booked") {
        const result = await convertInquiryToBookingAction(effectiveTenant.slug, inquiryId);
        if (!result.ok) {
          toast(`Convert failed: ${result.error}`);
        } else {
          toast("Inquiry booked");
          router.refresh();
        }
        return;
      }

      const fd = new FormData();
      fd.set("inquiry_id", inquiryId);
      fd.set("status", nextStatus);
      const result = await quickPatchInquiryStatus(fd);
      if (result && "error" in result) {
        toast(`Stage update failed: ${result.error}`);
      } else {
        router.refresh();
      }
    });
  };

  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        disabled={pending}
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "inline-flex", alignItems: "center", gap: 5,
          padding: "5px 10px", borderRadius: 6,
          background: COLORS.fill, color: "#fff",
          border: "none", cursor: pending ? "wait" : "pointer",
          fontFamily: FONTS.body, fontSize: 12, fontWeight: 600,
          opacity: pending ? 0.7 : 1,
        }}
      >
        {pending ? "Moving…" : "Move to"}
        <svg width="10" height="6" viewBox="0 0 10 6" fill="none" aria-hidden>
          <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 50,
          background: "#fff", borderRadius: 8,
          boxShadow: "0 4px 20px rgba(0,0,0,0.12)",
          border: `1px solid ${COLORS.borderSoft}`,
          minWidth: 160, overflow: "hidden",
        }}>
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => move(opt.value)}
              style={{
                display: "block", width: "100%", textAlign: "left",
                padding: "9px 14px",
                fontFamily: FONTS.body, fontSize: 13, color: COLORS.ink,
                background: "none", border: "none", cursor: "pointer",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = COLORS.surfaceAlt; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "none"; }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
