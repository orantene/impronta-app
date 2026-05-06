"use client";

// WorkspaceActivationBanner — prototype-fidelity onboarding checklist.
// Matches the prototype's "SETUP / You're already live." design:
//   SETUP  ·  N of M steps  ·  ~10 min total              [×]
//   You're already live.
//   Five steps to your first booking. About 10 minutes total.
//
//   FIRST 10 MINUTES  [▓▓▓▓▓░░░░░]  60% complete
//
//   ▼ Your activation arc
//     All five are reversible — skip what you don't need.
//     [ step items ]

import { useState } from "react";

const C = {
  ink:        "#0B0B0D",
  inkMuted:   "rgba(11,11,13,0.55)",
  inkDim:     "rgba(11,11,13,0.35)",
  border:     "rgba(24,24,27,0.08)",
  borderSoft: "rgba(24,24,27,0.06)",
  surface:    "rgba(11,11,13,0.02)",
  accent:     "#0F4F3E",
  accentSoft: "rgba(15,79,62,0.10)",
  green:      "#2E7D5B",
  coral:      "#B04A22",
  coralSoft:  "rgba(176,74,34,0.09)",
  white:      "#ffffff",
} as const;

const FONT = '"Inter", system-ui, sans-serif';

type Step = {
  id: string;
  label: string;
  desc: string;
  done: boolean;
  cta: string;
  href: string;
  mins: number;
  optional?: boolean;
};

