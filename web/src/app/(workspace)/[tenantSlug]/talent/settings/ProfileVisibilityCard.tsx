"use client";

/**
 * ProfileVisibilityCard — the talent's own global show/hide switch.
 *
 * When hidden, the talent is removed from every directory, agency site and
 * public page across all of Tulala — this overrides any agency's per-roster
 * `agency_visibility` ("eye") setting. Writes `talent_profiles.is_publicly_hidden`
 * via `setTalentProfileVisibility`.
 *
 * Lives in the talent/settings route folder (not under components/admin/shell)
 * so it can use inline styles freely — same pattern as ContactPrefsShell.
 */

import { useState, useTransition } from "react";
import { Toggle } from "@/components/admin/shell/internal/primitives";
import { setTalentProfileVisibility } from "./actions";

const C = {
  ink:        "#0B0B0D",
  inkMuted:   "rgba(11,11,13,0.62)",
  borderSoft: "rgba(24,24,27,0.08)",
  accentSoft: "rgba(15,79,62,0.10)",
  accentDeep: "#093328",
  slate:      "#52606D",
  slateDeep:  "#3A4651",
  slateSoft:  "rgba(82,96,109,0.10)",
  error:      "#c0392b",
} as const;

const FONT = '"Inter", system-ui, sans-serif';

export function ProfileVisibilityCard({
  tenantSlug,
  talentId,
  initialHidden,
}: {
  tenantSlug: string;
  talentId: string;
  initialHidden: boolean;
}) {
  const [hidden, setHidden] = useState(initialHidden);
  const [pending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const visible = !hidden;

  const apply = (nextVisible: boolean) => {
    if (pending) return;
    const nextHidden = !nextVisible;
    setHidden(nextHidden);
    setErrorMsg(null);
    startTransition(async () => {
      const res = await setTalentProfileVisibility(tenantSlug, talentId, nextHidden);
      if (!res.ok) {
        setHidden(!nextHidden); // revert
        setErrorMsg(res.error);
      }
    });
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: "14px 16px",
        marginBottom: 16,
        borderRadius: 12,
        background: hidden ? C.slateSoft : "#fff",
        border: `1px solid ${hidden ? "rgba(82,96,109,0.28)" : C.borderSoft}`,
        fontFamily: FONT,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span
          aria-hidden
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: hidden ? "rgba(82,96,109,0.16)" : C.accentSoft,
            color: hidden ? C.slateDeep : C.accentDeep,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {hidden ? (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c6.5 0 10 7 10 7a13.2 13.2 0 0 1-1.67 2.68" />
              <path d="M6.61 6.61A13.5 13.5 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.39-1.61" />
              <path d="m2 2 20 20" />
              <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
            </svg>
          ) : (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          )}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>
            Profile visibility
          </div>
          <div style={{ fontSize: 11.5, color: C.inkMuted, marginTop: 1, lineHeight: 1.45 }}>
            {visible
              ? "Visible across Tulala — agencies can list you in their directories, search and public pages."
              : "Hidden everywhere — you won't appear in any directory, agency site or public page until you turn this back on."}
          </div>
        </div>
        <Toggle
          on={visible}
          onChange={(v) => apply(v)}
          label="Profile visible across Tulala"
        />
      </div>
      {pending && (
        <div style={{ fontSize: 11, color: C.inkMuted }}>Saving…</div>
      )}
      {errorMsg && (
        <div role="alert" style={{ fontSize: 11.5, color: C.error }}>
          {errorMsg}
        </div>
      )}
    </div>
  );
}
