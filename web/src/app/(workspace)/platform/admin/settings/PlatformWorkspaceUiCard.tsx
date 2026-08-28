"use client";

import { useState, useTransition } from "react";

import { updatePlatformWorkspaceUi } from "@/lib/server-actions/admin-platform-workspace-ui";
import type { PlatformWorkspaceUi } from "@/lib/platform/workspace-ui";
import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";

/**
 * Super-admin switches for the workspace shell's ambient UI: the floating
 * bottom-right "+" quick-action button, the first-run guided tour, and the
 * storefront admin quick bar.
 *
 * The FAB and the tour default OFF (hidden) — flipping a switch here shows the
 * surface again for every workspace on the platform. The quick bar defaults ON,
 * because it shipped visible in #1001 and adding a hidden-by-default switch
 * would have silently removed a live feature.
 */
export function PlatformWorkspaceUiCard({ current }: { current: PlatformWorkspaceUi }) {
  const t = useT();
  const [fabEnabled, setFabEnabled] = useState(current.fabEnabled);
  const [tourEnabled, setTourEnabled] = useState(current.tourEnabled);
  const [quickBarEnabled, setQuickBarEnabled] = useState(current.quickBarEnabled);
  const [supportEnabled, setSupportEnabled] = useState(current.supportEnabled);
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);

  const dirty =
    fabEnabled !== current.fabEnabled ||
    tourEnabled !== current.tourEnabled ||
    quickBarEnabled !== current.quickBarEnabled ||
    supportEnabled !== current.supportEnabled;

  const save = () => {
    setStatus(null);
    startTransition(async () => {
      const r = await updatePlatformWorkspaceUi({
        fabEnabled,
        tourEnabled,
        quickBarEnabled,
        supportEnabled,
      });
      setStatus(
        r.ok
          ? { ok: true, msg: t("dashboard.platform.settings.workspaceUiSaved") }
          : { ok: false, msg: interpolate(t("dashboard.platform.settings.failed"), { error: r.error }) },
      );
    });
  };

  const rows: Array<{
    checked: boolean;
    onChange: (v: boolean) => void;
    labelKey: string;
    hintKey: string;
  }> = [
    {
      checked: fabEnabled,
      onChange: setFabEnabled,
      labelKey: "dashboard.platform.settings.workspaceUiFabLabel",
      hintKey: "dashboard.platform.settings.workspaceUiFabHint",
    },
    {
      checked: tourEnabled,
      onChange: setTourEnabled,
      labelKey: "dashboard.platform.settings.workspaceUiTourLabel",
      hintKey: "dashboard.platform.settings.workspaceUiTourHint",
    },
    {
      checked: quickBarEnabled,
      onChange: setQuickBarEnabled,
      labelKey: "dashboard.platform.settings.workspaceUiQuickBarLabel",
      hintKey: "dashboard.platform.settings.workspaceUiQuickBarHint",
    },
    {
      checked: supportEnabled,
      onChange: setSupportEnabled,
      labelKey: "dashboard.platform.settings.workspaceUiSupportLabel",
      hintKey: "dashboard.platform.settings.workspaceUiSupportHint",
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, fontSize: 13 }}>
      {rows.map((row) => (
        <label
          key={row.labelKey}
          style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}
        >
          <input
            type="checkbox"
            checked={row.checked}
            onChange={(e) => row.onChange(e.target.checked)}
            style={{ marginTop: 2, width: 15, height: 15, accentColor: "#5DD3A0" }}
          />
          <span style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <span style={{ fontWeight: 600 }}>{t(row.labelKey)}</span>
            <span style={{ color: "#6b6b76", lineHeight: 1.45, fontSize: 12 }}>{t(row.hintKey)}</span>
          </span>
        </label>
      ))}

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          type="button"
          disabled={!dirty || pending}
          onClick={save}
          style={{
            padding: "8px 16px",
            borderRadius: 8,
            border: "none",
            fontSize: 13,
            fontWeight: 600,
            background: !dirty || pending ? "#c9c9d1" : "#111118",
            color: "#fff",
            cursor: !dirty || pending ? "default" : "pointer",
          }}
        >
          {pending ? t("dashboard.platform.settings.saving") : t("dashboard.platform.settings.save")}
        </button>
        {status && (
          <span style={{ fontSize: 12.5, color: status.ok ? "#067647" : "#b42318" }}>{status.msg}</span>
        )}
      </div>
    </div>
  );
}
