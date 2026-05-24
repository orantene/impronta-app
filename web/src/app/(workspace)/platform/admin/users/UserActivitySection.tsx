"use client";

/**
 * Activity & Support Context section for the platform user drawer.
 * Extracted to keep UserDrawer.tsx under the 800-line ESLint max-lines limit.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { HQ, HQ_F, HQ_FD, SectionLabel } from "../tenants/hq-kit";
import { getPlatformUserActivity } from "./actions";
import type { UserActivitySnapshot } from "./actions";
import type { PlatformUserRow } from "../../platform-data";

export function ActivitySection({ user }: { user: PlatformUserRow }) {
  const [expanded, setExpanded] = useState(false);
  const [snapshot, setSnapshot] = useState<UserActivitySnapshot | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!expanded || snapshot !== null) return;

    setLoading(true);
    getPlatformUserActivity(user.id, user.kind)
      .then((result) => {
        setSnapshot(result ?? { inquiryCount: 0, bookingCount: 0, lastFiveInquiries: [] });
      })
      .finally(() => {
        setLoading(false);
      });
  }, [expanded, snapshot, user.id, user.kind]);

  // Reset snapshot when user changes
  useEffect(() => {
    setSnapshot(null);
  }, [user.id]);

  return (
    <section style={{ fontFamily: HQ_F }}>
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
        <SectionLabel>Activity &amp; Support Context</SectionLabel>
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
              Loading activity…
            </div>
          ) : snapshot ? (
            <div
              style={{
                background: HQ.cardSoft,
                border: `1px solid ${HQ.borderSoft}`,
                borderRadius: 10,
                padding: "12px",
                fontSize: 12.5,
              }}
            >
              {/* Stats row */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 12,
                  marginBottom: 12,
                  paddingBottom: 12,
                  borderBottom: `1px solid ${HQ.borderSoft}`,
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: 10.5,
                      fontWeight: 700,
                      letterSpacing: 0.4,
                      textTransform: "uppercase",
                      color: HQ.inkDim,
                    }}
                  >
                    Inquiries
                  </div>
                  <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 8 }}>
                    <span
                      style={{
                        fontSize: 18,
                        fontWeight: 600,
                        color: HQ.ink,
                        fontFamily: HQ_FD,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {snapshot.inquiryCount}
                    </span>
                    {snapshot.inquiryCount > 0 && (
                      <Link
                        href={`/platform/admin/inquiries?client_id=${user.id}`}
                        style={{ color: HQ.blue, fontSize: 12, textDecoration: "none", fontWeight: 500 }}
                      >
                        → View
                      </Link>
                    )}
                  </div>
                </div>
                <div>
                  <div
                    style={{
                      fontSize: 10.5,
                      fontWeight: 700,
                      letterSpacing: 0.4,
                      textTransform: "uppercase",
                      color: HQ.inkDim,
                    }}
                  >
                    Bookings
                  </div>
                  <div
                    style={{
                      marginTop: 4,
                      fontSize: 18,
                      fontWeight: 600,
                      color: HQ.ink,
                      fontFamily: HQ_FD,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {snapshot.bookingCount}
                  </div>
                </div>
              </div>

              {/* Recent inquiries */}
              {snapshot.inquiryCount === 0 ? (
                <div style={{ fontSize: 12.5, color: HQ.inkDim, textAlign: "center", padding: "8px 0" }}>
                  No inquiries on record.
                </div>
              ) : (
                <div>
                  <div
                    style={{
                      fontSize: 10.5,
                      fontWeight: 700,
                      letterSpacing: 0.4,
                      textTransform: "uppercase",
                      color: HQ.inkDim,
                      marginBottom: 8,
                    }}
                  >
                    Recent inquiries (last 5)
                  </div>
                  <ul style={{ padding: 0, margin: 0, listStyle: "none", display: "grid", gap: 6 }}>
                    {snapshot.lastFiveInquiries.map((inq) => (
                      <li
                        key={inq.id}
                        style={{
                          background: HQ.bg,
                          border: `1px solid ${HQ.borderSoft}`,
                          borderRadius: 6,
                          padding: "8px 10px",
                          fontSize: 11.5,
                        }}
                      >
                        <div style={{ color: HQ.ink, marginBottom: 4 }}>
                          <strong>{inq.title || "Untitled"}</strong>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "auto auto 1fr", gap: 10, alignItems: "center" }}>
                          <StatusBadge status={inq.status} />
                          <span style={{ fontSize: 10, color: HQ.inkMuted }}>
                            {formatActivityDate(inq.createdAt)}
                          </span>
                          {inq.workspaceName && (
                            <span
                              style={{
                                fontSize: 10,
                                color: HQ.inkDim,
                                textAlign: "right",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {inq.workspaceName}
                            </span>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}

function StatusBadge({ status }: { status: string | null }) {
  let color: string = HQ.inkMuted;
  let bgColor: string = HQ.cardSoft;
  if (status === "booked") { color = HQ.green; bgColor = "rgba(34,197,94,0.1)"; }
  else if (status === "rejected" || status === "closed_lost") { color = HQ.amber; bgColor = "rgba(245,158,11,0.1)"; }
  else if (status === "coordination" || status === "offer_pending") { color = HQ.blue; bgColor = "rgba(59,130,246,0.1)"; }
  return (
    <span style={{ display: "inline-block", padding: "2px 6px", borderRadius: 4, background: bgColor, color, fontSize: 9.5, fontWeight: 600, letterSpacing: 0.3, textTransform: "uppercase", whiteSpace: "nowrap" }}>
      {status || "—"}
    </span>
  );
}

function formatActivityDate(isoString: string): string {
  try {
    const date = new Date(isoString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === today.toDateString()) return "Today";
    if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch { return "—"; }
}
