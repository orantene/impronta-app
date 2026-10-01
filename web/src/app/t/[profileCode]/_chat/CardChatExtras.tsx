"use client";

/**
 * Card chat add-ons (slice 2.6): the parts the `chat.variant = card` panel
 * shares with every site design that mounts it. Colours come from the panel's
 * `--cc-*` vars (set from the site tokens), never from literals.
 *
 *  - CH-2  `CardChatContextCard`  removable "asking about" card + suggestion chips
 *  - CH-3  `CardChatBackToBooking` "Volver a mi reserva" strip
 *  - CH-4  `CardChatServiceBrowser` in-chat service list (Add / Ask / Back)
 */

import type { CSSProperties } from "react";

import type { Translator } from "@/i18n/interpolate";
import { interpolate } from "@/i18n/interpolate";
import { formatMoney } from "@/lib/talent/offerings-money";

import type { BookingResumeSnapshot } from "@/components/public-booking/booking-resume-store";

import { ASK_QUICK_KEYS } from "./GuestAskAboutCard";
import type { ChatOffering } from "./OfferingQuickPicker";
import a11y from "./mini-chat-a11y.module.css";

/** A-10: the panel rises in .25 s; reduced motion shows it instantly. */
export const CARD_CHAT_CSS = `@keyframes cc-up{from{transform:translateY(40px);opacity:.4}}
[data-chat-variant="card"]{animation:cc-up .25s cubic-bezier(.2,.8,.2,1)}
@media (prefers-reduced-motion:reduce){[data-chat-variant="card"]{animation:none}}`;

const CHIP: CSSProperties = {
  background: "var(--cc-bg)",
  border: "1px solid var(--cc-line)",
  borderRadius: 999,
  padding: "7px 12px",
  fontSize: 12.5,
  color: "var(--cc-ink)",
  cursor: "pointer",
  fontFamily: "var(--cc-font)",
};

const PILL_BTN: CSSProperties = {
  border: "1px solid var(--cc-line)",
  background: "var(--cc-surface)",
  color: "var(--cc-ink)",
  borderRadius: 999,
  padding: "7px 14px",
  fontSize: 13,
  fontFamily: "var(--cc-font)",
  cursor: "pointer",
};

/** Three quick questions. They FILL the composer; they never send. */
export function CardChatChips({ t, onPick }: { t: Translator; onPick: (question: string) => void }) {
  return (
    <div role="group" aria-label={t("public.guestChat.askQuickLabel")} data-card-chat-chips="" style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {ASK_QUICK_KEYS.map((k) => {
        const q = t(k);
        return (
          <button key={k} type="button" className={a11y.focusRing} style={CHIP} onClick={() => onPick(q)}>
            {q}
          </button>
        );
      })}
    </div>
  );
}

/** CH-2: the service she is asking about, removable, with the suggestion chips under it. */
export function CardChatContextCard({
  titles,
  imageUrl,
  t,
  onClear,
  onPick,
}: {
  titles: string[];
  imageUrl: string | null;
  t: Translator;
  onClear: () => void;
  onPick: (question: string) => void;
}) {
  return (
    <div data-card-chat-context="" style={{ padding: "8px 12px 0", display: "flex", flexDirection: "column", gap: 8 }}>
      <div
        style={{
          display: "flex",
          gap: 10,
          alignItems: "center",
          background: "var(--cc-surface)",
          border: "1px solid var(--cc-line)",
          borderRadius: 16,
          padding: 8,
        }}
      >
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- tenant service photo, small
          <img src={imageUrl} alt="" width={40} height={40} style={{ width: 40, height: 40, borderRadius: 10, objectFit: "cover", flex: "0 0 auto" }} />
        ) : null}
        <div style={{ minWidth: 0, flex: 1 }}>
          <small style={{ display: "block", color: "var(--cc-accent)", fontSize: 10.5, letterSpacing: "0.1em", fontWeight: 700, textTransform: "uppercase" }}>
            {t("public.guestChat.askAboutEyebrow")}
          </small>
          <b style={{ display: "block", fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {titles.join(" + ")}
          </b>
        </div>
        <button
          type="button"
          onClick={onClear}
          aria-label={t("public.guestChat.clearService")}
          className={a11y.focusRing}
          style={{ border: 0, background: "transparent", color: "var(--cc-muted)", cursor: "pointer", width: 32, height: 32, borderRadius: 999, flex: "0 0 auto" }}
        >
          ✕
        </button>
      </div>
      <CardChatChips t={t} onPick={onPick} />
    </div>
  );
}

