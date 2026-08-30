"use client";

/**
 * Per-roster-row agency gates. Lives OUTSIDE components/admin/shell.
 *
 * Two switches, two columns. The release switch only mounts when this
 * row is the confirmed-exclusive primary — elsewhere it cannot do anything.
 */

import { useEffect, useState, useTransition } from "react";
import {
  loadRosterDirectBooking,
  setRosterDirectBooking,
  setRosterExternalBookingReleased,
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

function Toggle({
  checked,
  label,
  disabled,
  onToggle,
}: {
  checked: boolean;
  label: string;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
      style={{
        width: 44,
        height: 24,
        borderRadius: 999,
        border: `1px solid ${checked ? C.accent : C.border}`,
        background: checked ? C.accent : "#fff",
        position: "relative",
        cursor: disabled ? "wait" : "pointer",
        padding: 0,
        flexShrink: 0,
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 2,
          left: checked ? 22 : 2,
          width: 18,
          height: 18,
          borderRadius: "50%",
          background: "#fff",
        }}
      />
    </button>
  );
}

export function DirectBookingRosterSwitch({ talentId }: { talentId: string }) {
  const t = useT();
  const [enabled, setEnabled] = useState(false);
  const [released, setReleased] = useState(false);
  const [showRelease, setShowRelease] = useState(false);
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
        setReleased(res.exclusiveReleased);
        setShowRelease(res.showExclusiveRelease);
        setVisible(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [talentId]);

  if (!visible) return null;

  return (
    <div style={{ fontFamily: FONT }}>
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
        }}
      >
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>
            {t(`${K}.rosterSwitchTitle`)}
          </div>
          <div style={{ fontSize: 12, color: C.inkMuted, marginTop: 2 }}>
            {t(`${K}.rosterSwitchDesc`)}
          </div>
          {error && !showRelease && (
            <div style={{ fontSize: 11, color: C.error, marginTop: 6 }}>{error}</div>
          )}
        </div>
        <Toggle
          checked={enabled}
          label={t(`${K}.rosterSwitchTitle`)}
          disabled={saving}
          onToggle={() => {
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
        />
      </div>
      {showRelease ? (
        <div
          data-testid="roster-external-booking-release"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            marginTop: 12,
            paddingTop: 12,
            borderTop: `1px solid ${C.borderSoft}`,
          }}
        >
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>
              {t(`${K}.rosterReleaseTitle`)}
            </div>
            <div style={{ fontSize: 12, color: C.inkMuted, marginTop: 2 }}>
              {t(`${K}.rosterReleaseDesc`)}
            </div>
            {error && (
              <div style={{ fontSize: 11, color: C.error, marginTop: 6 }}>{error}</div>
            )}
          </div>
          <Toggle
            checked={released}
            label={t(`${K}.rosterReleaseTitle`)}
            disabled={saving}
            onToggle={() => {
              const next = !released;
              setReleased(next);
              setSaving(true);
              setError(null);
              startTransition(async () => {
                const res = await setRosterExternalBookingReleased(talentId, next);
                setSaving(false);
                if (!res.ok) {
                  setReleased(!next);
                  setError(res.error);
                }
              });
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
