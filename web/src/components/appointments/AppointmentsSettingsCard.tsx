"use client";

/**
 * Workspace appointments master switch, terminology, defaults, presets.
 * Lives OUTSIDE components/admin/shell.
 */

import { useEffect, useState, useTransition, type ReactNode } from "react";
import {
  loadTenantAppointmentsSettings,
  updateTenantAppointmentsSettings,
} from "@/lib/server-actions/appointments-settings-tenant";
import {
  DEFAULT_TENANT_APPOINTMENTS,
  type AppointmentPresetId,
  type TenantAppointmentsSettings,
} from "@/lib/scheduling/appointments-settings-types";
import { getAppointmentPreset } from "@/lib/scheduling/appointment-presets";
import { TERMINOLOGY_IDS, type TerminologyId } from "@/lib/scheduling/terminology";
import { useT } from "@/i18n/use-t";

const C = {
  ink: "#0B0B0D",
  inkMuted: "rgba(11,11,13,0.62)",
  border: "rgba(24,24,27,0.16)",
  borderSoft: "rgba(24,24,27,0.08)",
  surface: "rgba(24,24,27,0.03)",
  error: "#dc2626",
  errorSoft: "#FCA5A5",
  success: "#16a34a",
  accent: "#0B0B0D",
} as const;

const FONT = '"Inter", system-ui, sans-serif';
const K = "dashboard.adminWorkspace.appointments";

const PRESETS: AppointmentPresetId[] = ["default", "barbershop", "salon", "clinic"];

