"use client";

import { useEffect, useMemo, useState } from "react";
import {
  loadBookingHours,
  saveBookingHours,
  setTalentDirectBookingOptIn,
} from "@/lib/server-actions/booking-hours";
import type { BookingHours, HoursException, WeeklyHours } from "@/lib/scheduling/hours-types";
import { TALENT_AGENDA_VARS } from "./primitives";
import { useAgendaCopy } from "./use-agenda-copy";

const LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function fromMin(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function emptyWeekly(): WeeklyHours {
  return { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
}

/**
 * T5.5 Availability editor. Weekly hours + exceptions/time off + direct-booking opt-in.
 * saveBookingHours preserves exceptions when omitted; this page sends them when the
 * exceptions list is loaded so round-trips do not wipe time off.
 */
export function AgendaAvailabilityPage({
  talentProfileId,
  initialHours,
  onBack,
}: {
  talentProfileId: string;
  initialHours?: BookingHours | null;
  onBack: () => void;
}) {
  const copy = useAgendaCopy();
  const seeded = initialHours;
  const [bufferMin, setBufferMin] = useState(
    seeded?.bufferAfterMin ?? seeded?.bufferBeforeMin ?? 15,
  );
  const [tz, setTz] = useState(seeded?.timezone ?? "America/Cancun");
  const [rows, setRows] = useState(() =>
    LABELS.map((label, day) => {
      const idx = day as 0 | 1 | 2 | 3 | 4 | 5 | 6;
      const win = seeded?.weekly?.[idx]?.[0];
      if (win) {
        return {
          day: idx,
          label,
          open: true,
          start: fromMin(win.startMin),
          end: fromMin(win.endMin),
        };
      }
      return {
        day: idx,
        label,
        open: idx >= 1 && idx <= 6,
        start: "10:00",
        end: idx === 6 ? "15:00" : "19:00",
      };
    }).map((r) => (seeded ? r : r.day === 0 ? { ...r, open: false } : r)),
  );
  const [exceptions, setExceptions] = useState<HoursException[]>(
    () => seeded?.exceptions ?? [],
  );
  const [exceptionsLoaded, setExceptionsLoaded] = useState(Boolean(seeded));
  const [optIn, setOptIn] = useState(false);
  const [newDate, setNewDate] = useState("");
  const [newClosed, setNewClosed] = useState(true);
  const [newStart, setNewStart] = useState("10:00");
  const [newEnd, setNewEnd] = useState("14:00");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadBookingHours(talentProfileId).then((res) => {
      if (cancelled || !res.ok) return;
      setOptIn(res.directBookingOptIn);
      if (res.hours) {
        setExceptions(res.hours.exceptions ?? []);
        setExceptionsLoaded(true);
        if (!seeded) {
          setTz(res.hours.timezone);
          setBufferMin(res.hours.bufferAfterMin ?? res.hours.bufferBeforeMin ?? 15);
          setRows(
            LABELS.map((label, day) => {
              const idx = day as 0 | 1 | 2 | 3 | 4 | 5 | 6;
              const win = res.hours?.weekly?.[idx]?.[0];
              if (win) {
                return {
                  day: idx,
                  label,
                  open: true,
                  start: fromMin(win.startMin),
                  end: fromMin(win.endMin),
                };
              }
              return { day: idx, label, open: false, start: "10:00", end: "19:00" };
            }),
          );
        }
      } else {
        setExceptionsLoaded(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [talentProfileId, seeded]);

  const canSave = useMemo(
    () => rows.some((r) => r.open) && Boolean(talentProfileId),
    [rows, talentProfileId],
  );

  async function save() {
    if (!canSave || saving) return;
    setSaving(true);
    setMessage(null);
    try {
      const weekly = emptyWeekly();
      for (const r of rows) {
        weekly[r.day] = r.open
          ? [{ startMin: toMin(r.start), endMin: toMin(r.end) }]
          : [];
      }
      const result = await saveBookingHours(talentProfileId, {
        timezone: tz,
        weekly,
        slotMinutes: 30,
        bufferBeforeMin: bufferMin,
        bufferAfterMin: bufferMin,
        minNoticeMin: 60,
        horizonDays: 60,
        // Send exceptions only after load so we never wipe with [].
        ...(exceptionsLoaded ? { exceptions } : {}),
      });
      if (!result.ok) {
        setMessage(result.error || "Could not save. Try again.");
      } else {
        setExceptions(result.hours.exceptions ?? []);
        setMessage("Availability saved.");
      }
    } catch {
      setMessage("Could not save. Check your hours and try again.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleOptIn() {
    const next = !optIn;
    setOptIn(next);
    const res = await setTalentDirectBookingOptIn(talentProfileId, next);
    if (!res.ok) {
      setOptIn(!next);
      setMessage(res.error || "Could not update direct booking.");
    }
  }

  function addException() {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate)) {
      setMessage("Pick a date for time off or a one-day schedule.");
      return;
    }
    const entry: HoursException = newClosed
      ? { date: newDate, closed: true, windows: [] }
      : {
          date: newDate,
          closed: false,
          windows: [{ startMin: toMin(newStart), endMin: toMin(newEnd) }],
        };
    setExceptions((list) => {
      const without = list.filter((e) => e.date !== newDate);
      return [...without, entry].sort((a, b) => a.date.localeCompare(b.date));
    });
    setNewDate("");
  }

  return (
    <div style={TALENT_AGENDA_VARS} className="mx-auto max-w-[720px] space-y-4">
      <button type="button" onClick={onBack} className="min-h-[44px] text-[13px] text-[var(--tc-accent)]">
        {"<"} {copy.t("Calendar")}
      </button>
      <h1 className="text-[24px] font-semibold text-[var(--tc-primary)]">{copy.t("Availability")}</h1>
      <p className="text-[14px] text-[#5F6368]">
        {copy.t("Weekly hours, time off, buffer, and timezone. Travel stays on each booking.")}
      </p>

      <section className="space-y-3 rounded-2xl border border-black/8 bg-white p-4">
        {rows.map((row, idx) => (
          <div key={row.day} className="flex flex-wrap items-center gap-2">
            <label className="flex min-w-[72px] items-center gap-2 text-[14px]">
              <input
                type="checkbox"
                checked={row.open}
                onChange={(e) => {
                  const next = [...rows];
                  next[idx] = { ...row, open: e.target.checked };
                  setRows(next);
                }}
              />
              {copy.t(row.label)}
            </label>
            {row.open ? (
              <>
                <input
                  type="time"
                  className="rounded-xl border border-black/10 px-2 py-2"
                  value={row.start}
                  onChange={(e) => {
                    const next = [...rows];
                    next[idx] = { ...row, start: e.target.value };
                    setRows(next);
                  }}
                />
                <span className="text-[13px] text-[#5F6368]">{copy.t("to")}</span>
                <input
                  type="time"
                  className="rounded-xl border border-black/10 px-2 py-2"
                  value={row.end}
                  onChange={(e) => {
                    const next = [...rows];
                    next[idx] = { ...row, end: e.target.value };
                    setRows(next);
                  }}
                />
              </>
            ) : (
              <span className="text-[13px] text-[#5F6368]">{copy.t("Closed")}</span>
            )}
          </div>
        ))}
      </section>

      <section className="space-y-3 rounded-2xl border border-black/8 bg-white p-4">
        <h2 className="text-[15px] font-semibold text-[var(--tc-primary)]">
          {copy.t("Time off and one-day hours")}
        </h2>
        <p className="text-[13px] text-[#5F6368]">
          {copy.t("Closed dates block bookings. Alternate windows replace that day's weekly hours.")}
        </p>
        {exceptions.length === 0 ? (
          <p className="text-[13px] text-[#5F6368]">{copy.t("No exceptions yet.")}</p>
        ) : (
          <ul className="space-y-2">
            {exceptions.map((ex) => (
              <li
                key={ex.date}
                className="flex min-h-[44px] flex-wrap items-center justify-between gap-2 rounded-xl border border-black/5 px-3 py-2 text-[14px]"
              >
                <span>
                  {ex.date}
                  {" · "}
                  {ex.closed
                    ? copy.t("Closed")
                    : ex.windows
                        .map((w) => `${fromMin(w.startMin)}–${fromMin(w.endMin)}`)
                        .join(", ")}
                </span>
                <button
                  type="button"
                  className="text-[13px] text-[var(--tc-accent)]"
                  onClick={() => setExceptions((list) => list.filter((e) => e.date !== ex.date))}
                >
                  {copy.t("Remove")}
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-[13px]">
            {copy.t("Date")}
            <input
              type="date"
              className="mt-1 block rounded-xl border border-black/10 px-3 py-2"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
            />
          </label>
          <label className="flex items-center gap-2 text-[13px]">
            <input
              type="checkbox"
              checked={newClosed}
              onChange={(e) => setNewClosed(e.target.checked)}
            />
            {copy.t("Closed all day")}
          </label>
          {!newClosed ? (
            <>
              <input
                type="time"
                className="rounded-xl border border-black/10 px-2 py-2"
                value={newStart}
                onChange={(e) => setNewStart(e.target.value)}
              />
              <span className="text-[13px] text-[#5F6368]">{copy.t("to")}</span>
              <input
                type="time"
                className="rounded-xl border border-black/10 px-2 py-2"
                value={newEnd}
                onChange={(e) => setNewEnd(e.target.value)}
              />
            </>
          ) : null}
          <button
            type="button"
            onClick={addException}
            className="min-h-[44px] rounded-full border border-black/10 px-4 text-[13px]"
          >
            {copy.t("Add")}
          </button>
        </div>
      </section>

      <section className="grid gap-3 rounded-2xl border border-black/8 bg-white p-4 sm:grid-cols-2">
        <label className="block text-[13px]">
          {copy.t("Buffer (minutes)")}
          <input
            type="number"
            min={0}
            className="mt-1 w-full rounded-xl border border-black/10 px-3 py-2"
            value={bufferMin}
            onChange={(e) => setBufferMin(Number(e.target.value) || 0)}
          />
        </label>
        <label className="block text-[13px]">
          {copy.t("Timezone")}
          <input
            className="mt-1 w-full rounded-xl border border-black/10 px-3 py-2"
            value={tz}
            onChange={(e) => setTz(e.target.value)}
          />
        </label>
      </section>

      <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-black/8 bg-white p-4">
        <div>
          <p className="text-[14px] font-semibold text-[var(--tc-primary)]">{copy.t("Direct booking")}</p>
          <p className="mt-1 text-[13px] text-[#5F6368]">
            {copy.t("Let clients book open times on your page without a message first.")}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={optIn}
          onClick={() => void toggleOptIn()}
          className={`relative h-7 w-12 rounded-full transition-colors ${optIn ? "bg-[var(--tc-accent)]" : "bg-black/15"}`}
        >
          <span
            className={`absolute top-0.5 h-6 w-6 rounded-full bg-white transition-all ${optIn ? "left-5" : "left-0.5"}`}
          />
        </button>
      </section>

      {message ? <p className="text-[13px] text-[#5F6368]">{copy.t(message)}</p> : null}

      <div className="flex justify-end">
        <button
          type="button"
          disabled={!canSave || saving}
          onClick={() => void save()}
          className="min-h-[44px] rounded-full bg-[var(--tc-primary)] px-5 text-[13px] text-white disabled:opacity-40"
        >
          {saving ? copy.t("Saving…") : copy.t("Save availability")}
        </button>
      </div>
    </div>
  );
}
