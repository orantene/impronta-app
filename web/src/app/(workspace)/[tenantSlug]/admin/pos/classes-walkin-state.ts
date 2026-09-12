"use client";

/**
 * classes-walkin-state.ts — the Walk-in sheet's state and commands (board
 * B04), as a hook the Front desk client mounts: which kind, which service or
 * session, the free times read for a chosen service, the customer's contact,
 * the outcome after "Book it", and the cash collection through the Counter's
 * charge handed in by the client.
 *
 * Split from `classes-client.tsx` so that file stays under the line budget;
 * nothing here fetches on mount (the one fetch, the free times, runs in the
 * handler that chose the service, as before).
 */

import { useState } from "react";

import type { ClassesCopy } from "@/components/admin/pos/classes-copy";
import { formatOrderMoney } from "@/lib/orders/money-format";
import type { ClassesDay, ClassesSession } from "@/lib/pos/classes/day";
import { actionRefusalKey, noSlotsKey, slotsRefusalKey, walkInRefusalKey, type ClassesRefusalKey } from "@/lib/pos/classes/refusals";
import { refusalFromResult } from "@/lib/pos/refusal-reason";
import type { PosRefusalReason } from "@/components/admin/pos";

import { classesBookWalkIn, classesHoldSeat, classesNameSeatHolders, classesWalkInSlots, type ClassesWalkInResult } from "./classes-actions";
import { fill, formatWhen } from "./classes-format";
import type { WalkInKind, WalkInOutcome, WalkInService, WalkInSlots } from "./classes-panels";

export type WalkInSale = { orderId: string; version: number; outstandingCents: number; currency: string };

type Notice = { kind: "refused"; sentence: string } | { kind: "done"; sentence: string } | { kind: "counter"; reason: PosRefusalReason };

