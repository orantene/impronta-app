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
import { useT } from "@/i18n/use-t";
import type { PlatformUserRow } from "../../platform-data";

type Translate = (key: string) => string;

function workflowStatusColor(status: string | null): string {
  if (!status) return HQ.inkDim;
  if (status === "published") return HQ.green;
  if (status === "approved") return HQ.green;
  if (status === "draft") return HQ.inkMuted;
  if (status === "hidden") return HQ.amber;
  if (status === "archived") return HQ.red ?? HQ.amber;
  return HQ.inkMuted;
}

// Localized talent workflow-status labels; unknown values fall back to a
// humanized form of the raw enum value.
const WORKFLOW_LABEL_KEY: Record<string, string> = {
  draft: "dashboard.platform.users.talentRecord.wf.draft",
  approved: "dashboard.platform.users.talentRecord.wf.approved",
  published: "dashboard.platform.users.talentRecord.wf.published",
  hidden: "dashboard.platform.users.talentRecord.wf.hidden",
  archived: "dashboard.platform.users.talentRecord.wf.archived",
};

function workflowLabel(status: string | null, t: Translate): string {
  if (!status) return "—";
  const key = WORKFLOW_LABEL_KEY[status];
  if (key) return t(key);
  return status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, " ");
}

export function TalentRecordSection({ user }: { user: PlatformUserRow }) {
  const t = useT();
  const [isOpen, setIsOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteStatus, setInviteStatus] = useState<
    "idle" | "pending" | "ok" | "error"
  >("idle");
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Show for: unclaimed talent rows, humans with a linked talent profile,
  // or humans flagged isTalent (app_role=talent) but missing a profile row.
  const hasTalent =
    user.kind === "unclaimed_talent" ||
    user.talentProfileId !== null ||
    user.isTalent;

  if (!hasTalent) return null;

  // Human is a talent by role but has no linked talent_profiles row yet
  const noProfile =
    user.kind === "human" && user.talentProfileId === null && user.isTalent;

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
        {t("dashboard.platform.users.talentRecord.title")}
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
            · {t("dashboard.platform.users.talentRecord.unclaimedTag")}
          </span>
        )}
      </div>

      {isOpen && noProfile && (
        <div
          style={{
            padding: "10px 12px",
            fontSize: 12.5,
            color: HQ.inkDim,
            background: HQ.cardSoft,
            border: `1px solid ${HQ.borderSoft}`,
            borderRadius: 10,
          }}
        >
          {t("dashboard.platform.users.talentRecord.noProfile")}
        </div>
      )}

      {isOpen && !noProfile && (
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
            <span style={{ color: HQ.inkDim }}>{t("dashboard.platform.users.talentRecord.talentId")}</span>
            <span style={{ fontFamily: HQ_FM, fontSize: 11, color: HQ.ink }}>
              {talentId}
            </span>

            <span style={{ color: HQ.inkDim }}>{t("dashboard.platform.users.talentRecord.slug")}</span>
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

            <span style={{ color: HQ.inkDim }}>{t("dashboard.platform.users.talentRecord.workflow")}</span>
            <span
              style={{
                color: workflowStatusColor(workflowStatus),
                fontWeight: 600,
                fontSize: 12,
              }}
            >
              {workflowLabel(workflowStatus, t)}
            </span>

            <span style={{ color: HQ.inkDim }}>{t("dashboard.platform.users.talentRecord.publishedGlobally")}</span>
            <span
              style={{
                color: publishedGlobally ? HQ.green : HQ.inkDim,
                fontWeight: publishedGlobally ? 600 : undefined,
              }}
            >
              {publishedGlobally === null ? "—" : publishedGlobally ? t("dashboard.platform.users.talentRecord.yes") : t("dashboard.platform.users.talentRecord.no")}
            </span>

            <span style={{ color: HQ.inkDim }}>{t("dashboard.platform.users.talentRecord.claimStatus")}</span>
            <span
              style={{
                color: isUnclaimed ? HQ.amber : HQ.green,
                fontWeight: 600,
                fontSize: 12,
              }}
            >
              {isUnclaimed ? t("dashboard.platform.users.talentRecord.unclaimed") : t("dashboard.platform.users.talentRecord.claimed")}
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
                {t("dashboard.platform.users.talentRecord.sendClaimInvite")}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => {
                    setInviteEmail(e.target.value);
                    if (inviteStatus !== "idle") setInviteStatus("idle");
                  }}
                  placeholder={t("dashboard.platform.users.talentRecord.emailPlaceholder")}
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
                  {inviteStatus === "pending" ? t("dashboard.platform.users.talentRecord.sending") : t("dashboard.platform.users.talentRecord.sendInvite")}
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
                  ✓ {t("dashboard.platform.users.talentRecord.inviteSent")}
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
                  {t("dashboard.platform.users.talentRecord.errorPrefix")} {inviteError}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