export function AppointmentsSettingsCard({ tenantSlug }: { tenantSlug: string }) {
  const t = useT();
  const [settings, setSettings] = useState<TenantAppointmentsSettings>(DEFAULT_TENANT_APPOINTMENTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedOk, setSavedOk] = useState(false);
  const [, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    loadTenantAppointmentsSettings()
      .then((res) => {
        if (cancelled) return;
        if (res.ok) setSettings(res.data);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function save(next: TenantAppointmentsSettings) {
    const previous = settings;
    setSettings(next);
    setSaving(true);
    setError(null);
    setSavedOk(false);
    startTransition(async () => {
      const res = await updateTenantAppointmentsSettings(tenantSlug, next);
      setSaving(false);
      if (res.ok) {
        setSettings(res.data);
        setSavedOk(true);
        setTimeout(() => setSavedOk(false), 2000);
      } else {
        setSettings(previous);
        setError(res.error);
      }
    });
  }

  if (loading) return null;

  const inputBoxStyle = {
    fontSize: 13,
    color: C.ink,
    fontFamily: FONT,
    background: saving ? C.surface : "#fff",
    border: `1px solid ${error ? C.errorSoft : C.border}`,
    borderRadius: 8,
    padding: "6px 10px",
    outline: "none",
  } as const;

  return (
    <div
      data-testid="agency-appointments-settings-card"
      style={{
        background: "#fff",
        border: `1px solid ${C.borderSoft}`,
        padding: "14px 16px",
        marginBottom: 8,
        fontFamily: FONT,
        borderRadius: 10,
      }}
    >
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{t(`${K}.label`)}</div>
        <div style={{ fontSize: 12, color: C.inkMuted, marginTop: 2 }}>{t(`${K}.desc`)}</div>
      </div>

      <Row
        title={t(`${K}.masterTitle`)}
        desc={t(`${K}.masterDesc`)}
        right={
          <Switch
            checked={settings.enabled}
            disabled={saving}
            label={t(`${K}.masterTitle`)}
            onClick={() => save({ ...settings, enabled: !settings.enabled })}
          />
        }
      />

      <Row
        title={t(`${K}.terminologyTitle`)}
        desc={t(`${K}.terminologyDesc`)}
        right={
          <select
            aria-label={t(`${K}.terminologyTitle`)}
            value={settings.terminology}
            disabled={saving || !settings.enabled}
            onChange={(e) =>
              save({ ...settings, terminology: e.target.value as TerminologyId })
            }
            style={{ ...inputBoxStyle, minWidth: 180, cursor: saving ? "wait" : "pointer" }}
          >
            {TERMINOLOGY_IDS.map((id) => (
              <option key={id} value={id}>
                {t(`${K}.term.${id}`)}
              </option>
            ))}
          </select>
        }
      />

      <Row
        title={t(`${K}.timezoneTitle`)}
        desc={t(`${K}.timezoneDesc`)}
        right={
          <input
            aria-label={t(`${K}.timezoneTitle`)}
            defaultValue={settings.timezone}
            disabled={saving || !settings.enabled}
            onBlur={(e) => {
              const next = e.target.value.trim() || "UTC";
              if (next !== settings.timezone) save({ ...settings, timezone: next });
            }}
            style={{ ...inputBoxStyle, minWidth: 200 }}
          />
        }
      />

      <Row
        title={t(`${K}.allowDirectTitle`)}
        desc={t(`${K}.allowDirectDesc`)}
        right={
          <Switch
            checked={settings.allowTalentDirectBooking}
            disabled={saving || !settings.enabled}
            label={t(`${K}.allowDirectTitle`)}
            onClick={() =>
              save({
                ...settings,
                allowTalentDirectBooking: !settings.allowTalentDirectBooking,
              })
            }
          />
        }
      />

      <Row
        title={t(`${K}.presetTitle`)}
        desc={t(`${K}.presetDesc`)}
        right={
          <select
            aria-label={t(`${K}.presetTitle`)}
            value={settings.presetId ?? ""}
            disabled={saving || !settings.enabled}
            onChange={(e) => {
              const id = e.target.value as AppointmentPresetId | "";
              if (!id) {
                save({ ...settings, presetId: null });
                return;
              }
              const preset = getAppointmentPreset(id);
              save({
                ...settings,
                presetId: id,
                defaults: preset.defaults,
                timezone: preset.timezoneHint ?? settings.timezone,
              });
            }}
            style={{ ...inputBoxStyle, minWidth: 180, cursor: saving ? "wait" : "pointer" }}
          >
            <option value="">{t(`${K}.presetNone`)}</option>
            {PRESETS.map((id) => (
              <option key={id} value={id}>
                {t(`${K}.preset.${id}`)}
              </option>
            ))}
          </select>
        }
      />

      <div style={{ paddingTop: 10, marginTop: 10, borderTop: `1px solid ${C.borderSoft}` }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{t(`${K}.defaultsTitle`)}</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 8 }}>
          {(
            [
              ["slotMinutes", t(`${K}.slotMinutes`)],
              ["bufferBeforeMin", t(`${K}.bufferBefore`)],
              ["bufferAfterMin", t(`${K}.bufferAfter`)],
              ["minNoticeMin", t(`${K}.minNotice`)],
              ["horizonDays", t(`${K}.horizonDays`)],
            ] as const
          ).map(([key, label]) => (
            <label key={key} style={{ fontSize: 11, color: C.inkMuted }}>
              {label}
              <input
                type="number"
                defaultValue={settings.defaults[key]}
                disabled={saving || !settings.enabled}
                onBlur={(e) => {
                  const n = Number(e.target.value);
                  if (!Number.isFinite(n) || n === settings.defaults[key]) return;
                  save({
                    ...settings,
                    defaults: { ...settings.defaults, [key]: Math.round(n) },
                  });
                }}
                style={{ ...inputBoxStyle, width: 72, display: "block", marginTop: 4 }}
              />
            </label>
          ))}
        </div>
      </div>

      {saving && <div style={{ fontSize: 11, color: C.inkMuted, marginTop: 8 }}>{t(`${K}.saving`)}</div>}
      {savedOk && !saving && (
        <div style={{ fontSize: 11, color: C.success, marginTop: 8 }}>{t(`${K}.saved`)}</div>
      )}
      {error && <div style={{ fontSize: 11, color: C.error, marginTop: 8 }}>{error}</div>}
    </div>
  );
}

function Row({
  title,
  desc,
  right,
}: {
  title: string;
  desc: string;
  right: ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        flexWrap: "wrap",
        paddingTop: 10,
        marginTop: 10,
        borderTop: `1px solid ${C.borderSoft}`,
      }}
    >
      <div style={{ flex: "1 1 220px", minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{title}</div>
        <div style={{ fontSize: 12, color: C.inkMuted, marginTop: 2 }}>{desc}</div>
      </div>
      {right}
    </div>
  );
}

function Switch({
  checked,
  disabled,
  label,
  onClick,
}: {
  checked: boolean;
  disabled: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      style={{
        flexShrink: 0,
        width: 44,
        height: 24,
        borderRadius: 999,
        border: `1px solid ${checked ? C.accent : C.border}`,
        background: checked ? C.accent : "#fff",
        position: "relative",
        cursor: disabled ? "wait" : "pointer",
        padding: 0,
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
          border: checked ? "none" : `1px solid ${C.border}`,
        }}
      />
    </button>
  );
}
