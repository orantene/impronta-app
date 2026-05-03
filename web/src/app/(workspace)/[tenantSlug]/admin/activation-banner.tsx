"use client";

// WorkspaceActivationBanner — dismissable onboarding checklist.
// Shows 5 setup steps with progress bar. Dismisses when all done
// or user clicks "Remind me later".

import { useState } from "react";

const C = {
  ink:        "#0B0B0D",
  inkMuted:   "rgba(11,11,13,0.55)",
  border:     "rgba(24,24,27,0.08)",
  borderSoft: "rgba(24,24,27,0.06)",
  surface:    "rgba(11,11,13,0.02)",
  accent:     "#0F4F3E",
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

  const steps: Step[] = [
    {
      id: "profile",
      label: "Complete workspace profile",
      desc: "Add logo, bio, and contact info.",
      done: true, // assume profile is set up if they got here
      cta: "Edit",
      href: `/${tenantSlug}/admin/settings`,
    },
    {
      id: "talent",
      label: "Add your first talent",
      desc: "Import or invite talent to your roster.",
      done: hasRoster,
      cta: "Add talent",
      href: `/${tenantSlug}/admin/roster`,
    },
    {
      id: "inquiry",
      label: "Send your first inquiry",
      desc: "Try the booking flow end-to-end.",
      done: hasInquiry,
      cta: "New inquiry",
      href: `/${tenantSlug}/admin/work`,
    },
    {
      id: "domain",
      label: "Set your workspace domain",
      desc: "Go live on your branded URL.",
      done: false,
      cta: "Configure",
      href: `/${tenantSlug}/admin/settings`,
    },
    {
      id: "site",
      label: "Publish your storefront",
      desc: "Let the world discover your talent.",
      done: false,
      cta: "Open Site",
      href: `/${tenantSlug}/admin/site`,
    },
  ];

  const doneCount = steps.filter((s) => s.done).length;
  const pct = Math.round((doneCount / steps.length) * 100);
  const allDone = doneCount === steps.length;

  if (dismissed || allDone) return null;

  return (
    <div
      style={{
        background: C.surface,
        borderRadius: 14,
        border: `1px solid ${C.border}`,
        padding: "16px 18px",
        fontFamily: FONT,
        marginBottom: 20,
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.ink, marginBottom: 2 }}>
            Get your workspace ready
          </div>
          <div style={{ fontSize: 12, color: C.inkMuted }}>
            {doneCount} of {steps.length} steps complete
          </div>
        </div>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: 12,
            color: C.inkMuted,
            fontFamily: FONT,
            padding: "2px 4px",
          }}
        >
          Dismiss
        </button>
      </div>

      {/* Progress bar */}
      <div
        style={{
          height: 5,
          background: "rgba(11,11,13,0.08)",
          borderRadius: 999,
          overflow: "hidden",
          marginBottom: 14,
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

      {/* Steps */}
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {steps.map((step) => (
          <div
            key={step.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 10px",
              borderRadius: 8,
              background: step.done ? "transparent" : C.white,
              border: `1px solid ${step.done ? "transparent" : C.borderSoft}`,
              opacity: step.done ? 0.5 : 1,
            }}
          >
            <div
              style={{
                width: 18,
                height: 18,
                borderRadius: "50%",
                background: step.done ? C.accent : "rgba(11,11,13,0.08)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              {step.done && <span style={{ color: C.white, fontSize: 10, fontWeight: 700 }}>✓</span>}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 12.5,
                  fontWeight: step.done ? 400 : 600,
                  color: C.ink,
                  textDecoration: step.done ? "line-through" : "none",
                }}
              >
                {step.label}
              </div>
              {!step.done && (
                <div style={{ fontSize: 11, color: C.inkMuted, marginTop: 1 }}>
                  {step.desc}
                </div>
              )}
            </div>
            {!step.done && (
              <a
                href={step.href}
                style={{
                  padding: "4px 10px",
                  borderRadius: 999,
                  background: C.accent,
                  color: C.white,
                  textDecoration: "none",
                  fontFamily: FONT,
                  fontSize: 11,
                  fontWeight: 700,
                  flexShrink: 0,
                  display: "inline-flex",
                  alignItems: "center",
                }}
              >
                {step.cta}
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
