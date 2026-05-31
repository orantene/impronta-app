"use client";

/**
 * Roster · Registration settings form (Tenant Registration Engine, S1).
 *
 * Master "Open for registration" toggle + a plan-gated mode picker
 * (open / approval / exclusive) + default roster visibility + the public CTA
 * label. "Closed" is represented by the master toggle being off, so the user
 * never sees a redundant "closed" card. The server action re-validates the
 * mode against the plan, so locked cards here are UX, not the security gate.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  REGISTRATION_MODE_META,
  type RegistrationMode,
} from "@/lib/access/registration-modes";
import {
  saveRegistrationSettings,
  type SaveRegistrationSettingsInput,
} from "@/app/(workspace)/[tenantSlug]/admin/roster/registration/actions";
import type { RosterVisibility } from "@/lib/saas/registration-settings";

const C = {
  ink: "#0B0B0D",
  inkMuted: "rgba(11,11,13,0.55)",
  inkDim: "rgba(11,11,13,0.35)",
  border: "rgba(24,24,27,0.12)",
  borderSoft: "rgba(24,24,27,0.07)",
  cardBg: "#ffffff",
  surface: "rgba(11,11,13,0.02)",
  accent: "#0F4F3E",
  accentSoft: "rgba(15,79,62,0.08)",
  green: "#2E7D5B",
  rust: "#C04B23",
} as const;

const FONT = '"Inter", system-ui, sans-serif';

const SELECTABLE_MODES: RegistrationMode[] = ["open", "approval", "exclusive"];

function firstSelectable(allowed: RegistrationMode[]): RegistrationMode {
  return SELECTABLE_MODES.find((m) => allowed.includes(m)) ?? "approval";
}

export function RegistrationSettingsClient({
  tenantSlug,
  canManage,
  planLabel,
  allowedModes,
  initial,
}: {
  tenantSlug: string;
  canManage: boolean;
  planLabel: string;
  allowedModes: RegistrationMode[];
  initial: {
    enabled: boolean;
    mode: RegistrationMode;
    defaultRosterVisibility: RosterVisibility;
    ctaLabel: string;
  };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [toast, setToast] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const [enabled, setEnabled] = useState(initial.enabled && initial.mode !== "closed");
  const [mode, setMode] = useState<RegistrationMode>(
    initial.mode === "closed" ? firstSelectable(allowedModes) : initial.mode,
  );
  const [visibility, setVisibility] = useState<RosterVisibility>(initial.defaultRosterVisibility);
  const [ctaLabel, setCtaLabel] = useState(initial.ctaLabel);

  function save() {
    if (!canManage) return;
    setToast(null);
    const payload: SaveRegistrationSettingsInput = {
      enabled,
      mode: enabled ? mode : "closed",
      defaultRosterVisibility: visibility,
      ctaLabel,
    };
    startTransition(async () => {
      const res = await saveRegistrationSettings(tenantSlug, payload);
      if (res.ok) {
        setToast({ kind: "ok", text: "Saved." });
        router.refresh();
      } else {
        setToast({ kind: "err", text: res.error });
      }
    });
  }

  const disabled = !canManage || pending;

  return (
    <div style={{ fontFamily: FONT, display: "flex", flexDirection: "column", gap: 20, maxWidth: 720 }}>
      {!canManage && (
        <div
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            background: C.surface,
            border: `1px solid ${C.borderSoft}`,
            fontSize: 12.5,
            color: C.inkMuted,
          }}
        >
          You can view this setting, but only a Manager or above can change it.
        </div>
      )}

      {/* Master toggle */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          padding: "16px 18px",
          borderRadius: 14,
          background: C.cardBg,
          border: `1px solid ${C.border}`,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <span style={{ fontSize: 15, fontWeight: 650, color: C.ink }}>
            Open for registration
          </span>
          <span style={{ fontSize: 12.5, color: C.inkMuted }}>
            Show a join button on your public site and let talent register.{" "}
            <span style={{ color: C.inkDim }}>Plan: {planLabel}</span>
          </span>
        </div>
        <ToggleSwitch checked={enabled} disabled={disabled} onChange={setEnabled} />
      </div>

      {/* Mode + details — only meaningful when enabled */}
      <fieldset
        disabled={!enabled || disabled}
        style={{
          border: "none",
          margin: 0,
          padding: 0,
          opacity: enabled ? 1 : 0.5,
          transition: "opacity 120ms ease",
          display: "flex",
          flexDirection: "column",
          gap: 18,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: C.ink, letterSpacing: 0.2 }}>
            How registrations are handled
          </span>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {SELECTABLE_MODES.map((m) => {
              const meta = REGISTRATION_MODE_META[m];
              const locked = !allowedModes.includes(m);
              const selected = mode === m;
              return (
                <label
                  key={m}
                  style={{
                    display: "flex",
                    gap: 12,
                    alignItems: "flex-start",
                    padding: "12px 14px",
                    borderRadius: 12,
                    cursor: locked ? "not-allowed" : "pointer",
                    background: selected ? C.accentSoft : C.cardBg,
                    border: `1px solid ${selected ? C.accent : C.border}`,
                    opacity: locked ? 0.55 : 1,
                  }}
                >
                  <input
                    type="radio"
                    name="registration-mode"
                    checked={selected}
                    disabled={locked || !enabled || disabled}
                    onChange={() => setMode(m)}
                    style={{ marginTop: 2, accentColor: C.accent }}
                  />
                  <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <span style={{ fontSize: 13.5, fontWeight: 600, color: C.ink }}>
                      {meta.label}
                      {locked && (
                        <span style={{ marginLeft: 8, fontSize: 11, color: C.rust, fontWeight: 600 }}>
                          Upgrade to enable
                        </span>
                      )}
                    </span>
                    <span style={{ fontSize: 12.5, color: C.inkMuted, lineHeight: 1.4 }}>
                      {meta.description}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 18 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 240, flex: 1 }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: C.ink }}>
              New joiners appear as
            </span>
            <select
              value={visibility}
              disabled={!enabled || disabled}
              onChange={(e) => setVisibility(e.target.value as RosterVisibility)}
              style={{
                padding: "9px 11px",
                borderRadius: 10,
                border: `1px solid ${C.border}`,
                fontSize: 13,
                color: C.ink,
                background: C.cardBg,
                fontFamily: FONT,
              }}
            >
              <option value="roster_only">Roster only (hidden from your public site)</option>
              <option value="site_visible">Visible on your public site</option>
            </select>
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 240, flex: 1 }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: C.ink }}>
              Button label
            </span>
            <input
              type="text"
              value={ctaLabel}
              maxLength={60}
              disabled={!enabled || disabled}
              onChange={(e) => setCtaLabel(e.target.value)}
              placeholder="Join the team"
              style={{
                padding: "9px 11px",
                borderRadius: 10,
                border: `1px solid ${C.border}`,
                fontSize: 13,
                color: C.ink,
                background: C.cardBg,
                fontFamily: FONT,
              }}
            />
          </label>
        </div>
      </fieldset>

      {/* Save */}
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <button
          type="button"
          onClick={save}
          disabled={disabled}
          style={{
            padding: "10px 20px",
            borderRadius: 999,
            border: "none",
            background: disabled ? "rgba(15,79,62,0.4)" : C.accent,
            color: "#fff",
            fontSize: 13.5,
            fontWeight: 600,
            cursor: disabled ? "default" : "pointer",
            fontFamily: FONT,
          }}
        >
          {pending ? "Saving…" : "Save changes"}
        </button>
        {toast && (
          <span style={{ fontSize: 12.5, color: toast.kind === "ok" ? C.green : C.rust }}>
            {toast.text}
          </span>
        )}
      </div>
    </div>
  );
}

function ToggleSwitch({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      style={{
        position: "relative",
        width: 46,
        height: 26,
        flexShrink: 0,
        borderRadius: 999,
        border: "none",
        background: checked ? C.accent : "rgba(11,11,13,0.18)",
        cursor: disabled ? "default" : "pointer",
        transition: "background 140ms ease",
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 3,
          left: checked ? 23 : 3,
          width: 20,
          height: 20,
          borderRadius: "50%",
          background: "#fff",
          transition: "left 140ms ease",
          boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
        }}
      />
    </button>
  );
}
