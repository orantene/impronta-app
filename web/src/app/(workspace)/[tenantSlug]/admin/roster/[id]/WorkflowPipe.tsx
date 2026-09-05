// Phase 3.12 / Roster — talent workflow status pipeline.
//
// Visual state machine showing the talent's lifecycle:
//   draft → invited → claimed → published → (archived)
//
// Plus a fast-path "approve & publish" CTA when the agency is ready.
// Colors track the same tier system as the completeness dial.

import * as React from "react";
import { createTranslator } from "@/i18n/messages";

const C = {
  ink:        "#0B0B0D",
  inkMuted:   "rgba(11,11,13,0.55)",
  inkDim:     "rgba(11,11,13,0.35)",
  border:     "rgba(24,24,27,0.10)",
  borderSoft: "rgba(24,24,27,0.06)",
  card:       "#ffffff",
  surface:    "rgba(11,11,13,0.02)",
  accent:     "#0F4F3E",
  accentSoft: "rgba(15,79,62,0.08)",
  amber:      "var(--color-admin-amber)",
  amberSoft:  "rgba(138,111,26,0.10)",
  amberDeep:  "#6E5912",
  success:    "#2E7D5B",
  successSoft:"rgba(46,125,91,0.10)",
  successDeep:"#1E5C40",
  coral:      "#B04A22",
  coralSoft:  "rgba(176,74,34,0.10)",
} as const;

const F = '"Inter", system-ui, sans-serif';

type Stage = {
  key: string;
  label: string;
  description: string;
  matches: (workflow: string, claimed: boolean) => boolean;
};

const STAGES: Stage[] = [
  {
    key: "draft",
    label: "Draft",
    description: "Internal — not visible to anyone outside your team.",
    matches: (w) => w === "draft",
  },
  {
    key: "invited",
    label: "Invited",
    description: "Email out to claim. Talent fills their own profile.",
    matches: (w) => w === "invited",
  },
  {
    key: "claimed",
    label: "Claimed",
    description: "Talent created a Tulala account & owns their profile.",
    matches: (w, claimed) => claimed && w !== "published" && w !== "archived",
  },
  {
    key: "published",
    label: "Published",
    description: "Live on your roster + public talent page.",
    matches: (w) => w === "published" || w === "approved",
  },
];

function activeIndex(workflow: string, claimed: boolean): number {
  for (let i = STAGES.length - 1; i >= 0; i--) {
    if (STAGES[i].matches(workflow, claimed)) return i;
  }
  return 0;
}

function stageColor(state: "past" | "current" | "future"): { bg: string; fg: string; ring: string; track: string } {
  if (state === "past")    return { bg: C.successSoft, fg: C.success, ring: C.success, track: C.success };
  if (state === "current") return { bg: C.accentSoft,  fg: C.accent,  ring: C.accent,  track: C.accent };
  return                          { bg: C.surface,     fg: C.inkDim,  ring: "rgba(24,24,27,0.20)", track: "rgba(24,24,27,0.15)" };
}

