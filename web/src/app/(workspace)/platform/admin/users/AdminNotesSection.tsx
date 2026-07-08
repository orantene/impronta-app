"use client";

/**
 * Admin Notes section for the platform user drawer.
 * Extracted to keep UserDrawer.tsx under the 800-line ESLint max-lines limit.
 */

import { useEffect, useState, useTransition } from "react";
import { HQ, HQ_F, HQ_FM, SectionLabel } from "../tenants/hq-kit";
import {
  getPlatformUserNotes,
  addPlatformUserNote,
  deletePlatformUserNote,
} from "./actions-notes";
import type { AdminNote } from "./actions-notes";
import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";
import type { PlatformUserRow } from "../../platform-data";

export function AdminNotesSection({ user }: { user: PlatformUserRow }) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  const [notes, setNotes] = useState<AdminNote[]>([]);
  const [loading, setLoading] = useState(false);
  const [noteBody, setNoteBody] = useState("");
  const [pending, startTransition] = useTransition();

  // Fetch notes when section expands
  useEffect(() => {
    if (!expanded || notes.length > 0) return;

    setLoading(true);
    getPlatformUserNotes(user.id, user.kind)
      .then((result) => {
        setNotes(result ?? []);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [expanded, notes.length, user.id, user.kind]);

  // Reset notes when user changes
  useEffect(() => {
    setNotes([]);
    setNoteBody("");
  }, [user.id]);

  const handleAddNote = () => {
    if (!noteBody.trim()) return;

    startTransition(async () => {
      const res = await addPlatformUserNote(user.id, user.kind, noteBody);
      if (res.ok) {
        setNoteBody("");
        // Refresh notes list
        const updatedNotes = await getPlatformUserNotes(user.id, user.kind);
        setNotes(updatedNotes ?? []);
      }
    });
  };

  const handleDeleteNote = (noteId: string) => {
    startTransition(async () => {
      const res = await deletePlatformUserNote(noteId);
      if (res.ok) {
        setNotes((prev) => prev.filter((n) => n.id !== noteId));
      }
    });
  };

  return (
    <section style={{ fontFamily: HQ_F, marginBottom: 18 }}>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: "transparent",
          border: "none",
          cursor: "pointer",
          padding: 0,
        }}
      >
        <SectionLabel>{t("dashboard.platform.users.notes.title")}</SectionLabel>
        <span
          style={{
            color: HQ.inkMuted,
            fontSize: 14,
            transition: "transform 200ms ease",
            transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
            flexShrink: 0,
          }}
        >
          ▼
        </span>
      </button>

      {expanded && (
        <div style={{ marginTop: 8 }}>
          {loading ? (
            <div
              style={{
                background: HQ.cardSoft,
                border: `1px solid ${HQ.borderSoft}`,
                borderRadius: 10,
                padding: "14px",
                fontSize: 12.5,
                color: HQ.inkMuted,
                textAlign: "center",
              }}
            >
              {t("dashboard.platform.users.notes.loading")}
            </div>
          ) : (
            <div
              style={{
                background: HQ.cardSoft,
                border: `1px solid ${HQ.borderSoft}`,
                borderRadius: 10,
                padding: "12px",
                fontSize: 12.5,
              }}
            >
              {/* Notes list */}
              {notes.length === 0 ? (
                <div
                  style={{
                    fontSize: 12.5,
                    color: HQ.inkDim,
                    textAlign: "center",
                    padding: "8px 0",
                    marginBottom: 12,
                  }}
                >
                  {t("dashboard.platform.users.notes.empty")}
                </div>
              ) : (
                <ul
                  style={{
                    padding: 0,
                    margin: "0 0 12px 0",
                    listStyle: "none",
                    display: "grid",
                    gap: 6,
                  }}
                >
                  {notes.map((note) => (
                    <li
                      key={note.id}
                      style={{
                        background: HQ.bg,
                        border: `1px solid ${HQ.borderSoft}`,
                        borderRadius: 6,
                        padding: "10px",
                        fontSize: 11.5,
                        display: "flex",
                        gap: 8,
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 10.5,
                            fontWeight: 600,
                            color: HQ.inkMuted,
                            marginBottom: 4,
                            display: "flex",
                            justifyContent: "space-between",
                          }}
                        >
                          <span>
                            {note.authorDisplayName || note.authorUserId}
                          </span>
                          <span style={{ color: HQ.inkDim, fontSize: 10 }}>
                            {formatNoteDate(note.createdAt, t)}
                          </span>
                        </div>
                        <div
                          style={{
                            color: HQ.ink,
                            fontSize: 12,
                            lineHeight: 1.4,
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-word",
                          }}
                        >
                          {note.body}
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => handleDeleteNote(note.id)}
                        aria-label={t("dashboard.platform.users.notes.deleteAria")}
                        style={{
                          width: 24,
                          height: 24,
                          minWidth: 24,
                          borderRadius: 4,
                          border: `1px solid ${HQ.borderSoft}`,
                          background: "transparent",
                          color: HQ.inkMuted,
                          cursor: pending ? "wait" : "pointer",
                          fontSize: 12,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                          opacity: pending ? 0.6 : 1,
                        }}
                        title={t("dashboard.platform.users.notes.deleteTitle")}
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {/* Add note form */}
              <div
                style={{
                  borderTop: `1px solid ${HQ.borderSoft}`,
                  paddingTop: 12,
                }}
              >
                <div style={{ marginBottom: 8 }}>
                  <textarea
                    value={noteBody}
                    onChange={(e) => setNoteBody(e.target.value)}
                    disabled={pending}
                    placeholder={t("dashboard.platform.users.notes.placeholder")}
                    style={{
                      width: "100%",
                      minHeight: 60,
                      padding: "8px",
                      borderRadius: 6,
                      border: `1px solid ${HQ.borderSoft}`,
                      background: HQ.bg,
                      color: HQ.ink,
                      fontSize: 12,
                      fontFamily: HQ_F,
                      resize: "vertical",
                      fontWeight: 400,
                      opacity: pending ? 0.6 : 1,
                      cursor: pending ? "wait" : "text",
                    }}
                  />
                </div>
                <button
                  type="button"
                  disabled={pending || !noteBody.trim()}
                  onClick={handleAddNote}
                  style={{
                    width: "100%",
                    padding: "6px 12px",
                    borderRadius: 6,
                    border: `1px solid ${HQ.borderSoft}`,
                    background: HQ.blue,
                    color: "white",
                    fontSize: 12,
                    fontWeight: 600,
                    fontFamily: HQ_FM,
                    cursor: pending || !noteBody.trim() ? "not-allowed" : "pointer",
                    opacity: pending || !noteBody.trim() ? 0.6 : 1,
                  }}
                >
                  {pending ? t("dashboard.platform.users.notes.adding") : t("dashboard.platform.users.notes.addNote")}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function formatNoteDate(isoString: string, t: (key: string) => string): string {
  try {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return t("dashboard.platform.users.notes.relJustNow");
    if (diffMins < 60) return interpolate(t("dashboard.platform.users.notes.relMinsAgo"), { count: diffMins });
    if (diffHours < 24) return interpolate(t("dashboard.platform.users.notes.relHoursAgo"), { count: diffHours });
    if (diffDays === 1) return t("dashboard.platform.users.notes.relYesterday");
    if (diffDays < 7) return interpolate(t("dashboard.platform.users.notes.relDaysAgo"), { count: diffDays });
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return "—";
  }
}
