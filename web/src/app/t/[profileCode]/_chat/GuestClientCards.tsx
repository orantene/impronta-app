"use client";

/**
 * L13 · the Messages v5 client cards inside the guest dock.
 *
 * The dock keeps its own bubbles (`MiniChatMessageBubble`) for text; every
 * row whose kind is a v5 card kind (choices, times, offer, payment, confirmed,
 * change, basket) is drawn by the SAME `ClientCard` the secure link draws, and
 * acts through the same `useClientCardActions` (thread-token identity, minted
 * by the full thread load once the guest cookie has proven ownership).
 *
 * TUL-280: accepting an offer requires a signed-in client. Unsigned guests see
 * "Sign in to accept" / "Inicia sesión para aceptar" and an inline email-code
 * form — never the dead-end `not_allowed` refusal.
 *
 * `GuestThreadMessage` → `ThreadMessage` is a shape change only: the reader
 * has already filtered to what the guest may see (D-MSG-2).
 */

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";

import { translatorFor } from "@/i18n/use-t";
import type { GuestThreadMessage, GuestThreadV5Extras } from "@/lib/inquiry/guest-chat-contract";
import type { ThreadMessage } from "@/lib/messaging/types";
import type { ClientOfferSummary } from "@/lib/messages-v5/client-thread-view";
import { isClientCardKind, offerCardMessageIds } from "@/lib/messages-v5/client-thread-view";
import { ClientCard } from "@/components/messages-v5/client/ClientCard";
import { buildClientCopy } from "@/components/messages-v5/client/copy";
import { useClientCardActions } from "@/components/messages-v5/client/use-client-card-actions";
import { buildKitCopy } from "@/components/messages-v5/kit/copy";
import "@/components/messages-v5/kit/tokens.css";

import { GuestOfferSignIn } from "./GuestOfferSignIn";
import { readableOn } from "./mini-chat-styles";

export function isGuestClientCardRow(m: Pick<GuestThreadMessage, "kind" | "isDeleted">): boolean {
  return !m.isDeleted && isClientCardKind(m.kind);
}

export function toThreadMessage(m: GuestThreadMessage): ThreadMessage {
  return {
    id: m.id,
    inquiryId: m.inquiryId,
    kind: m.kind,
    body: m.body,
    payload: m.cardPayload && typeof m.cardPayload === "object" ? (m.cardPayload as Record<string, unknown>) : null,
    // The client side is "no staff sender" (`isMine`); the id itself is never
    // read by a card, only its null-ness, so a sentinel keeps staff rows staff.
    senderUserId: m.authorRole === "guest" ? null : "staff",
    guestSessionId: null,
    createdAt: m.createdAt,
    editedAt: m.editedAt,
    deletedAt: m.isDeleted ? m.createdAt : null,
    thread: "private",
    internal: false,
    delivery: null,
    system: m.authorRole === "system",
  };
}

export type GuestClientCardsModel = ReturnType<typeof useGuestClientCards>;

/**
 * One model per open thread: copy, actions and the offer-card set, shared by
 * every card row in the stream. `refresh` bumps the panel's full load.
 */