export function WorkflowPipe({
  workflowStatus,
  isClaimed,
  isArchived,
  locale,
}: {
  workflowStatus: string;
  isClaimed: boolean;
  isArchived?: boolean;
  locale: string;
}) {
  const t = createTranslator(locale);
  const idx = activeIndex(workflowStatus, isClaimed);
  const isPublished = workflowStatus === "published" || workflowStatus === "approved";

  const stageLabels: Record<string, string> = {
    draft:     t("admin.talent.edit.pipe.stageDraft"),
    invited:   t("admin.talent.edit.pipe.stageInvited"),
    claimed:   t("admin.talent.edit.pipe.stageClaimed"),
    published: t("admin.talent.edit.pipe.stagePublished"),
  };
  const stageDescs: Record<string, string> = {
    draft:     t("admin.talent.edit.pipe.draftDesc"),
    invited:   t("admin.talent.edit.pipe.invitedDesc"),
    claimed:   t("admin.talent.edit.pipe.claimedDesc"),
    published: t("admin.talent.edit.pipe.publishedDesc"),
  };

  if (isArchived) {
    return (
      <section style={{
        background: C.card,
        border: `1px solid ${C.coralSoft}`,
        borderRadius: 14,
        padding: 16, fontFamily: F,
      }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <span style={{
            width: 10, height: 10, borderRadius: "50%",
            background: C.coral, flexShrink: 0,
          }} />
          <h3 style={{
            margin: 0, fontSize: 13, fontWeight: 700, color: C.ink, letterSpacing: -0.05,
          }}>
            {t("admin.talent.edit.pipe.archivedHeader")}
          </h3>
        </div>
        <p style={{
          margin: "6px 0 0", fontSize: 12, color: C.inkMuted, lineHeight: 1.5,
        }}>
          {t("admin.talent.edit.pipe.archivedDesc")}
        </p>
      </section>
    );
  }

  return (
    <section style={{
      background: C.card,
      border: `1px solid ${C.border}`,
      borderRadius: 14, overflow: "hidden",
      fontFamily: F,
    }}>
      <div style={{
        padding: "14px 16px",
        borderBottom: `1px solid ${C.borderSoft}`,
      }}>
        <div style={{
          fontSize: 11, fontWeight: 700, color: C.inkMuted,
          letterSpacing: 0.5, textTransform: "uppercase",
        }}>
          {t("admin.talent.edit.pipe.workflowHeader")}
        </div>
        <div style={{
          fontSize: 13, color: C.ink, marginTop: 4, fontWeight: 500,
        }}>
          {isPublished
            ? t("admin.talent.edit.pipe.liveMsg")
            : isClaimed
            ? t("admin.talent.edit.pipe.claimedMsg")
            : workflowStatus === "invited"
            ? t("admin.talent.edit.pipe.awaitingMsg")
            : t("admin.talent.edit.pipe.draftMsg")}
        </div>
      </div>

      {/* Pipe */}
      <div style={{
        padding: "18px 16px 14px",
        position: "relative",
      }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 0,
          position: "relative",
        }}>
          {STAGES.map((stage, i) => {
            const state: "past" | "current" | "future" =
              i < idx ? "past" : i === idx ? "current" : "future";
            const colors = stageColor(state);
            return (
              <React.Fragment key={stage.key}>
                <div style={{
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
                  flex: "0 0 auto", minWidth: 64,
                  position: "relative", zIndex: 2,
                }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: "50%",
                    background: state === "past" ? colors.fg
                              : state === "current" ? colors.bg
                              : colors.bg,
                    border: state === "current" ? `2px solid ${colors.ring}` : `2px solid ${colors.ring}`,
                    color: state === "past" ? "#fff" : colors.fg,
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    fontSize: 12, fontWeight: 700, letterSpacing: -0.2,
                    transition: "all 200ms",
                    boxShadow: state === "current" ? `0 0 0 4px ${colors.bg}` : "none",
                  }}>
                    {state === "past" ? (
                      <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                        <path d="M3 8.5l3.5 3.5 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    ) : (
                      i + 1
                    )}
                  </div>
                  <div style={{
                    fontSize: 11, fontWeight: state === "current" ? 700 : 500,
                    color: state === "future" ? C.inkDim : colors.fg,
                    textAlign: "center",
                    letterSpacing: state === "current" ? 0.1 : 0,
                  }}>
                    {stageLabels[stage.key] ?? stage.label}
                  </div>
                </div>
                {i < STAGES.length - 1 && (
                  <div style={{
                    flex: 1, height: 2,
                    background: i < idx ? C.success : "rgba(24,24,27,0.10)",
                    margin: "0 -2px",
                    transform: "translateY(-9px)",
                    transition: "background 200ms",
                  }} />
                )}
              </React.Fragment>
            );
          })}
        </div>

        {/* Active stage description */}
        <div style={{
          marginTop: 14, padding: "9px 12px",
          background: C.surface, borderRadius: 10,
          fontSize: 12, color: C.inkMuted, lineHeight: 1.5,
        }}>
          <span style={{
            fontWeight: 700, color: C.ink, letterSpacing: 0.05,
          }}>
            {stageLabels[STAGES[idx].key] ?? STAGES[idx].label}:
          </span>{" "}
          {stageDescs[STAGES[idx].key] ?? STAGES[idx].description}
        </div>
      </div>
    </section>
  );
}
