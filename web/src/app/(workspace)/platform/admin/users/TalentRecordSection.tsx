"use client";

/**
 * C.3 — Talent-record panel for the platform user drawer.
 * Shows talent slug, workflow status, published-globally flag, and
 * claim-invite UI for unclaimed talent profiles.
 */

import { useState, useTransition } from "react";
import Link from "next/link";
import { HQ, HQ_F, HQ_FM, SectionLabel } from "../tenants/hq-kit";
import { sendPlatformClaimInvite } from "./actions";
import type { PlatformUserRow } from "../../platform-data";

function workflowStatusColor(status: string | null): string {
  if (!status) return HQ.inkDim;
  if (status === "published") return HQ.green;
  if (status === "approved") return HQ.green;
  if (status === "draft") return HQ.inkMuted;
  if (status === "hidden") return HQ.amber;
  if (status === "archived") return HQ.red ?? HQ.amber;
  return HQ.inkMuted;
}

function workflowLabel(status: string | null): string {
  if (!status) return "—";
  return status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, " ");
}

export function TalentRecordSection({ user }: { user: PlatformUserRow }) {
  const [isOpen, setIsOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteStatus, setInviteStatus] = useState<
    "idle" | "pending" | "ok" | "error"
  >("idle");
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Only show for users with a talent profile
  const hasTalent =
    user.kind === "unclaimed_talent" || user.talentProfileId !== null;

  if (!hasTalent) return null;

  const isUnclaimed = user.kind === "unclaimed_talent";
  const talentId = isUnclaimed ? user.id : user.talentProfileId!;
  const slug = user.talentSlug;
  const workflowStatus = user.talentWorkflowStatus;
  const publishedGlobally = user.publishedGlobally;

  function handleSendInvite() {
    if (!inviteEmail.includes("@")) return;
    setInviteStatus("pending");
    setInviteError(null);
    startTransition(async () => {
      const res = await sendPlatformClaimInvite(talentId, inviteEmail);
      if (res.ok) {
        setInviteStatus("ok");
        setInviteEmail("");
      } else {
        setInviteStatus("error");
        setInviteError(res.error);
      }
    });
  }

  return (
    <section style={{ marginBottom: 18 }}>
      <div
        onClick={() => setIsOpen(!isOpen)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && setIsOpen(!isOpen)}
        style={{
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 13,
          fontWeight: 600,
          color: HQ.ink,
          fontFamily: HQ_FM,
          letterSpacing: 0.2,
          textTransform: "uppercase",
          marginBottom: isOpen ? 8 : 0,
          userSelect: "none",
        }}
      >
        <span style={{ fontSize: 11 }}>{isOpen ? "▼" : "▶"}</span>
        Talent Record
        {isUnclaimed && (
          <span
            style={{
              fontSize: 10,
              color: HQ.amber,
              fontWeight: 700,
              letterSpacing: 0.4,
              marginLeft: 4,
            }}
          >
            · UNCLAIMED
          </span>
        )}
      </div>

      {isOpen && (
        <div>
          <div
            style={{
              background: HQ.cardSoft,
              border: `1px solid ${HQ.borderSoft}`,
              borderRadius: 10,
              padding: "10px 12px",
              fontSize: 12.5,
              color: HQ.inkMuted,
              display: "grid",
              gridTemplateColumns: "auto 1fr",
              gap: "6px 12px",
              marginBottom: 10,
            }}
          >
            <span style={{ color: HQ.inkDim }}>Talent ID</span>
            <span style={{ fontFamily: HQ_FM, fontSize: 11, color: HQ.ink }}>
              {talentId}
            </span>

            <span style={{ color: HQ.inkDim }}>Slug</span>
            <span>
              {slug ? (
                <Link
                  href={`/t/${slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: HQ.blue, fontFamily: HQ_FM, fontSize: 11.5 }}
                >
                  /t/{slug} ↗
                </Link>
              ) : (
                <span style={{ color: HQ.inkDim }}>—</span>
              )}
            </span>

            <span style={{ color: HQ.inkDim }}>Workflow</span>
            <span
              style={{
                color: workflowStatusColor(workflowStatus),
                fontWeight: 600,
                fontSize: 12,
              }}
            >
              {workflowLabel(workflowStatus)}
            </span>

            <span style={{ color: HQ.inkDim }}>Published globally</span>
            <span
              style={{
                color: publishedGlobally ? HQ.green : HQ.inkDim,
                fontWeight: publishedGlobally ? 600 : undefined,
              }}
            >
              {publishedGlobally === null ? "—" : publishedGlobally ? "Yes" : "No"}
            </span>

            <span style={{ color: HQ.inkDim }}>Claim status</span>
            <span
              style={{
                color: isUnclaimed ? HQ.amber : HQ.green,
                fontWeight: 600,
                fontSize: 12,
              }}
            >
              {isUnclaimed ? "Unclaimed" : "Claimed"}
            </span>
          </div>

          {/* Claim invite (unclaimed only) */}
          {isUnclaimed && (
            <div
              style={{
                background: HQ.cardSoft,
                border: `1px solid ${HQ.borderSoft}`,
                borderRadius: 10,
                padding: "12px",
              }}
            >
              <div
                style={{
                  fontSize: 11.5,
                  fontWeight: 600,
                  color: HQ.ink,
                  marginBottom: 8,
                }}
              >
                Send claim invite
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => {
                    setInviteEmail(e.target.value);
                    if (inviteStatus !== "idle") setInviteStatus("idle");
                  }}
                  placeholder="talent@example.com"
                  disabled={inviteStatus === "pending"}
                  style={{
                    flex: 1,
                    padding: "7px 10px",
                    borderRadius: 8,
                    border: `1px solid ${HQ.borderSoft}`,
                    background: HQ.bg,
                    color: HQ.ink,
                    fontSize: 12,
                    fontFamily: HQ_F,
                    outline: "none",
                  }}
                />
                <button
                  type="button"
                  disabled={
                    inviteStatus === "pending" || !inviteEmail.includes("@")
                  }
                  onClick={handleSendInvite}
                  style={{
                    padding: "7px 12px",
                    borderRadius: 8,
                    border: `1px solid ${HQ.borderSoft}`,
                    background: HQ.cardSoft,
                    color: HQ.ink,
                    fontSize: 12,
                    fontWeight: 600,
                    fontFamily: HQ_F,
                    cursor:
                      inviteStatus === "pending" || !inviteEmail.includes("@")
                        ? "not-allowed"
                        : "pointer",
                    opacity:
                      inviteStatus === "pending" || !inviteEmail.includes("@")
                        ? 0.5
                        : 1,
                    flexShrink: 0,
                  }}
                >
                  {inviteStatus === "pending" ? "Sending…" : "Send invite"}
                </button>
              </div>
              {inviteStatus === "ok" && (
                <div
                  style={{
                    marginTop: 8,
                    fontSize: 12,
                    color: HQ.green,
                    fontWeight: 600,
                  }}
                >
                  ✓ Invite sent successfully.
                </div>
              )}
              {inviteStatus === "error" && inviteError && (
                <div
                  style={{
                    marginTop: 8,
                    fontSize: 12,
                    color: HQ.amber,
                    fontWeight: 600,
                  }}
                >
                  Error: {inviteError}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
