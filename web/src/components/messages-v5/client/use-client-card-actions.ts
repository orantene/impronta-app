"use client";

/**
 * L13 · the client card actions as ONE hook, so the secure link
 * (`ClientThread`) and the guest dock (`GuestClientCardRow`) act through the
 * same writers with the same phases and refusals. Identity is the thread token
 * either way (the dock mints its own once the guest cookie has proven it owns
 * the inquiry, see `_actions/guest-thread-v5.ts`).
 *
 * `refresh` is the caller's own re-read: `router.refresh()` on the link, the
 * dock's full-load bump in the panel. Nothing here guesses a state; every
 * "done" is followed by a re-read of the engine's rows.
 */

import { useCallback, useState } from "react";

import type { MessagingRefusal, ThreadMessage } from "@/lib/messaging/types";
import type { ClientOfferSummary } from "@/lib/messages-v5/client-thread-view";
import {
  messagingClientAcceptOffer,
  messagingClientChoose,
  messagingClientDeclineOffer,
  messagingClientPickTime,
  messagingClientRequestChange,
} from "@/lib/server-actions/messaging-client";

import type { CardActivity } from "./ClientThreadView";

export type ClientCardActions = {
  readonly activity: Readonly<Record<string, CardActivity>>;
  readonly onChoose: (messageId: string, ids: readonly string[]) => Promise<void>;
  readonly onPickTime: (messageId: string, startsAt: string) => Promise<void>;
  readonly onPay: (code: string) => void;
  readonly onAcceptOffer: (offer: ClientOfferSummary) => Promise<void>;
  readonly onDeclineOffer: (offer: ClientOfferSummary, reason: string) => Promise<void>;
  readonly onChangeRecord: (recordKind: string, recordId: string, text: string, key?: string) => Promise<void>;
};

export function useClientCardActions(input: {
  readonly token: string | null;
  readonly messages: readonly Pick<ThreadMessage, "id" | "payload">[];
  readonly refresh: () => void;
  /** Called after a time pick so a held card's countdown restarts from a fresh clock. */
  readonly onTick?: () => void;
}): ClientCardActions {
  const { token, messages, refresh, onTick } = input;
  const [activity, setActivity] = useState<Readonly<Record<string, CardActivity>>>({});
  const setAct = useCallback((key: string, a: CardActivity) => setActivity((prev) => ({ ...prev, [key]: a })), []);
  const refused = useCallback(
    (key: string, reason: MessagingRefusal, nextFreeTimes?: readonly string[]) =>
      setAct(key, {
        phase: "refused",
        refusal: reason,
        ...(nextFreeTimes && nextFreeTimes.length > 0 ? { nextFreeTimes } : {}),
      }),
    [setAct],
  );
  const noToken = useCallback((key: string) => refused(key, "not_allowed"), [refused]);

  const onChoose = useCallback(
    async (messageId: string, ids: readonly string[]) => {
      if (!token) return noToken(messageId);
      const message = messages.find((m) => m.id === messageId);
      const p = message?.payload ?? {};
      const labels = Array.isArray(p.labels) ? (p.labels as unknown[]) : [];
      const offeringIds = Array.isArray(p.offeringIds) ? (p.offeringIds as unknown[]) : [];
      const tiers = Array.isArray(p.tiers) ? (p.tiers as Array<Record<string, unknown>>) : [];
      const sessionId = typeof p.sessionId === "string" ? p.sessionId : null;
      const choices = ids.map((id) => {
        const at = offeringIds.indexOf(id);
        const tier = tiers.find((tr) => tr.id === id);
        const label = at >= 0 ? String(labels[at] ?? id) : tier ? String(tier.label ?? id) : typeof p.title === "string" ? p.title : id;
        // A ticket tier is a variant of the card's offering; the draft line is the offering.
        const offeringId = tier && typeof p.offeringId === "string" ? p.offeringId : id;
        return { offeringId, label, sessionId };
      });
      setAct(messageId, { phase: "busy" });
      const result = await messagingClientChoose({ token, messageId, choices });
      if (!result.ok) return refused(messageId, result.reason);
      setAct(messageId, { phase: "done" });
      refresh();
    },
    [messages, noToken, refresh, refused, setAct, token],
  );

  const onPickTime = useCallback(
    async (messageId: string, startsAt: string) => {
      if (!token) return noToken(messageId);
      setAct(messageId, { phase: "busy" });
      const result = await messagingClientPickTime({ token, messageId, startsAt });
      if (!result.ok) return refused(messageId, result.reason, result.nextFreeTimes);
      setAct(messageId, { phase: "done" });
      onTick?.();
      refresh();
    },
    [noToken, onTick, refresh, refused, setAct, token],
  );

  const onPay = useCallback((code: string) => {
    window.location.assign(`/pay/${encodeURIComponent(code)}`);
  }, []);

  const onAcceptOffer = useCallback(
    async (offer: ClientOfferSummary) => {
      if (!token) return noToken(offer.id);
      setAct(offer.id, { phase: "busy" });
      const result = await messagingClientAcceptOffer({ token, offerId: offer.id, offerVersion: offer.version });
      if (!result.ok) return refused(offer.id, result.reason);
      setAct(offer.id, { phase: "done" });
      if (result.payCode) return onPay(result.payCode);
      refresh();
    },
    [noToken, onPay, refresh, refused, setAct, token],
  );

  const onDeclineOffer = useCallback(
    async (offer: ClientOfferSummary, reason: string) => {
      if (!token) return noToken(offer.id);
      setAct(offer.id, { phase: "busy" });
      const result = await messagingClientDeclineOffer({ token, offerId: offer.id, offerVersion: offer.version, reason });
      if (!result.ok) return refused(offer.id, result.reason);
      setAct(offer.id, { phase: "done" });
      refresh();
    },
    [noToken, refresh, refused, setAct, token],
  );

  const onChangeRecord = useCallback(
    async (recordKind: string, recordId: string, text: string, key = recordId) => {
      if (!token) return noToken(key);
      setAct(key, { phase: "busy" });
      const result = await messagingClientRequestChange({ token, recordKind, recordId, text });
      if (!result.ok) return refused(key, result.reason);
      // A new epoch remounts the card so its change form closes (the views key on it).
      setAct(key, { phase: "idle", epoch: Date.now() });
      refresh();
    },
    [noToken, refresh, refused, setAct, token],
  );

  return { activity, onChoose, onPickTime, onPay, onAcceptOffer, onDeclineOffer, onChangeRecord };
}