export function WorkspaceActivationBanner({
  tenantSlug,
  hasRoster,
  hasInquiry,
}: {
  tenantSlug: string;
  hasRoster: boolean;
  hasInquiry: boolean;
}) {
  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded] = useState(true);

  const steps: Step[] = [
    {
      id: "talent",
      label: "Add your first talent",
      desc: "Import or invite talent to your roster.",
      done: hasRoster,
      cta: "Add talent",
      href: `/${tenantSlug}/admin/roster`,
      mins: 5,
    },
    {
      id: "profile",
      label: "Publish a profile",
      desc: "Make at least one talent visible publicly.",
      done: hasRoster, // if they have roster, assume at least one published
      cta: "Open roster",
      href: `/${tenantSlug}/admin/roster`,
      mins: 3,
    },
    {
      id: "storefront",
      label: "Copy your storefront link",
      desc: "Share with a client — it's live now.",
      done: false,
      cta: "Open",
      href: `/${tenantSlug}/admin/website`,
      mins: 1,
    },
    {
      id: "inquiry",
      label: "Walk through a demo inquiry",
      desc: "Try the booking flow end-to-end.",
      done: hasInquiry,
      cta: "New inquiry",
      href: `/${tenantSlug}/admin/work`,
      mins: 5,
    },
    {
      id: "teammate",
      label: "Invite a teammate",
      desc: "Up to 1 collaborator on Free.",
      done: false,
      cta: "Invite",
      href: `/${tenantSlug}/admin/settings?tab=team`,
      mins: 1,
      optional: true,
    },
  ];

  const doneCount = steps.filter((s) => s.done).length;
  const pct = Math.round((doneCount / steps.length) * 100);
  const allDone = doneCount === steps.length;
  const hasAnyActivity = hasRoster || hasInquiry;

  if (dismissed || allDone) return null;

  return (
    <div
      style={{
        background: C.white,
        borderRadius: 14,
        border: `1px solid ${C.border}`,
        overflow: "hidden",
        fontFamily: FONT,
        marginBottom: 20,
      }}
    >
      {/* ── Top bar: SETUP label + step count + dismiss ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 18px 0",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: 1,
              textTransform: "uppercase",
              color: C.coral,
              fontFamily: FONT,
            }}
          >
            Setup
          </span>
          <span style={{ fontSize: 11, color: C.inkMuted }}>·</span>
          <span style={{ fontSize: 11.5, color: C.inkMuted, fontWeight: 500 }}>
            {doneCount} of {steps.length} steps · ~10 min total
          </span>
        </div>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss setup checklist"
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: C.inkDim,
            fontFamily: FONT,
            fontSize: 16,
            lineHeight: 1,
            padding: "0 2px",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          ×
        </button>
      </div>

      {/* ── Headline + sub ── */}
      <div style={{ padding: "10px 18px 14px" }}>
        <h2
          style={{
            fontFamily: FONT,
            fontSize: 22,
            fontWeight: 700,
            color: C.ink,
            margin: 0,
            letterSpacing: -0.4,
            lineHeight: 1.2,
          }}
        >
          {hasAnyActivity ? "You're already live." : "Get your workspace ready."}
        </h2>
        <p style={{ fontFamily: FONT, fontSize: 13, color: C.inkMuted, margin: "6px 0 0", lineHeight: 1.4 }}>
          Five steps to your first booking. About 10 minutes total.
        </p>
      </div>

      {/* ── Progress bar section ── */}
      <div
        style={{
          padding: "0 18px 14px",
          borderBottom: `1px solid ${C.borderSoft}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: 0.8,
              textTransform: "uppercase",
              color: C.inkDim,
              fontFamily: FONT,
            }}
          >
            First 10 minutes
          </span>
          <span style={{ fontSize: 11, color: C.inkMuted, fontWeight: 500, fontFamily: FONT }}>
            {pct}% complete
          </span>
        </div>
        <div
          style={{
            height: 5,
            background: "rgba(11,11,13,0.07)",
            borderRadius: 999,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${pct}%`,
              background: C.accent,
              borderRadius: 999,
              transition: "width 0.5s ease",
            }}
          />
        </div>
      </div>

      {/* ── Activation arc section ── */}
      <div>
        {/* Collapsible header */}
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            width: "100%",
            padding: "12px 18px",
            background: "none",
            border: "none",
            cursor: "pointer",
            fontFamily: FONT,
            borderBottom: expanded ? `1px solid ${C.borderSoft}` : "none",
          }}
        >
          <div>
            <span style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>
              Your activation arc
            </span>
            <span
              style={{
                fontSize: 11.5,
                color: C.inkMuted,
                marginLeft: 10,
                fontWeight: 400,
              }}
            >
              All five are reversible — skip what you don&apos;t need.
            </span>
          </div>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
            style={{
              color: C.inkMuted,
              transform: expanded ? "rotate(180deg)" : "none",
              transition: "transform 180ms",
              flexShrink: 0,
            }}
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>

        {/* Step list */}
        {expanded && (
          <div>
            {steps.map((step, i) => (
              <div
                key={step.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "11px 18px",
                  borderBottom: i < steps.length - 1 ? `1px solid ${C.borderSoft}` : "none",
                  background: "transparent",
                }}
              >
                {/* Step number / check */}
                <div
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: "50%",
                    background: step.done ? C.accent : "rgba(11,11,13,0.06)",
                    border: step.done ? "none" : `1px solid ${C.border}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    color: step.done ? C.white : C.inkMuted,
                    fontSize: step.done ? 11 : 11,
                    fontWeight: 700,
                    fontFamily: FONT,
                  }}
                >
                  {step.done ? "✓" : String(i + 1)}
                </div>

                {/* Label + desc */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: step.done ? 400 : 500,
                      color: step.done ? C.inkMuted : C.ink,
                      textDecoration: step.done ? "line-through" : "none",
                      fontFamily: FONT,
                      letterSpacing: -0.05,
                    }}
                  >
                    {step.label}
                    {step.optional && (
                      <span
                        style={{
                          marginLeft: 6,
                          fontSize: 10,
                          fontWeight: 600,
                          color: C.inkDim,
                          textDecoration: "none",
                          display: "inline",
                        }}
                      >
                        (optional)
                      </span>
                    )}
                  </div>
                  {step.done ? (
                    <div style={{ fontSize: 11, color: C.green, marginTop: 1, fontFamily: FONT, fontWeight: 500 }}>
                      Auto-detected — already done
                    </div>
                  ) : (
                    <div style={{ fontSize: 11, color: C.inkMuted, marginTop: 1, fontFamily: FONT }}>
                      {step.desc}
                    </div>
                  )}
                </div>

                {/* CTA or time estimate */}
                {!step.done ? (
                  <a
                    href={step.href}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "5px 12px",
                      borderRadius: 999,
                      background: C.accentSoft,
                      border: `1px solid rgba(15,79,62,0.18)`,
                      color: C.accent,
                      textDecoration: "none",
                      fontFamily: FONT,
                      fontSize: 11.5,
                      fontWeight: 600,
                      flexShrink: 0,
                      whiteSpace: "nowrap",
                    }}
                  >
                    <span style={{ fontSize: 9.5, color: C.inkDim, fontWeight: 400 }}>
                      {step.mins} min
                    </span>
                    {step.cta}
                  </a>
                ) : (
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: C.inkDim,
                      fontFamily: FONT,
                      flexShrink: 0,
                    }}
                  >
                    Done
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
