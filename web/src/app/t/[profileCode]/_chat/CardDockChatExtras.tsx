"use client";

/**
 * CardDockChatExtras: the card skin's pieces of the Hablar tab that the dock
 * column does not draw itself.
 *
 *  - `CardDockIntro`        the "nothing is sent" note + her greeting bubble
 *  - `CardDockBackToBooking` "Volver a mi reserva" while a booking is stashed
 *  - `CardDockAskFooter`    the "asking about" context card, or the quick
 *                           question chips on an empty thread (chips FILL the
 *                           composer, they never send)
 */

import { useState, useSyncExternalStore, type CSSProperties } from "react";

import type { Translator } from "@/i18n/interpolate";
import { interpolate } from "@/i18n/interpolate";
import {
  peekBookingResume,
  requestBookingResume,
  subscribeBookingResume,
} from "@/components/public-booking/booking-resume-store";

import { CardChatBackToBooking, CardChatChips, CardChatContextCard } from "./CardChatExtras";
import { clearPendingOffering, peekPendingOffering } from "./pending-offering-store";

const BUBBLE: CSSProperties = {
  maxWidth: "82%",
  padding: "10px 13px",
  borderRadius: 18,
  fontSize: 14.5,
  lineHeight: 1.4,
  whiteSpace: "pre-wrap",
  overflowWrap: "anywhere",
  background: "var(--cc-bg)",
  color: "var(--cc-ink)",
  borderBottomLeftRadius: 6,
  alignSelf: "flex-start",
};

export function CardDockIntro({ t, name, greeting }: { t: Translator; name: string; greeting: string }) {
  return (
    <>
      <div data-card-dock-note="" style={{ textAlign: "center", fontSize: 11.5, color: "var(--cc-muted)" }}>
        {interpolate(t("public.guestChat.cardNote"), { name })}
      </div>
      <div data-card-dock-greeting="" style={BUBBLE}>
        {greeting}
      </div>
    </>
  );
}

export function CardDockBackToBooking({
  locale,
  t,
  onBack,
}: {
  locale: string;
  t: Translator;
  /** The dock steps aside so the booking sheet can come back. */
  onBack: () => void;
}) {
  const resume = useSyncExternalStore(subscribeBookingResume, peekBookingResume, () => null);
  if (!resume) return null;
  return (
    <CardChatBackToBooking
      resume={resume}
      locale={locale}
      t={t}
      onBack={() => {
        requestBookingResume();
        onBack();
      }}
    />
  );
}

export function CardDockAskFooter({
  t,
  threadEmpty,
  onPick,
}: {
  t: Translator;
  threadEmpty: boolean;
  /** Fill the composer with the question. */
  onPick: (question: string) => void;
}) {
  const [, bump] = useState(0);
  const pending = peekPendingOffering();
  if (pending) {
    const titles = pending.askAbout?.length ? pending.askAbout : [pending.title];
    return (
      <CardChatContextCard
        titles={titles}
        imageUrl={pending.imageUrl ?? null}
        t={t}
        onPick={onPick}
        onClear={() => {
          clearPendingOffering();
          bump((n) => n + 1);
        }}
      />
    );
  }
  if (!threadEmpty) return null;
  return (
    <div style={{ padding: "8px 12px 0" }}>
      <CardChatChips t={t} onPick={onPick} />
    </div>
  );
}
