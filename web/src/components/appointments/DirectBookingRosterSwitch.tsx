"use client";

/**
 * Per-roster-row agency gate. Lives OUTSIDE components/admin/shell.
 */

import { useEffect, useState, useTransition } from "react";
import {
  loadRosterDirectBooking,
  setRosterDirectBooking,
} from "@/lib/server-actions/roster-direct-booking";
import { useT } from "@/i18n/use-t";

const C = {
  ink: "#0B0B0D",
  inkMuted: "rgba(11,11,13,0.62)",
  border: "rgba(24,24,27,0.16)",
  borderSoft: "rgba(24,24,27,0.08)",
  error: "#dc2626",
  accent: "#0B0B0D",
} as const;
const FONT = '"Inter", system-ui, sans-serif';
const K = "dashboard.adminWorkspace.appointments";

export function DirectBookingRosterSwitch({ talentId }: { talentId: string }) {
  const t = useT();
  const [enabled, setEnabled] = useState(false);
  const [visible, setVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    loadRosterDirectBooking(talentId).then((res) => {
      if (cancelled) return;
      if (res.ok) {
        setEnabled(res.enabled);
        setVisible(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [talentId]);

  if (!visible) return null;

  return (
    <div
      data-testid="roster-direct-booking-switch"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        marginTop: 12,
        paddingTop: 12,
        borderTop: `1px solid ${C.borderSoft}`,
        fontFamily: FONT,
      }}
    >
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{t(`${K}.rosterSwitchTitle`)}</div>
        <div style={{ fontSize: 12, color: C.inkMuted, marginTop: 2 }}>{t(`${K}.rosterSwitchDesc`)}</div>
        {error && <div style={{ fontSize: 11, color: C.error, marginTop: 6 }}>{error}</div>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label={t(`${K}.rosterSwitchTitle`)}
        disabled={saving}
        onClick={() => {
          const next = !enabled;
          setEnabled(next);
          setSaving(true);
          setError(null);
          startTransition(async () => {
            const res = await setRosterDirectBooking(talentId, next);
            setSaving(false);
            if (!res.ok) {
              setEnabled(!next);
              setError(res.error);
            }
          });
        }}
        style={{
          width: 44,
          height: 24,
          borderRadius: 999,
          border: `1px solid ${enabled ? C.accent : C.border}`,
          background: enabled ? C.accent : "#fff",
          position: "relative",
          cursor: saving ? "wait" : "pointer",
          padding: 0,
        }}
      >
        <span
          style={{
            position: "absolute",
            top: 2,
            left: enabled ? 22 : 2,
            width: 18,
            height: 18,
            borderRadius: "50%",
            background: "#fff",
          }}
        />
      </button>
    </div>
  );
}
