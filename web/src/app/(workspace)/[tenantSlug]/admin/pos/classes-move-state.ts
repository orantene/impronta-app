"use client";

/**
 * classes-move-state.ts — the Move sheet's state and command (board A09), as
 * a hook the Front desk client mounts: which booking is being moved, which
 * day is being looked at, the free times read for that day, the time picked
 * (a card, or one typed by hand), and the move itself through the proven
 * `rescheduleAppointment` with the window the operator saw carried, so a
 * stale screen is refused rather than overwriting a colleague's move.
 *
 * Nothing here fetches on mount: the one read, the free times, runs in the
 * handler that opened the sheet or picked a day.
 */

import { useState } from "react";

import type { ClassesCopy } from "@/components/admin/pos/classes-copy";
import type { ClassesAppointment, ClassesDay } from "@/lib/pos/classes/day";
import { MAX_DAY_OFFSET } from "@/lib/pos/classes/day";
import { actionRefusalKey, moveSlotsRefusalKey, noSlotsKey, type ClassesRefusalKey } from "@/lib/pos/classes/refusals";
import { parseLocalDateTime } from "@/lib/scheduling/appointments-board";
import { rescheduleAppointment } from "@/lib/scheduling/appointments-actions";
import { fillRefusalSentence } from "@/lib/scheduling/reschedule-refusal";
import { zonedLocalToUtc } from "@/lib/scheduling/tz";

import { classesMoveSlots } from "./classes-actions";
import { fill, formatWhen } from "./classes-format";

export type MoveSlots =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; starts: string[]; personName: string | null; durationMinutes: number | null }
  | { status: "empty"; sentence: string };

type Notice = { kind: "refused"; sentence: string } | { kind: "done"; sentence: string };

export function useMove(input: {
  tenantId: string;
  day: ClassesDay;
  locale: string;
  copy: ClassesCopy;
  run: <T>(fn: () => Promise<T>, after: (result: T) => boolean) => Promise<T | null>;
  refuse: (key: ClassesRefusalKey) => void;
  setNotice: (notice: Notice | null) => void;
}) {
  const { day, copy: c, run, refuse, setNotice } = input;
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [dayOffset, setDayOffset] = useState(day.dayOffset);
  const [slots, setSlots] = useState<MoveSlots>({ status: "idle" });
  const [slotIso, setSlotIso] = useState("");
  const [manual, setManual] = useState("");

  const readDay = (id: string, offset: number) => {
    setSlots({ status: "loading" });
    void classesMoveSlots({ bookingId: id, dayOffset: offset }).then(
      (r) => {
        if (!r.ok) {
          setSlots({ status: "empty", sentence: c.refusal[r.reason === "not_allowed" || r.reason === "invalid" ? actionRefusalKey(r.reason) : moveSlotsRefusalKey(r.reason)] });
          return;
        }
        if (r.starts.length === 0) {
          setSlots({ status: "empty", sentence: c.refusal[r.emptyReason ? noSlotsKey(r.emptyReason) : "closedToday"] });
          return;
        }
        setSlots({ status: "ready", starts: r.starts, personName: r.personName, durationMinutes: r.durationMinutes });
      },
      () => setSlots({ status: "empty", sentence: c.refusal.unavailable }),
    );
  };

  const open = (row: ClassesAppointment) => {
    setBookingId(row.id);
    setDayOffset(day.dayOffset);
    setSlotIso("");
    setManual("");
    setNotice(null);
    readDay(row.id, day.dayOffset);
  };

  const close = () => {
    setBookingId(null);
    setSlots({ status: "idle" });
    setSlotIso("");
    setManual("");
  };

  const pickDay = (offset: number) => {
    if (!bookingId) return;
    const clamped = Math.max(-MAX_DAY_OFFSET, Math.min(MAX_DAY_OFFSET, offset));
    setDayOffset(clamped);
    setSlotIso("");
    readDay(bookingId, clamped);
  };

  const pickSlot = (iso: string) => {
    setSlotIso(iso);
    setManual("");
  };

  const typeManual = (value: string) => {
    setManual(value);
    setSlotIso("");
  };

  /** The instant chosen, from a card or the hand-typed venue-clock value. */
  const chosen = (): { iso: string } | { refusal: string } | null => {
    if (slotIso) return { iso: slotIso };
    if (!manual) return null;
    const parsed = parseLocalDateTime(manual);
    if (!parsed) return { refusal: c.reschedule.needStart };
    // The control hands back a wall clock with no zone. It means the VENUE's
    // clock, so the venue's zone is what turns it into an instant.
    const instant = zonedLocalToUtc(parsed.ymd, parsed.minutesOfDay, day.timeZone);
    if (!instant) return { refusal: c.reschedule.nonexistentTime };
    return { iso: instant.toISOString() };
  };

  const chosenIso = (() => {
    const pick = chosen();
    return pick && "iso" in pick ? pick.iso : null;
  })();

  const submit = (row: ClassesAppointment) => {
    const pick = chosen();
    if (!pick) return;
    if ("refusal" in pick) {
      setNotice({ kind: "refused", sentence: pick.refusal });
      return;
    }
    void run(
      () =>
        rescheduleAppointment({
          tenantId: input.tenantId,
          bookingId: row.id,
          newStartsAt: pick.iso,
          newEndsAt: null,
          // The window the operator was looking at, so a stale screen is
          // refused rather than overwriting a colleague's move.
          expectedStartsAt: row.startsAt,
          expectedEndsAt: row.endsAt,
        }),
      (r) => {
        if (!r.ok) {
          setNotice({ kind: "refused", sentence: fillRefusalSentence(c.reschedule.refusal[r.refusal.key], r.refusal.params) });
          return false;
        }
        close();
        setNotice({
          kind: "done",
          sentence: r.already ? c.reschedule.already : fill(c.reschedule.moved, { when: formatWhen(r.startsAt, day.timeZone, input.locale) }),
        });
        return true;
      },
    );
    return;
  };

  return { bookingId, dayOffset, slots, slotIso, manual, chosenIso, open, close, pickDay, pickSlot, typeManual, submit, refuse };
}
