"use client";

// Phase 3.12 / Messages — Slice B: lineup drawer.
//
// Right-side overlay that renders the inquiry's lineup with status pills,
// per-row actions (mark accepted / declined / remove), and an embedded
// AddTalentPicker for adding from the workspace roster.
//
// Loaded as a Promise<InquiryLineupParticipant[]> from the server when the
// drawer opens; refreshed via router.refresh() after every mutation.

import React, { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { InquiryLineupParticipant, AddTalentPickerRow } from "./messages-data";
import {
  addLineupParticipant,
  removeLineupParticipant,
  setLineupParticipantStatus,
} from "./detail-actions";

const C = {
  ink:        "#0B0B0D",
  inkMuted:   "rgba(11,11,13,0.55)",
  inkDim:     "rgba(11,11,13,0.35)",
  border:     "rgba(24,24,27,0.08)",
  borderSoft: "rgba(24,24,27,0.06)",
  cardBg:     "#ffffff",
  surface:    "rgba(11,11,13,0.02)",
  surfaceAlt: "#FAFAF7",
  accent:     "#0F4F3E",
  accentSoft: "rgba(15,79,62,0.08)",
  coral:      "#B04A22",
  coralSoft:  "rgba(176,74,34,0.10)",
  coralDeep:  "#8C3318",
  success:    "#2E7D5B",
  successSoft:"rgba(46,125,91,0.10)",
  amber:      "#8A6F1A",
  amberSoft:  "rgba(138,111,26,0.10)",
} as const;

const FONT = '"Inter", system-ui, sans-serif';

function statusPill(status: string) {
  const s = status.toLowerCase();
  if (s === "accepted" || s === "confirmed") return { bg: C.successSoft, fg: C.success, label: "Confirmed" };
  if (s === "pending") return { bg: C.amberSoft, fg: C.amber, label: "Pending" };
  if (s === "declined") return { bg: C.coralSoft, fg: C.coralDeep, label: "Declined" };
  if (s === "removed") return { bg: "rgba(11,11,13,0.06)", fg: C.inkMuted, label: "Removed" };
  return { bg: "rgba(11,11,13,0.06)", fg: C.inkMuted, label: status };
}

function Avatar({
  name, photoUrl, size = 36,
}: { name: string; photoUrl: string | null; size?: number }) {
  const initials = name.split(/\s+/).filter(Boolean).map(w => w[0]).join("").slice(0, 2).toUpperCase() || "?";
  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt={name}
        width={size}
        height={size}
        style={{
          width: size, height: size, borderRadius: "50%",
          objectFit: "cover", flexShrink: 0,
          background: "rgba(11,11,13,0.06)",
        }}
      />
    );
  }
  // Deterministic color
  let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  const palette = ["#3B5E9E","#0F4F3E","#8A6F1A","#B04A22","#5B3C8C","#2E7D5B","#1A6882","#7A3B3B"];
  const bg = palette[Math.abs(h) % palette.length];
  return (
    <div aria-hidden style={{
      width: size, height: size, borderRadius: "50%",
      background: bg, color: "#fff",
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.38, fontWeight: 700, flexShrink: 0,
      letterSpacing: -0.3, fontFamily: FONT,
    }}>{initials}</div>
  );
}

// ─── AddTalentPicker (sub-drawer) ─────────────────────────────────────────────

