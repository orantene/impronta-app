"use client";

/**
 * useClassesWaitlist — the Front desk's queue, wired to the engine's
 * offers with a hold (`waitlist_offers`, D-POS-68): `Offer the place` places
 * a hold on the seat for a window (`waitlistOfferPlace`), `They took it`
 * commits it (`waitlistAcceptOffer`), `Decline` releases it
 * (`waitlistDeclineOffer`). The hold is a real capacity reservation, so a
 * walk-in cannot take the seat out from under an offer while it stands.
 *
 * Every refusal is the engine's code said through
 * `dashboard.pos.engine.refusal.*`; the day is re-read after a write so the
 * row's state and its expiry are the rows', not this hook's.
 */

import type { ClassesCopy } from "@/components/admin/pos/classes-copy";
import type { ClassesSession, ClassesWaitlistEntry } from "@/lib/pos/classes/day";
import { DEFAULT_WAITLIST_OFFER_MINUTES } from "@/lib/scheduling/session-waitlist";
import { waitlistAcceptOffer, waitlistDeclineOffer, waitlistOfferPlace } from "@/lib/server-actions/pos-engine";

import { fill } from "./classes-format";

export type ClassesNoticeState = { kind: "done" | "refused"; sentence: string } | null;

export function useClassesWaitlist(input: {
  readonly copy: ClassesCopy;
  readonly engineRefusal: Readonly<Record<string, string>>;
  readonly formatWhen: (iso: string) => string;
  readonly run: <T>(fn: () => Promise<T>, after: (result: T) => boolean) => Promise<T | null>;
  readonly setNotice: (notice: ClassesNoticeState) => void;
}) {
  const { copy: c, engineRefusal, formatWhen, run, setNotice } = input;
  const sentence = (reason: unknown) => (typeof reason === "string" && engineRefusal[reason]) || engineRefusal.unavailable || "";

  const offer = (session: ClassesSession, entry: ClassesWaitlistEntry) =>
    void run(
      () =>
        waitlistOfferPlace({
          entryId: entry.id,
          operationKey: `offer:${entry.id}:${entry.offeredAt ?? entry.joinedAt}`,
          ttlSeconds: DEFAULT_WAITLIST_OFFER_MINUTES * 60,
        }),
      (r) => {
        if (!r.ok) {
          setNotice({ kind: "refused", sentence: sentence(r.reason) });
          return false;
        }
        setNotice({
          kind: "done",
          sentence: r.already
            ? fill(c.waitlist.alreadyOffered, { name: entry.customerName })
            : fill(c.waitlist.promoted, { name: entry.customerName, when: r.expiresAt ? formatWhen(r.expiresAt) : "" }),
        });
        return true;
      },
    );

  const accept = (session: ClassesSession, entry: ClassesWaitlistEntry) =>
    void run(
      async () => (entry.offerId ? waitlistAcceptOffer({ offerId: entry.offerId, operationKey: `accept:${entry.offerId}` }) : { ok: false as const, reason: "expired" as const }),
      (r) => {
        if (!r.ok) {
          setNotice({ kind: "refused", sentence: sentence(r.reason) });
          return false;
        }
        setNotice({ kind: "done", sentence: fill(c.waitlist.accepted, { name: entry.customerName }) });
        return true;
      },
    );

  const decline = (session: ClassesSession, entry: ClassesWaitlistEntry) =>
    void run(
      async () => (entry.offerId ? waitlistDeclineOffer({ offerId: entry.offerId }) : { ok: false as const, reason: "expired" as const }),
      (r) => {
        if (!r.ok) {
          setNotice({ kind: "refused", sentence: sentence(r.reason) });
          return false;
        }
        setNotice({ kind: "done", sentence: fill(c.waitlist.declined, { name: entry.customerName }) });
        return true;
      },
    );

  return { offer, accept, decline };
}
