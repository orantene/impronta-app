"use client";

/**
 * Weekly hours editor. Mounted in workspace settings and the talent calendar.
 * Lives OUTSIDE components/admin/shell.
 */

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  listBookingHoursTargets,
  loadBookingHours,
  saveBookingHours,
  setTalentDirectBookingOptIn,
  type HoursTarget,
} from "@/lib/server-actions/booking-hours";
import { DEFAULT_APPOINTMENT_DEFAULTS } from "@/lib/scheduling/appointments-settings-types";
import type { WeeklyHours } from "@/lib/scheduling/hours-types";
import { useT } from "@/i18n/use-t";

const C = {
  ink: "#0B0B0D",
  inkMuted: "rgba(11,11,13,0.62)",
  border: "rgba(24,24,27,0.16)",
  borderSoft: "rgba(24,24,27,0.08)",
  surface: "rgba(24,24,27,0.03)",
  error: "#dc2626",
  success: "#16a34a",
  accent: "#0B0B0D",
} as const;
const FONT = '"Inter", system-ui, sans-serif';
const K = "dashboard.adminWorkspace.appointments";

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

function emptyWeekly(): WeeklyHours {
  return { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
}

function minToInput(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function inputToMin(raw: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(raw.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

export function BookingHoursCard({
  talentProfileId,
  showTalentPicker = false,
  showTalentOptIn = false,
}: {
  talentProfileId?: string | null;
  showTalentPicker?: boolean;
  showTalentOptIn?: boolean;
}) {
  const t = useT();
  const [targets, setTargets] = useState<HoursTarget[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(talentProfileId ?? null);
  const [timezone, setTimezone] = useState("UTC");
  const [weekly, setWeekly] = useState<WeeklyHours>(emptyWeekly);
  const [slotMinutes, setSlotMinutes] = useState(DEFAULT_APPOINTMENT_DEFAULTS.slotMinutes);
  const [optIn, setOptIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedOk, setSavedOk] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");
  const [canEditHours, setCanEditHours] = useState(true);
  const [, startTransition] = useTransition();

  const filteredTargets = useMemo(() => {
    const q = pickerQuery.trim().toLowerCase();
    if (!q) return targets;
    return targets.filter((row) => row.name.toLowerCase().includes(q));
  }, [targets, pickerQuery]);

  useEffect(() => {
    if (talentProfileId) setSelectedId(talentProfileId);
  }, [talentProfileId]);

  useEffect(() => {
    let cancelled = false;
    if (showTalentPicker) {
      listBookingHoursTargets().then((res) => {
        if (cancelled || !res.ok) return;
        setTargets(res.targets);
        setSelectedId((cur) => cur ?? res.targets[0]?.id ?? null);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [showTalentPicker]);

  useEffect(() => {
    if (!selectedId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    loadBookingHours(selectedId).then((res) => {
      if (cancelled) return;
      if (res.ok) {
        setTimezone(res.hours?.timezone ?? "UTC");
        setWeekly(res.hours?.weekly ?? emptyWeekly());
        setSlotMinutes(res.hours?.slotMinutes ?? DEFAULT_APPOINTMENT_DEFAULTS.slotMinutes);
        setOptIn(res.directBookingOptIn);
        setCanEditHours(res.canEditHours);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const dayRows = useMemo(() => [0, 1, 2, 3, 4, 5, 6] as const, []);

  function persist(nextWeekly: WeeklyHours, nextTz = timezone, nextSlot = slotMinutes) {
    if (!selectedId || !canEditHours) return;
    setSaving(true);
    setError(null);
    setSavedOk(false);
    startTransition(async () => {
      const res = await saveBookingHours(selectedId, {
        timezone: nextTz,
        weekly: nextWeekly,
        slotMinutes: nextSlot,
        bufferBeforeMin: 0,
        bufferAfterMin: 0,
        minNoticeMin: 120,
        horizonDays: 60,
      });
      setSaving(false);
      if (res.ok) {
        setWeekly(res.hours.weekly);
        setTimezone(res.hours.timezone);
        setSlotMinutes(res.hours.slotMinutes);
        setSavedOk(true);
        setTimeout(() => setSavedOk(false), 2000);
      } else {
        setError(res.error);
      }
    });
  }

  function toggleDay(day: 0 | 1 | 2 | 3 | 4 | 5 | 6) {
    const next = { ...weekly, [day]: weekly[day].length ? [] : [{ startMin: 10 * 60, endMin: 18 * 60 }] };
    setWeekly(next);
    persist(next);
  }

  function setDayWindow(day: 0 | 1 | 2 | 3 | 4 | 5 | 6, which: "start" | "end", raw: string) {
    const min = inputToMin(raw);
    if (min == null) return;
    const current = weekly[day][0] ?? { startMin: 10 * 60, endMin: 18 * 60 };
    const nextWin =
      which === "start"
        ? { ...current, startMin: min }
        : { ...current, endMin: min };
    if (nextWin.endMin <= nextWin.startMin) return;
    const next = { ...weekly, [day]: [nextWin] };
    setWeekly(next);
    persist(next);
  }

  return (
    <div
      data-testid="booking-hours-card"
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
        <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{t(`${K}.hoursTitle`)}</div>
        <div style={{ fontSize: 12, color: C.inkMuted, marginTop: 2 }}>{t(`${K}.hoursDesc`)}</div>
      </div>

      {showTalentPicker && (
        <div style={{ marginBottom: 10 }}>
          <input
            type="search"
            aria-label={t(`${K}.hoursSearch`)}
            placeholder={t(`${K}.hoursSearchPlaceholder`)}
            value={pickerQuery}
            onChange={(e) => setPickerQuery(e.target.value)}
            style={{
              display: "block",
              fontSize: 13,
              fontFamily: FONT,
              border: `1px solid ${C.border}`,
              borderRadius: 8,
              padding: "6px 10px",
              marginBottom: 6,
              minWidth: 220,
              width: "100%",
              maxWidth: 320,
            }}
          />
          <select
            aria-label={t(`${K}.hoursWho`)}
            value={selectedId ?? ""}
            onChange={(e) => setSelectedId(e.target.value || null)}
            style={{
              fontSize: 13,
              fontFamily: FONT,
              border: `1px solid ${C.border}`,
              borderRadius: 8,
              padding: "6px 10px",
              minWidth: 220,
              width: "100%",
              maxWidth: 320,
            }}
          >
            {targets.length === 0 ? <option value="">{t(`${K}.hoursNobody`)}</option> : null}
            {targets.length > 0 && filteredTargets.length === 0 ? (
              <option value="">{t(`${K}.hoursSearchEmpty`)}</option>
            ) : null}
            {filteredTargets.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {showTalentOptIn && selectedId && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 12,
            paddingBottom: 10,
            borderBottom: `1px solid ${C.borderSoft}`,
          }}
        >
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{t(`${K}.optInTitle`)}</div>
            <div style={{ fontSize: 12, color: C.inkMuted, marginTop: 2 }}>{t(`${K}.optInDesc`)}</div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={optIn}
            aria-label={t(`${K}.optInTitle`)}
            disabled={saving}
            onClick={() => {
              const next = !optIn;
              setOptIn(next);
              startTransition(async () => {
                const res = await setTalentDirectBookingOptIn(selectedId, next);
                if (!res.ok) {
                  setOptIn(!next);
                  setError(res.error);
                }
              });
            }}
            style={{
              width: 44,
              height: 24,
              borderRadius: 999,
              border: `1px solid ${optIn ? C.accent : C.border}`,
              background: optIn ? C.accent : "#fff",
              position: "relative",
              cursor: "pointer",
              padding: 0,
            }}
          >
            <span
              style={{
                position: "absolute",
                top: 2,
                left: optIn ? 22 : 2,
                width: 18,
                height: 18,
                borderRadius: "50%",
                background: "#fff",
              }}
            />
          </button>
        </div>
      )}

      {loading ? (
        <div style={{ fontSize: 12, color: C.inkMuted }}>{t(`${K}.loading`)}</div>
      ) : !selectedId ? (
        <div style={{ fontSize: 12, color: C.inkMuted }}>{t(`${K}.hoursNobody`)}</div>
      ) : (
        <>
          {!canEditHours ? (
            <div style={{ fontSize: 12, color: C.inkMuted, marginBottom: 10 }}>
              {t(`${K}.hoursReadOnly`)}
            </div>
          ) : null}
          <label style={{ fontSize: 11, color: C.inkMuted, display: "block", marginBottom: 10 }}>
            {t(`${K}.timezoneTitle`)}
            <input
              defaultValue={timezone}
              disabled={!canEditHours}
              onBlur={(e) => {
                const next = e.target.value.trim() || "UTC";
                if (next !== timezone) {
                  setTimezone(next);
                  persist(weekly, next);
                }
              }}
              style={{
                display: "block",
                marginTop: 4,
                fontSize: 13,
                fontFamily: FONT,
                border: `1px solid ${C.border}`,
                borderRadius: 8,
                padding: "6px 10px",
                minWidth: 200,
              }}
            />
          </label>
          {dayRows.map((day) => {
            const win = weekly[day][0];
            const open = !!win;
            return (
              <div
                key={day}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "6px 0",
                  borderTop: `1px solid ${C.borderSoft}`,
                }}
              >
                <button
                  type="button"
                  onClick={() => toggleDay(day)}
                  disabled={saving || !canEditHours}
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    width: 72,
                    textAlign: "left",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: open ? C.ink : C.inkMuted,
                    fontFamily: FONT,
                  }}
                >
                  {t(`${K}.day.${DAY_KEYS[day]}`)}
                </button>
                {open && win ? (
                  <>
                    <input
                      type="time"
                      value={minToInput(win.startMin)}
                      onChange={(e) => setDayWindow(day, "start", e.target.value)}
                      disabled={saving || !canEditHours}
                      style={{ fontSize: 13, fontFamily: FONT }}
                    />
                    <span style={{ color: C.inkMuted }}>{t(`${K}.to`)}</span>
                    <input
                      type="time"
                      value={minToInput(win.endMin)}
                      onChange={(e) => setDayWindow(day, "end", e.target.value)}
                      disabled={saving || !canEditHours}
                      style={{ fontSize: 13, fontFamily: FONT }}
                    />
                  </>
                ) : (
                  <span style={{ fontSize: 12, color: C.inkMuted }}>{t(`${K}.closed`)}</span>
                )}
              </div>
            );
          })}
        </>
      )}

      {saving && <div style={{ fontSize: 11, color: C.inkMuted, marginTop: 8 }}>{t(`${K}.saving`)}</div>}
      {savedOk && !saving && (
        <div style={{ fontSize: 11, color: C.success, marginTop: 8 }}>{t(`${K}.saved`)}</div>
      )}
      {error && <div style={{ fontSize: 11, color: C.error, marginTop: 8 }}>{error}</div>}
    </div>
  );
}
