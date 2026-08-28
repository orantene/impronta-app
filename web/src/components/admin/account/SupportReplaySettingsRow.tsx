"use client";

import { useEffect, useState, useTransition } from "react";
import { useT } from "@/i18n/use-t";
import {
  loadSupportReplayBufferSetting,
  saveSupportReplayBufferSetting,
} from "@/lib/support/replay/replay-actions";

const C = {
  ink: "#0B0B0D",
  inkMuted: "rgba(11,11,13,0.62)",
  borderSoft: "rgba(24,24,27,0.08)",
  error: "#dc2626",
} as const;

export function SupportReplaySettingsRow() {
  const t = useT();
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    void loadSupportReplayBufferSetting().then((r) => {
      if (cancelled) return;
      if (r.ok) setEnabled(r.enabled);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Explicit load state (house rule: no silent waits) — a skeleton row keeps
  // the section from jumping when the setting arrives.
  if (loading) {
    return (
      <div
        aria-busy="true"
        style={{
          background: "#fff",
          border: `1px solid ${C.borderSoft}`,
          padding: "14px 16px",
          marginBottom: 8,
          borderRadius: 10,
          height: 64,
        }}
      >
        <div style={{ width: 180, height: 10, borderRadius: 5, background: "rgba(24,24,27,0.06)" }} />
        <div style={{ width: 260, height: 8, borderRadius: 4, background: "rgba(24,24,27,0.05)", marginTop: 8 }} />
      </div>
    );
  }

  return (
    <div
      style={{
        background: "#fff",
        border: `1px solid ${C.borderSoft}`,
        padding: "14px 16px",
        marginBottom: 8,
        borderRadius: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>
            {t("dashboard.adminWorkspace.replayBufferTitle")}
          </div>
          <div style={{ fontSize: 12, color: C.inkMuted, marginTop: 2 }}>
            {t("dashboard.adminWorkspace.replayBufferDesc")}
          </div>
        </div>
        <label style={{ fontSize: 12, color: C.inkMuted, display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={enabled}
            disabled={saving}
            onChange={(e) => {
              const next = e.target.checked;
              setEnabled(next);
              setSaving(true);
              setError(null);
              startTransition(async () => {
                const r = await saveSupportReplayBufferSetting({ enabled: next });
                setSaving(false);
                if (!r.ok) {
                  setEnabled(!next);
                  setError(r.error);
                }
              });
            }}
          />
          {t("dashboard.adminWorkspace.replayBufferToggle")}
        </label>
      </div>
      {error ? <div style={{ fontSize: 11, color: C.error, marginTop: 6 }}>{error}</div> : null}
      {saving ? (
        <div style={{ fontSize: 11, color: C.inkMuted, marginTop: 6 }}>
          {t("dashboard.adminWorkspace.replayBufferSaving")}
        </div>
      ) : null}
    </div>
  );
}