function freshAttemptKey(): string {
  return `walkin-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function useWalkIn(input: {
  day: ClassesDay;
  services: readonly WalkInService[];
  locale: string;
  copy: ClassesCopy;
  run: <T>(fn: () => Promise<T>, after: (result: T) => boolean) => Promise<T | null>;
  refuse: (key: ClassesRefusalKey) => void;
  setNotice: (notice: Notice | null) => void;
  collectCash: (target: WalkInSale, contact: { name: string; email: string; phone: string }) => Promise<{ ok: boolean } | null>;
  refreshDay: () => void;
}) {
  const { day, copy: c, run, refuse, setNotice } = input;
  const [intent, setIntent] = useState<"walkin" | "book">("walkin");
  const [kind, setKind] = useState<WalkInKind>("appointment");
  const [serviceId, setServiceId] = useState("");
  const [slots, setSlots] = useState<WalkInSlots>({ status: "idle" });
  const [slotIso, setSlotIso] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [tierId, setTierId] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [attemptKey, setAttemptKey] = useState(freshAttemptKey);
  const [outcome, setOutcome] = useState<WalkInOutcome | null>(null);
  const [sale, setSale] = useState<WalkInSale | null>(null);

  // The day the free times were read for: the day shown, or the day the
  // booking flow's chips picked (A03).
  const [slotsDay, setSlotsDay] = useState(day.dayOffset);

  const readSlots = (id: string, offset: number) => {
    setSlots({ status: "loading" });
    void classesWalkInSlots({ offeringId: id, dayOffset: offset }).then(
      (r) => {
        if (!r.ok) {
          setSlots({ status: "empty", sentence: c.refusal[r.reason === "not_allowed" || r.reason === "invalid" ? actionRefusalKey(r.reason) : slotsRefusalKey(r.reason)] });
          return;
        }
        if (r.starts.length === 0) {
          setSlots({ status: "empty", sentence: c.refusal[r.emptyReason ? noSlotsKey(r.emptyReason) : "closedToday"] });
          return;
        }
        setSlots({ status: "ready", starts: r.starts });
      },
      () => setSlots({ status: "empty", sentence: c.refusal.unavailable }),
    );
  };

  const chooseService = (id: string) => {
    setServiceId(id);
    setSlotIso("");
    if (!id) {
      setSlots({ status: "idle" });
      return;
    }
    readSlots(id, slotsDay);
  };

  /** A03: another day's free times for the chosen service. */
  const pickDay = (offset: number) => {
    setSlotsDay(offset);
    setSlotIso("");
    if (serviceId) readSlots(serviceId, offset);
  };

  const chooseSession = (id: string) => {
    setSessionId(id);
    const s = day.sessions.find((row) => row.id === id);
    setTierId(s && s.tiers.length === 1 ? (s.tiers[0]?.variantId ?? "") : "");
  };

  const afterWalkIn = (r: ClassesWalkInResult, sentence: string): boolean => {
    if (!r.ok) {
      if (r.reason === "not_allowed" || r.reason === "unavailable") {
        refuse(actionRefusalKey(r.reason));
      } else if (kind === "seat") {
        // The seat path runs the Counter's draft commands; its words are the
        // Counter's and so are its sentences.
        const counter = refusalFromResult({ ok: false, reason: r.reason }, "sale");
        if (counter) setNotice({ kind: "counter", reason: counter });
        else refuse("couldNotBook");
      } else {
        refuse(walkInRefusalKey(r.reason));
      }
      return false;
    }
    const nextSale: WalkInSale = {
      orderId: r.orderId,
      version: r.version,
      outstandingCents: r.outstandingCents,
      currency: r.currency,
    };
    setSale(nextSale);
    setOutcome({ stage: "booked", sentence, outstandingCents: r.outstandingCents, currency: r.currency });
    // A $0 seat still has to run collect: that is the mint. Closing the
    // sheet here left the order as draft with no admission.
    if (kind === "seat" && r.outstandingCents <= 0) {
      void settleSeat(nextSale);
    }
    return true;
  };

  const book = () => {
    if (kind === "appointment") {
      const service = input.services.find((s) => s.offeringId === serviceId);
      if (!service || !slotIso) return;
      void run(
        () => classesBookWalkIn({ offeringId: serviceId, startsAt: slotIso, name, email, phone, attemptKey }),
        (r) => afterWalkIn(r, fill(c.walkin.booked, { when: formatWhen(slotIso, day.timeZone, input.locale) })),
      );
      return;
    }
    const session = day.sessions.find((s) => s.id === sessionId);
    if (!session || !session.offeringId) return;
    const tier = session.tiers.length === 1 ? session.tiers[0] : session.tiers.find((t) => t.variantId === tierId);
    if (session.tiers.length > 1 && !tier) return;
    void run(
      () => classesHoldSeat({ sessionId: session.id, offeringId: session.offeringId ?? "", variantId: tier?.variantId ?? null }),
      (r) => afterWalkIn(r, fill(c.walkin.seatBooked, { session: session.title })),
    );
  };

  const settleSeat = (target: WalkInSale) =>
    input.collectCash(target, { name, email, phone }).then(async (r) => {
      if (r && r.ok) {
        // A seat's ticket carries the name the operator typed, so the roster
        // can call it (the Counter names a buyer only by email or phone).
        if (kind === "seat" && name.trim()) {
          try {
            await classesNameSeatHolders({ orderId: target.orderId, name });
          } catch {
            // The seat is sold and paid; a missing name is not a refusal.
          }
          input.refreshDay();
        }
        setOutcome({
          stage: "collected",
          sentence: fill(c.walkin.collected, { amount: formatOrderMoney(target.outstandingCents, target.currency) }),
        });
      }
    });

  const collect = () => {
    if (!sale) return;
    void settleSeat(sale);
  };

  /**
   * A FINISHED WALK-IN IS FINISHED. Money collected (or a $0 seat minted)
   * is the only done state. A booked $0 draft is not finished: collect
   * still has to issue the admission.
   */
  const settled = outcome !== null && outcome.stage === "collected";

  const startAgain = () => {
    setOutcome(null);
    setSale(null);
    setSlotIso("");
    setSlots({ status: "idle" });
    setServiceId("");
    setSessionId("");
    setTierId("");
    setSlotsDay(day.dayOffset);
    setName("");
    setEmail("");
    setPhone("");
    setNotice(null);
    setAttemptKey(freshAttemptKey());
  };

  /** Open the sheet for a walk-in or a booking, optionally onto a session's seat. */
  const prepare = (next: "walkin" | "book", seat?: ClassesSession) => {
    if (settled) startAgain();
    setIntent(next);
    if (seat) {
      setKind("seat");
      setSessionId(seat.id);
      setTierId(seat.tiers.length === 1 ? (seat.tiers[0]?.variantId ?? "") : "");
    }
  };

  return {
    intent,
    kind,
    setKind,
    serviceId,
    chooseService,
    slotsDay,
    pickDay,
    slots,
    slotIso,
    setSlotIso,
    sessionId,
    chooseSession,
    tierId,
    setTierId,
    name,
    setName,
    email,
    setEmail,
    phone,
    setPhone,
    outcome,
    settled,
    book,
    collect,
    startAgain,
    prepare,
  };
}
