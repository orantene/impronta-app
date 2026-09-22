"use client";

/**
 * GuestNextStep — L13. The one next step above the dock's composer, derived
 * from state (`deriveGuestNextStep`) and acting through the same card actions
 * the cards use: Pay opens the pay page, Accept accepts the pending offer.
 * Sentences without a button (waiting for the business, booked) are drawn as
 * sentences, never as a fake button. Hidden when there is nothing to do or
 * when the tenant keeps the legacy bubbles (cards_v5 off).
 */

import { useMemo } from "react";

import type { Translator } from "@/i18n/interpolate";
import { interpolate } from "@/i18n/interpolate";
import type { GuestThreadV5Extras } from "@/lib/inquiry/guest-chat-contract";
import { deriveGuestNextStep } from "@/lib/messages-v5/guest-next-step";
import { formatOrderMoney } from "@/lib/orders/money-format";

import type { GuestClientCardsModel } from "./GuestClientCards";
import { FONT, type paletteFor } from "./mini-chat-styles";

const TITLE_KEY = {
  pay: "public.guestChat.nextPayTitle",
  accept_offer: "public.guestChat.nextAcceptTitle",
  waiting_confirm: "public.guestChat.nextWaitingTitle",
  booked: "public.guestChat.nextBookedTitle",
} as const;
const SUB_KEY = {
  pay: "public.guestChat.nextPaySub",
  accept_offer: "public.guestChat.nextAcceptSub",
  waiting_confirm: "public.guestChat.nextWaitingSub",
  booked: "public.guestChat.nextBookedSub",
} as const;
const BUTTON_KEY = { pay: "public.guestChat.nextPayButton", accept_offer: "public.guestChat.nextAcceptButton" } as const;

export function GuestNextStep({
  v5,
  model,
  threadStatus,
  businessName,
  locale,
  now,
  t,
  C,
  accent,
  accentInk,
  bookAgainNotice = false,
}: {
  v5: GuestThreadV5Extras | null;
  model: GuestClientCardsModel;
  threadStatus: string;
  businessName: string;
  locale: string;
  now: Date;
  t: Translator;
  C: ReturnType<typeof paletteFor>;
  accent: string;
  accentInk: string;
  bookAgainNotice?: boolean;
}) {
  const step = useMemo(() => {
    if (!v5) return null;
    return deriveGuestNextStep({
      threadStatus,
      offers: v5.offers,
      payCode: v5.payCode,
      timesPayloads: model.messages.filter((m) => m.kind === "professional_times").map((m) => m.payload),
      records: v5.items?.records ?? [],
      now,
      money: formatOrderMoney,
      date: (iso) => new Date(iso).toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short" }),
    });
  }, [v5, threadStatus, model.messages, now, locale]);
  if (!step && !bookAgainNotice) return null;
  const notice = bookAgainNotice ? (
    <div data-book-again-started style={{ padding: "10px 14px 0", fontFamily: FONT, fontSize: 13, fontWeight: 600, color: C.ink }}>
      {t("public.guestChat.dockBookAgainStarted")}
    </div>
  ) : null;
  if (!step) return notice;

  const values = { ...step.values, business: businessName };
  const busy = step.kind === "accept_offer" && step.offer ? model.actions.activity[step.offer.id]?.phase === "busy" : false;
  const onClick =
    step.kind === "pay" && step.payCode
      ? () => model.actions.onPay(step.payCode as string)
      : step.kind === "accept_offer" && step.offer
        ? () => void model.actions.onAcceptOffer(step.offer as NonNullable<typeof step.offer>)
        : null;
  const buttonKey = step.kind === "pay" || step.kind === "accept_offer" ? BUTTON_KEY[step.kind] : null;

  return (
    <>
    {notice}
    <div
      data-guest-next-step={step.kind}
      style={{ padding: "10px 14px 8px", borderTop: `1px solid ${C.borderSoft}`, background: C.surface, display: "flex", flexDirection: "column", gap: 3, fontFamily: FONT }}
    >
      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", color: C.inkMuted }}>{t("public.guestChat.nextLabel")}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: C.ink, letterSpacing: -0.2 }}>{interpolate(t(TITLE_KEY[step.kind]), values)}</div>
      <div style={{ fontSize: 12.5, color: C.inkDim, marginBottom: onClick ? 6 : 0 }}>{interpolate(t(SUB_KEY[step.kind]), values)}</div>
      {onClick && buttonKey && (
        <button
          type="button"
          onClick={onClick}
          disabled={busy}
          aria-busy={busy || undefined}
          data-guest-next-step-action
          style={{ width: "100%", border: "none", borderRadius: 12, padding: "12px 14px", background: accent, color: accentInk, fontSize: 14, fontWeight: 700, cursor: busy ? "default" : "pointer", opacity: busy ? 0.7 : 1, fontFamily: FONT }}
        >
          {interpolate(t(buttonKey), values)}
        </button>
      )}
    </div>
    </>
  );
}