export function useGuestClientCards(input: {
  readonly rows: readonly GuestThreadMessage[];
  readonly v5: GuestThreadV5Extras | null;
  readonly locale: string;
  readonly businessName: string;
  readonly refresh: () => void;
  readonly onTick?: () => void;
  readonly onAsk?: (text: string) => void;
  /** Prefill for the offer accept sign-in form. */
  readonly contactEmail?: string | null;
  readonly accent?: string;
  readonly accentInk?: string;
}) {
  const { rows, v5, locale, businessName, refresh, onTick, onAsk, contactEmail, accent, accentInk } = input;
  const t = useMemo(() => translatorFor(locale), [locale]);
  const kit = useMemo(() => buildKitCopy(t), [t]);
  const copy = useMemo(() => buildClientCopy(t), [t]);
  const messages = useMemo(() => rows.map(toThreadMessage), [rows]);
  const offers = v5?.offers;
  const offerCards = useMemo(() => offerCardMessageIds(messages, offers), [messages, offers]);
  const baseActions = useClientCardActions({ token: v5?.threadToken ?? null, messages, refresh, onTick });

  // null = still checking; false = guest; true = signed-in client.
  const [clientSignedIn, setClientSignedIn] = useState<boolean | null>(null);
  const [signInOffer, setSignInOffer] = useState<ClientOfferSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    const qs = new URLSearchParams({ locale: locale.startsWith("es") ? "es" : "en" });
    void fetch(`/api/client/account?${qs.toString()}`, { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((me: { signedIn?: boolean } | null) => {
        if (!cancelled) setClientSignedIn(Boolean(me?.signedIn));
      })
      .catch(() => {
        if (!cancelled) setClientSignedIn(false);
      });
    return () => {
      cancelled = true;
    };
  }, [locale]);

  const requireSignInToAccept = clientSignedIn !== true;
  const signInToAcceptLabel = t("public.guestChat.signInToAccept");

  const onAcceptOffer = useCallback(
    async (offer: ClientOfferSummary) => {
      if (clientSignedIn !== true) {
        setSignInOffer(offer);
        return;
      }
      await baseActions.onAcceptOffer(offer);
    },
    [baseActions, clientSignedIn],
  );

  const onSignInComplete = useCallback(async () => {
    const offer = signInOffer;
    setClientSignedIn(true);
    setSignInOffer(null);
    if (offer) await baseActions.onAcceptOffer(offer);
    else refresh();
  }, [baseActions, refresh, signInOffer]);

  const onCancelSignIn = useCallback(() => setSignInOffer(null), []);

  const actions = useMemo(
    () => ({ ...baseActions, onAcceptOffer }),
    [baseActions, onAcceptOffer],
  );

  const offerSignInPanel = signInOffer ? (
    <GuestOfferSignIn
      locale={locale}
      t={t}
      accent={accent ?? "#111"}
      accentInk={accentInk ?? "#fff"}
      emailPrefill={contactEmail}
      onSignedIn={onSignInComplete}
      onCancel={onCancelSignIn}
    />
  ) : null;

  return {
    kit,
    copy,
    messages,
    offerCards,
    actions,
    offers: offers ?? [],
    payCode: v5?.payCode ?? null,
    businessName,
    locale,
    onAsk,
    requireSignInToAccept,
    signInToAcceptLabel,
    offerSignInOfferId: signInOffer?.id ?? null,
    offerSignInPanel,
    contactEmail: contactEmail ?? null,
    t,
  };
}

export function GuestClientCardRow({
  row,
  model,
  now,
  accent,
  accentInk,
}: {
  readonly row: GuestThreadMessage;
  readonly model: GuestClientCardsModel;
  readonly now: Date;
  /** Tenant accent — paints the brief offer card border when present. */
  readonly accent?: string;
  /** Readable ink on the accent Accept fill (falls back to readableOn). */
  readonly accentInk?: string;
}) {
  const message = useMemo(() => toThreadMessage(row), [row]);
  if (!isClientCardKind(message.kind)) return null;
  const offerInk = accentInk || (accent ? readableOn(accent) : undefined);
  return (
    <div
      className="msgv5"
      data-guest-client-card={message.kind}
      style={
        accent
          ? ({
              ["--msgv5-offer-border"]: accent,
              ["--msgv5-offer-chip"]: `${accent}14`,
              ...(offerInk ? { ["--msgv5-offer-ink"]: offerInk } : {}),
            } as CSSProperties)
          : undefined
      }
    >
      <ClientCard
        message={message}
        kind={message.kind}
        copy={model.copy}
        kit={model.kit}
        locale={model.locale}
        business={model.businessName}
        now={now}
        offers={model.offers}
        payCode={model.payCode}
        offerCards={model.offerCards}
        actions={model.actions}
        onAsk={model.onAsk}
        offerAcceptLabel={model.requireSignInToAccept ? model.signInToAcceptLabel : undefined}
        offerSignInOfferId={model.offerSignInOfferId}
        offerSignInPanel={model.offerSignInPanel}
      />
    </div>
  );
}