function AddTalentPicker({
  rows, onPick, onClose, busy,
}: {
  rows: AddTalentPickerRow[];
  onPick: (talentProfileId: string) => void;
  onClose: () => void;
  busy: boolean;
}) {
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter(r =>
      (r.displayName + " " + (r.primaryRole ?? "") + " " + (r.homeCity ?? ""))
        .toLowerCase().includes(q)
    );
  }, [rows, search]);

  return (
    <div style={{
      display: "flex", flexDirection: "column",
      flex: 1, minHeight: 0,
      fontFamily: FONT,
    }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "12px 16px",
        borderBottom: `1px solid ${C.borderSoft}`,
      }}>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close picker"
          style={{
            width: 28, height: 28, borderRadius: 8,
            border: `1px solid ${C.border}`,
            background: "transparent", color: C.inkMuted,
            cursor: "pointer", padding: 0,
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
            <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <h3 style={{
          fontFamily: FONT, fontSize: 14, fontWeight: 700, color: C.ink,
          margin: 0, letterSpacing: -0.1, flex: 1,
        }}>Add talent to lineup</h3>
        <span style={{ fontSize: 11, color: C.inkMuted }}>{rows.length} on roster</span>
      </div>

      <div style={{ padding: "10px 16px", borderBottom: `1px solid ${C.borderSoft}` }}>
        <div style={{ position: "relative" }}>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search roster…"
            style={{
              width: "100%", boxSizing: "border-box",
              padding: "8px 12px 8px 30px", borderRadius: 999,
              border: `1px solid ${C.border}`,
              background: "rgba(11,11,13,0.04)",
              fontFamily: FONT, fontSize: 12.5, color: C.ink,
              outline: "none",
            }}
          />
          <svg style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }}
            width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
            <circle cx="7" cy="7" r="5" stroke={C.inkDim} strokeWidth="1.5"/>
            <path d="M11 11l3 3" stroke={C.inkDim} strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
        {filtered.length === 0 ? (
          <div style={{
            padding: 24, textAlign: "center",
            color: C.inkMuted, fontSize: 12.5, fontFamily: FONT,
          }}>
            {search.trim() ? `No matches for "${search}"` : "No talent on roster yet."}
          </div>
        ) : filtered.map((r) => (
          <button
            key={r.id}
            type="button"
            disabled={r.alreadyOnLineup || busy}
            onClick={() => onPick(r.id)}
            style={{
              display: "flex", alignItems: "center", gap: 10,
              width: "100%", padding: "10px 16px",
              border: "none", borderBottom: `1px solid ${C.borderSoft}`,
              background: r.alreadyOnLineup ? C.surface : "transparent",
              cursor: r.alreadyOnLineup ? "default" : "pointer",
              opacity: busy ? 0.5 : 1,
              textAlign: "left", fontFamily: FONT,
            }}
          >
            <Avatar name={r.displayName} photoUrl={r.photoUrl} size={36} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 13.5, fontWeight: 600, color: C.ink,
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                letterSpacing: -0.1,
              }}>
                {r.displayName}
              </div>
              <div style={{
                fontSize: 11.5, color: C.inkMuted, marginTop: 1,
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              }}>
                {[r.primaryRole, r.homeCity].filter(Boolean).join(" · ") || "—"}
              </div>
            </div>
            {r.alreadyOnLineup ? (
              <span style={{
                padding: "2px 8px", borderRadius: 999,
                background: C.successSoft, color: C.success,
                fontSize: 10, fontWeight: 700, letterSpacing: 0.3,
                textTransform: "uppercase", flexShrink: 0,
              }}>On lineup</span>
            ) : (
              <span style={{
                padding: "2px 8px", borderRadius: 999,
                background: C.accentSoft, color: C.accent,
                fontSize: 10, fontWeight: 700, letterSpacing: 0.3,
                textTransform: "uppercase", flexShrink: 0,
              }}>+ Add</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── LineupDrawer (main) ──────────────────────────────────────────────────────

export default function LineupDrawer({
  open,
  onClose,
  tenantSlug,
  inquiryId,
  participants,
  pickerRows,
}: {
  open: boolean;
  onClose: () => void;
  tenantSlug: string;
  inquiryId: string;
  participants: InquiryLineupParticipant[];
  pickerRows: AddTalentPickerRow[];
}) {
  const router = useRouter();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startMutation] = useTransition();
  const overlayRef = useRef<HTMLDivElement>(null);

  // Esc closes drawer
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (pickerOpen) setPickerOpen(false);
        else onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, pickerOpen, onClose]);

  const liveRows = participants.filter((p) => p.status !== "removed");
  const confirmedCount = liveRows.filter((p) => p.status === "accepted").length;
  const pendingCount   = liveRows.filter((p) => p.status === "pending").length;
  const declinedCount  = liveRows.filter((p) => p.status === "declined").length;

  const handleAdd = useCallback((talentProfileId: string) => {
    setPendingId(talentProfileId);
    startMutation(async () => {
      const res = await addLineupParticipant(tenantSlug, inquiryId, talentProfileId);
      setPendingId(null);
      if (res.ok) {
        router.refresh();
        setPickerOpen(false);
      }
    });
  }, [tenantSlug, inquiryId, router]);

  const handleRemove = useCallback((participantId: string) => {
    setPendingId(participantId);
    startMutation(async () => {
      await removeLineupParticipant(tenantSlug, inquiryId, participantId);
      setPendingId(null);
      router.refresh();
    });
  }, [tenantSlug, inquiryId, router]);

  const handleSetStatus = useCallback((participantId: string, status: "pending" | "accepted" | "declined") => {
    setPendingId(participantId);
    startMutation(async () => {
      await setLineupParticipantStatus(tenantSlug, inquiryId, participantId, status);
      setPendingId(null);
      router.refresh();
    });
  }, [tenantSlug, inquiryId, router]);

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 100,
        background: "rgba(11,11,13,0.30)",
        display: "flex", justifyContent: "flex-end",
        animation: "msgshell-fade-in 160ms ease-out",
      }}
    >
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes msgshell-fade-in { from { opacity: 0 } to { opacity: 1 } }
        @keyframes msgshell-slide-in { from { transform: translateX(100%); opacity: 0 } to { transform: translateX(0); opacity: 1 } }
      `}} />
      <div style={{
        width: "min(440px, 100vw)", height: "100dvh",
        background: C.cardBg, fontFamily: FONT,
        boxShadow: "-12px 0 40px rgba(11,11,13,0.20)",
        display: "flex", flexDirection: "column",
        animation: "msgshell-slide-in 220ms cubic-bezier(.32,.72,0,1)",
      }}>
        {pickerOpen ? (
          <AddTalentPicker
            rows={pickerRows}
            onPick={handleAdd}
            onClose={() => setPickerOpen(false)}
            busy={pendingId !== null}
          />
        ) : (
          <>
            {/* Header */}
            <div style={{
              padding: "14px 16px",
              borderBottom: `1px solid ${C.borderSoft}`,
              display: "flex", alignItems: "center", gap: 10,
            }}>
              <h3 style={{
                fontFamily: FONT, fontSize: 16, fontWeight: 700, color: C.ink,
                margin: 0, letterSpacing: -0.2, flex: 1,
              }}>Lineup</h3>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close drawer"
                style={{
                  width: 28, height: 28, borderRadius: 8,
                  border: `1px solid ${C.border}`,
                  background: "transparent", color: C.inkMuted,
                  cursor: "pointer", padding: 0,
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                }}
              >
                <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                  <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                </svg>
              </button>
            </div>

            {/* Status summary */}
            <div style={{
              padding: "10px 16px",
              display: "flex", alignItems: "center", gap: 8,
              borderBottom: `1px solid ${C.borderSoft}`,
              flexWrap: "wrap",
            }}>
              <span style={{
                padding: "3px 9px", borderRadius: 999,
                background: C.successSoft, color: C.success,
                fontSize: 11, fontWeight: 700, letterSpacing: 0.2,
              }}>
                {confirmedCount} confirmed
              </span>
              {pendingCount > 0 && (
                <span style={{
                  padding: "3px 9px", borderRadius: 999,
                  background: C.amberSoft, color: C.amber,
                  fontSize: 11, fontWeight: 700, letterSpacing: 0.2,
                }}>
                  {pendingCount} pending
                </span>
              )}
              {declinedCount > 0 && (
                <span style={{
                  padding: "3px 9px", borderRadius: 999,
                  background: C.coralSoft, color: C.coralDeep,
                  fontSize: 11, fontWeight: 700, letterSpacing: 0.2,
                }}>
                  {declinedCount} declined
                </span>
              )}
              <span style={{ flex: 1 }} />
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                style={{
                  padding: "6px 12px", borderRadius: 8,
                  background: C.accent, color: "#fff",
                  border: "none", cursor: "pointer",
                  fontSize: 12, fontWeight: 700,
                  fontFamily: FONT, letterSpacing: 0.2,
                  display: "inline-flex", alignItems: "center", gap: 5,
                }}
              >
                + Add talent
              </button>
            </div>

            {/* Rows */}
            <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
              {liveRows.length === 0 ? (
                <div style={{
                  padding: 32, textAlign: "center",
                  display: "flex", flexDirection: "column",
                  alignItems: "center", gap: 6,
                }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 12,
                    background: C.surface, color: C.inkMuted,
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    marginBottom: 4,
                  }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="1.5"/>
                      <path d="M3 19c0-3.3 2.7-6 6-6s6 2.7 6 6M16 13l3 3M19 13l-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>No talent on lineup</div>
                  <div style={{ fontSize: 11.5, color: C.inkMuted, lineHeight: 1.4, maxWidth: 260 }}>
                    Pick from the agency roster to start building this booking.
                  </div>
                  <button
                    type="button"
                    onClick={() => setPickerOpen(true)}
                    style={{
                      marginTop: 8,
                      padding: "7px 14px", borderRadius: 8,
                      background: C.accent, color: "#fff",
                      border: "none", cursor: "pointer",
                      fontSize: 12, fontWeight: 700, fontFamily: FONT,
                    }}
                  >
                    + Add talent
                  </button>
                </div>
              ) : liveRows.map((p) => {
                const sp = statusPill(p.status);
                const isPending = pendingId === p.id;
                return (
                  <div
                    key={p.id}
                    style={{
                      padding: "12px 16px",
                      borderBottom: `1px solid ${C.borderSoft}`,
                      display: "flex", flexDirection: "column", gap: 8,
                      opacity: isPending ? 0.55 : 1,
                      transition: "opacity 120ms",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <Avatar
                        name={p.talentDisplayName ?? "?"}
                        photoUrl={p.talentPhotoUrl}
                        size={40}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: 13.5, fontWeight: 600, color: C.ink,
                          letterSpacing: -0.1,
                          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                        }}>
                          {p.talentDisplayName ?? "—"}
                        </div>
                        <div style={{
                          display: "flex", alignItems: "center", gap: 6,
                          fontSize: 11.5, color: C.inkMuted, marginTop: 2,
                        }}>
                          {p.talentProfileCode && (
                            <span style={{ fontFamily: '"JetBrains Mono", ui-monospace, monospace' }}>
                              {p.talentProfileCode}
                            </span>
                          )}
                          {p.talentProfileCode && <span>·</span>}
                          <span style={{ textTransform: "capitalize" as const }}>{p.role}</span>
                        </div>
                      </div>
                      <span style={{
                        padding: "2px 8px", borderRadius: 999,
                        background: sp.bg, color: sp.fg,
                        fontSize: 10, fontWeight: 700, letterSpacing: 0.3,
                        textTransform: "uppercase", flexShrink: 0,
                      }}>{sp.label}</span>
                    </div>

                    {/* Per-row actions */}
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {p.status !== "accepted" && (
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => handleSetStatus(p.id, "accepted")}
                          style={{
                            padding: "4px 10px", borderRadius: 7,
                            border: `1px solid ${C.success}`, background: C.successSoft,
                            color: C.success, fontSize: 11, fontWeight: 700,
                            cursor: isPending ? "default" : "pointer", fontFamily: FONT,
                          }}
                        >
                          Mark confirmed
                        </button>
                      )}
                      {p.status !== "pending" && (
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => handleSetStatus(p.id, "pending")}
                          style={{
                            padding: "4px 10px", borderRadius: 7,
                            border: `1px solid ${C.amber}`, background: C.amberSoft,
                            color: C.amber, fontSize: 11, fontWeight: 700,
                            cursor: isPending ? "default" : "pointer", fontFamily: FONT,
                          }}
                        >
                          Mark pending
                        </button>
                      )}
                      {p.status !== "declined" && (
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => handleSetStatus(p.id, "declined")}
                          style={{
                            padding: "4px 10px", borderRadius: 7,
                            border: `1px solid ${C.border}`, background: "transparent",
                            color: C.coralDeep, fontSize: 11, fontWeight: 600,
                            cursor: isPending ? "default" : "pointer", fontFamily: FONT,
                          }}
                        >
                          Mark declined
                        </button>
                      )}
                      <span style={{ flex: 1 }} />
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => {
                          if (confirm(`Remove ${p.talentDisplayName ?? "this talent"} from the lineup?`)) {
                            handleRemove(p.id);
                          }
                        }}
                        style={{
                          padding: "4px 10px", borderRadius: 7,
                          border: `1px solid transparent`,
                          background: "transparent", color: C.inkMuted,
                          fontSize: 11, fontWeight: 600,
                          cursor: isPending ? "default" : "pointer", fontFamily: FONT,
                        }}
                      >
                        Remove
                      </button>
                    </div>

                    {p.status === "declined" && p.declineReasonText && (
                      <div style={{
                        padding: "6px 10px", borderRadius: 8,
                        background: C.coralSoft, color: C.coralDeep,
                        fontSize: 11.5, lineHeight: 1.4,
                      }}>
                        Reason: {p.declineReasonText}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