/** CH-3: "Volver a mi reserva · Gel pedicure, $300". */
export function CardChatBackToBooking({
  resume,
  locale,
  t,
  onBack,
}: {
  resume: BookingResumeSnapshot;
  locale: string;
  t: Translator;
  onBack: () => void;
}) {
  const sub = [resume.title, resume.priceLabel ?? (resume.totalCents != null ? formatMoney(resume.totalCents, resume.currency, locale) : null)]
    .filter(Boolean)
    .join(", ");
  return (
    <button
      type="button"
      data-card-chat-back-to-booking=""
      onClick={onBack}
      className={a11y.focusRing}
      style={{
        margin: "8px 12px 0",
        display: "flex",
        alignItems: "center",
        gap: 8,
        textAlign: "left",
        background: "var(--cc-bg)",
        border: "1px solid var(--cc-line)",
        borderRadius: 14,
        padding: "10px 12px",
        color: "var(--cc-ink)",
        fontFamily: "var(--cc-font)",
        fontSize: 13.5,
        cursor: "pointer",
      }}
    >
      <span aria-hidden>←</span>
      <span style={{ minWidth: 0 }}>
        <b style={{ fontWeight: 600 }}>{t("public.guestChat.cardBackToBooking")}</b>
        <span style={{ color: "var(--cc-muted)" }}> · {sub}</span>
      </span>
    </button>
  );
}

function priceLine(o: ChatOffering, locale: string, t: Translator): string {
  // The menu's own price line when the page supplied it; the plain fallback otherwise.
  const price = o.priceLabel ?? (o.amountCents == null ? t("public.guestChat.cardBrowseQuote") : formatMoney(o.amountCents, o.currency, locale));
  return o.durationMinutes && !o.priceIsPerUnit ? `${o.durationMinutes} min · ${price}` : price;
}

/** CH-4: the service list that swaps with the thread (the header list button toggles it). */
export function CardChatServiceBrowser({
  offerings,
  locale,
  t,
  onAdd,
  onAsk,
  onBack,
}: {
  offerings: ChatOffering[];
  locale: string;
  t: Translator;
  onAdd: (o: ChatOffering) => void;
  onAsk: (o: ChatOffering) => void;
  onBack: () => void;
}) {
  return (
    <div data-card-chat-browser="" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <button type="button" onClick={onBack} className={a11y.focusRing} style={{ ...PILL_BTN, alignSelf: "flex-start" }}>
        ← {t("public.guestChat.cardBrowseBack")}
      </button>
      {offerings.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--cc-muted)", margin: 0 }}>{t("public.guestChat.cardBrowseEmpty")}</p>
      ) : (
        offerings.map((o) => (
          <div
            key={o.offeringId}
            data-card-chat-service=""
            style={{ display: "flex", gap: 10, alignItems: "center", border: "1px solid var(--cc-line)", borderRadius: 16, padding: 8, background: "var(--cc-surface)" }}
          >
            {o.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- tenant service photo, small
              <img src={o.imageUrl} alt="" width={48} height={48} style={{ width: 48, height: 48, borderRadius: 12, objectFit: "cover", flex: "0 0 auto" }} />
            ) : null}
            <div style={{ minWidth: 0, flex: 1 }}>
              <b style={{ display: "block", fontSize: 14, fontWeight: 600 }}>{o.title}</b>
              <small style={{ color: "var(--cc-muted)", fontSize: 12 }}>{priceLine(o, locale, t)}</small>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: "0 0 auto" }}>
              <button
                type="button"
                data-card-chat-add=""
                onClick={() => onAdd(o)}
                aria-label={interpolate(t("public.guestChat.cardBrowseAddAria"), { name: o.title })}
                className={a11y.focusRing}
                style={{ ...PILL_BTN, background: "var(--cc-accent)", color: "var(--cc-on)", borderColor: "var(--cc-accent)" }}
              >
                {t("public.guestChat.cardBrowseAdd")}
              </button>
              <button
                type="button"
                data-card-chat-ask=""
                onClick={() => onAsk(o)}
                aria-label={interpolate(t("public.guestChat.cardBrowseAskAria"), { name: o.title })}
                className={a11y.focusRing}
                style={PILL_BTN}
              >
                {t("public.guestChat.cardBrowseAsk")}
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
