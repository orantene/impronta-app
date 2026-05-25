"use client";

import Link from "next/link";

import type { TalentSiteDashboardState } from "@/lib/talent-site/types";

const FONT = '"Inter", system-ui, sans-serif';

type Props = {
  state: TalentSiteDashboardState;
  onUpgrade?: () => void;
};

export function TalentSiteLockedCard({ state, onUpgrade }: Props) {
  const tierLabel = state.displayName;

  return (
    <section
      style={{
        background: "#fff",
        border: "1px solid rgba(24,24,27,0.08)",
        borderRadius: 12,
        padding: "20px 22px",
        fontFamily: FONT,
      }}
    >
      <h3 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 700 }}>
        Personal site — {tierLabel} plan
      </h3>
      <p style={{ margin: "0 0 16px", fontSize: 13, color: "rgba(11,11,13,0.55)", lineHeight: 1.5 }}>
        Upgrade to Max to create, edit, or publish your personal site. Your standard Tulala profile
        at {state.publicProfileUrl ?? "/t/…"} is unchanged.
      </p>
      {state.site?.hasPublishedSnapshot && state.publicSiteUrl ? (
        <p style={{ margin: "0 0 12px", fontSize: 13 }}>
          <Link href={state.publicSiteUrl} target="_blank" rel="noopener noreferrer">
            View your published personal site
          </Link>{" "}
          — still live after downgrade.
        </p>
      ) : null}
      <p style={{ margin: "0 0 16px", fontSize: 13, fontWeight: 600, color: "#0B0B0D" }}>
        Upgrade to Max to edit or publish again.
      </p>
      {onUpgrade ? (
        <button
          type="button"
          onClick={onUpgrade}
          style={{
            background: "#0B0B0D",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            padding: "9px 16px",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: FONT,
          }}
        >
          Compare plans
        </button>
      ) : null}
    </section>
  );
}
