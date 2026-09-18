"use client";

/**
 * L9: the client link thread (/c/t/[token]), stateful wrapper. Holds the
 * composer, per-card activity and an optimistic copy of the stream; every
 * write goes through `lib/server-actions/messaging-client.ts` (token
 * identity), then `router.refresh()` re-renders the server-loaded thread so
 * the client sees the engine's own rows, never a guessed state.
 *
 * Locale follows the WORKSPACE (D-151): the page resolves it server-side and
 * hands it down; nothing here reads the visitor's cookie.
 */

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { translatorFor } from "@/i18n/use-t";
import type { MessagingRefusal, ThreadMessage } from "@/lib/messaging/types";
import type { ClientOfferSummary } from "@/lib/messages-v5/client-thread-view";
import {
  messagingClientAcceptOffer,
  messagingClientChoose,
  messagingClientDeclineOffer,
  messagingClientPickTime,
  messagingClientReply,
  messagingClientRequestChange,
} from "@/lib/server-actions/messaging-client";

import { buildKitCopy } from "../kit/copy";
import { ClientThreadView, type CardActivity, type ComposerPhase } from "./ClientThreadView";
import { buildClientCopy } from "./copy";

export type ClientThreadProps = {
  readonly token: string;
  readonly locale: string;
  readonly business: { readonly name: string; readonly handlerFirstName: string | null };
  readonly messages: readonly ThreadMessage[];
  readonly offers: readonly ClientOfferSummary[];
  readonly payCode: string | null;
  readonly threadTokenExpiresAt?: string | null;
};

export function ClientThread(props: ClientThreadProps) {
  const router = useRouter();
  const t = useMemo(() => translatorFor(props.locale), [props.locale]);
  const kit = useMemo(() => buildKitCopy(t), [t]);
  const copy = useMemo(() => buildClientCopy(t), [t]);

  const [value, setValue] = useState("");
  const [phase, setPhase] = useState<ComposerPhase>("idle");
  const [lastBody, setLastBody] = useState("");
  const [optimistic, setOptimistic] = useState<readonly ThreadMessage[]>([]);
  const [activity, setActivity] = useState<Readonly<Record<string, CardActivity>>>({});
  const [now, setNow] = useState(() => new Date());

  // A held time shows a countdown; tick once a second while any card is held.
  const anyHold = props.messages.some((m) => m.kind === "professional_times" && typeof m.payload?.holdExpiresAt === "string");
  useEffect(() => {
    if (!anyHold) return;
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, [anyHold]);

  // Server rows win: drop optimistic bubbles once the refresh brings them back.
  const serverIds = useMemo(() => new Set(props.messages.map((m) => m.id)), [props.messages]);
  const messages = useMemo(() => [...props.messages, ...optimistic.filter((m) => !serverIds.has(m.id))], [props.messages, optimistic, serverIds]);

  const setAct = useCallback((key: string, a: CardActivity) => setActivity((prev) => ({ ...prev, [key]: a })), []);

  const send = useCallback(
    async (body: string) => {
      const text = body.trim();
      if (!text) return;
      setPhase("sending");
      setLastBody(text);
      const result = await messagingClientReply({ token: props.token, body: text });
      if (!result.ok) {
        setPhase("failed");
        return;
      }
      setOptimistic((prev) => [
        ...prev,
        { id: result.messageId, inquiryId: "", kind: "text", body: text, payload: null, senderUserId: null, guestSessionId: null, createdAt: new Date().toISOString(), editedAt: null, deletedAt: null, thread: "private", internal: false, delivery: null },
      ]);
      setValue("");
      setPhase("sent");
      router.refresh();
      setTimeout(() => setPhase((p) => (p === "sent" ? "idle" : p)), 2500);
    },
    [props.token, router],
  );

  const refused = useCallback((key: string, reason: MessagingRefusal) => setAct(key, { phase: "refused", refusal: reason }), [setAct]);

  const onChoose = useCallback(
    async (messageId: string, ids: readonly string[]) => {
      const message = props.messages.find((m) => m.id === messageId);
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
      const result = await messagingClientChoose({ token: props.token, messageId, choices });
      if (!result.ok) {
        refused(messageId, result.reason);
        return;
      }
      setAct(messageId, { phase: "done" });
      router.refresh();
    },
    [props.messages, props.token, refused, router, setAct],
  );

  const onPickTime = useCallback(
    async (messageId: string, startsAt: string) => {
      setAct(messageId, { phase: "busy" });
      const result = await messagingClientPickTime({ token: props.token, messageId, startsAt });
      if (!result.ok) {
        refused(messageId, result.reason);
        return;
      }
      setAct(messageId, { phase: "done" });
      setNow(new Date());
      router.refresh();
    },
    [props.token, refused, router, setAct],
  );

  const onPay = useCallback((code: string) => {
    window.location.assign(`/pay/${encodeURIComponent(code)}`);
  }, []);

  const onAcceptOffer = useCallback(
    async (offer: ClientOfferSummary) => {
      setAct(offer.id, { phase: "busy" });
      const result = await messagingClientAcceptOffer({ token: props.token, offerId: offer.id, offerVersion: offer.version });
      if (!result.ok) {
        refused(offer.id, result.reason);
        return;
      }
      setAct(offer.id, { phase: "done" });
      if (result.payCode) {
        onPay(result.payCode);
        return;
      }
      router.refresh();
    },
    [onPay, props.token, refused, router, setAct],
  );

  const onDeclineOffer = useCallback(
    async (offer: ClientOfferSummary, reason: string) => {
      setAct(offer.id, { phase: "busy" });
      const result = await messagingClientDeclineOffer({ token: props.token, offerId: offer.id, offerVersion: offer.version, reason });
      if (!result.ok) {
        refused(offer.id, result.reason);
        return;
      }
      setAct(offer.id, { phase: "done" });
      router.refresh();
    },
    [props.token, refused, router, setAct],
  );

  const onChangeRecord = useCallback(
    async (recordKind: string, recordId: string, text: string, key = recordId) => {
      setAct(key, { phase: "busy" });
      const result = await messagingClientRequestChange({ token: props.token, recordKind, recordId, text });
      if (!result.ok) {
        refused(key, result.reason);
        return;
      }
      // A new epoch remounts the card so its change form closes (ClientThreadView keys on it).
      setAct(key, { phase: "idle", epoch: Date.now() });
      router.refresh();
    },
    [props.token, refused, router, setAct],
  );

  return (
    <ClientThreadView
      copy={copy}
      kit={kit}
      locale={props.locale}
      business={props.business}
      messages={messages}
      offers={props.offers}
      payCode={props.payCode}
      now={now}
      activity={activity}
      composer={{ value, phase }}
      onComposerChange={(v) => {
        setValue(v);
        if (phase === "failed" || phase === "sent") setPhase("idle");
      }}
      onSend={() => void send(value)}
      onRetry={() => void send(lastBody || value)}
      onChoose={(id, ids) => void onChoose(id, ids)}
      onPickTime={(id, at) => void onPickTime(id, at)}
      onAcceptOffer={(o) => void onAcceptOffer(o)}
      onDeclineOffer={(o, r) => void onDeclineOffer(o, r)}
      onChangeOffer={(o, text) => void onChangeRecord("offer", o.id, text, o.id)}
      onChangeRecord={(k, id, text) => void onChangeRecord(k, id, text, id)}
      onPay={onPay}
      // D-MSG-166: `sendGuestClaimToEmail` needs the guest cookie session that owns the inquiry; a link holder has none.
      onSaveToEmail={null}
      threadTokenExpiresAt={props.threadTokenExpiresAt}
    />
  );
}
