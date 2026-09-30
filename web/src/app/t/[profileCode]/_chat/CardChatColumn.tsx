"use client";

/**
 * CardChatPanel: the `chat.variant = card` look of the guest chat on a
 * talent's own site. A calm one-to-one card (avatar + name + honest subline,
 * services + close round buttons, a "nothing is sent" note, her greeting
 * bubble, a message pill with a round accent send arrow).
 *
 * Same engine as the dock column: it consumes the SAME props MiniChatPanel
 * builds for MiniChatPanelColumn (draft, submit, gate, rows, send-to-her bar),
 * so sending, the name/email gate and the booking hand-off are unchanged. Only
 * the chrome differs. Colours and font come from her site tokens (ChatCardConfig)
 * with the page's `--token-color-*` vars, then the chat palette, as fallbacks.
 */

import { useEffect, useState, useSyncExternalStore, type CSSProperties } from "react";

import { createTranslator } from "@/i18n/messages";
import { interpolate } from "@/i18n/interpolate";
import type { ChatCardConfig } from "@/lib/talent-site/chat-card";

import {
  peekBookingResume,
  requestBookingResume,
  subscribeBookingResume,
} from "@/components/public-booking/booking-resume-store";
import { requestChatAddService } from "@/components/public-booking/chat-catalog-events";

import {
  CARD_CHAT_CSS,
  CardChatBackToBooking,
  CardChatChips,
  CardChatContextCard,
  CardChatServiceBrowser,
} from "./CardChatExtras";
import type { MiniChatPanelColumnProps } from "./MiniChatPanelColumn";
import { MiniChatGateForm } from "./MiniChatGateForm";
import { MiniChatMessageBubble } from "./MiniChatMessageBubble";
import { SendToAgencyBar } from "./SendToAgencyBar";
import { buildGateLineupRecap } from "./guest-gate-lineup-recap";
import { guestThreadBlocksSendBar } from "./guest-thread-blocks-send";
import { clearPendingOffering, peekPendingOffering, setPendingOffering } from "./pending-offering-store";
import { C, FONT } from "./mini-chat-styles";
import a11y from "./mini-chat-a11y.module.css";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type CardChatPanelProps = MiniChatPanelColumnProps & {
  card: ChatCardConfig;
  /** Phone-class viewport: the card fills the screen. */
  compact: boolean;
  /** Soft-keyboard inset (Visual Viewport); phone only. */
  keyboardInsetPx: number;
};

/** Theme value → page token var → chat palette. */
function tone(value: string | null, tokenVar: string, fallback: string): string {
  return value ?? `var(${tokenVar}, ${fallback})`;
}

function cardVars(card: ChatCardConfig, accent: string, accentInk: string): Record<string, string> {
  const c = card.colors;
  return {
    "--cc-bg": tone(c.background, "--token-color-background", C.surfaceFaint),
    "--cc-surface": tone(c.surface, "--token-color-surface-raised", C.surface),
    "--cc-ink": tone(c.ink, "--token-color-ink", C.ink),
    "--cc-muted": tone(c.muted, "--token-color-muted", C.inkMuted),
    "--cc-line": tone(c.line, "--token-color-line", C.borderSoft),
    "--cc-accent": c.accent ?? accent,
    "--cc-on": c.onAccent ?? accentInk,
    "--cc-font": card.bodyFont ?? `var(--site-body-font, ${FONT})`,
  };
}

function frame(compact: boolean, keyboardInsetPx: number): CSSProperties {
  const base: CSSProperties = {
    position: "fixed",
    zIndex: 96,
    display: "flex",
    flexDirection: "column",
    background: "var(--cc-surface)",
    color: "var(--cc-ink)",
    fontFamily: "var(--cc-font)",
    overflow: "hidden",
  };
  if (compact) {
    return {
      ...base,
      inset: 0,
      bottom: keyboardInsetPx > 0 ? keyboardInsetPx : 0,
      paddingBottom: "env(safe-area-inset-bottom)",
    };
  }
  return {
    ...base,
    right: 24,
    bottom: 24,
    width: "min(400px, calc(100vw - 32px))",
    height: "min(640px, calc(100dvh - 48px))",
    borderRadius: 24,
    border: "1px solid var(--cc-line)",
    boxShadow: "0 30px 70px -30px color-mix(in srgb, var(--cc-ink) 50%, transparent)",
  };
}

const ROUND_BTN: CSSProperties = {
  width: 38,
  height: 38,
  borderRadius: "50%",
  border: 0,
  background: "var(--cc-bg)",
  color: "var(--cc-ink)",
  display: "grid",
  placeItems: "center",
  flex: "0 0 auto",
  cursor: "pointer",
  padding: 0,
};

function LinesIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
      <path d="M5 9h14M5 15h14" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

const BUBBLE: CSSProperties = {
  maxWidth: "82%",
  padding: "10px 13px",
  borderRadius: 18,
  fontSize: 14.5,
  lineHeight: 1.4,
  whiteSpace: "pre-wrap",
  overflowWrap: "anywhere",
};

export function CardChatPanel(props: CardChatPanelProps) {
  const {
    card,
    compact,
    keyboardInsetPx,
    brand,
    accent,
    accentInk,
    talentFirst,
    rows,
    scrollRef,
    stage,
    draft,
    onDraftChange,
    honeypot,
    onHoneypotChange,
    onSubmit,
    sending,
    inCooldown,
    sendDisabled,
    error,
    captchaRequired,
    onClose,
    textareaRef,
    firstName,
    lastName,
    email,
    onFirstNameChange,
    onLastNameChange,
    onEmailChange,
    onFirstSend,
    gateEmailNotice = null,
    gateEmailBlocksSubmit = false,
    cartTalentNames = [],
    extrasEnabled = false,
    onSendToAgency,
    sentNote = false,
    isHub = false,
    typicalReply,
    surfaceMode = "light",
    offerings = [],
  } = props;
  const t = createTranslator(brand.locale ?? "en");
  const name = brand.talentDisplayName || brand.agencyName;
  const showGate = stage === "gate";
  const photo = brand.photoUrl ?? brand.logoUrl ?? null;
  const subline = [card.replyLabel, card.city].filter(Boolean).join(" · ");
  const greeting =
    card.customGreeting?.trim() || interpolate(t("public.guestChat.cardGreeting"), { name: talentFirst || name });
  const visibleRows = rows.filter((m) => !m.isDeleted);

  // CH-4: the header list button swaps the thread for her services (no more
  // closing the chat and scrolling the page). CH-3: the way back to the sheet.
  const [browsing, setBrowsing] = useState(false);
  const [, bumpPending] = useState(0);
  const resume = useSyncExternalStore(subscribeBookingResume, peekBookingResume, () => null);
  const pending = peekPendingOffering();
  const askTitles = pending ? (pending.askAbout?.length ? pending.askAbout : [pending.title]) : [];
  const fillComposer = (q: string) => {
    onDraftChange(q);
    textareaRef.current?.focus();
  };

  // The booking sheet opening (an Add that needs options) hides the chat.
  useEffect(() => {
    const onSheet = (e: Event) => {
      if ((e as CustomEvent<{ open?: boolean }>).detail?.open === true) onClose();
    };
    window.addEventListener("tulala:maison-sheet", onSheet);
    return () => window.removeEventListener("tulala:maison-sheet", onSheet);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label={interpolate(t("public.guestChat.messageBrandAria"), { brand: name })}
      data-chat-variant="card"
      data-tl-motion=""
      style={{ ...cardVars(card, accent, accentInk), ...frame(compact, keyboardInsetPx) } as CSSProperties}
    >
      <style>{CARD_CHAT_CSS}</style>
      <div
        style={{
          padding: "14px 14px 10px",
          display: "flex",
          alignItems: "center",
          gap: 10,
          borderBottom: "1px solid var(--cc-line)",
        }}
      >
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element -- tenant avatar URL, small
          <img src={photo} alt="" width={38} height={38} style={{ width: 38, height: 38, borderRadius: "50%", objectFit: "cover" }} />
        ) : null}
        <div style={{ flex: 1, minWidth: 0 }}>
          <b style={{ display: "block", fontSize: 15, fontWeight: 600 }}>{name}</b>
          {subline ? <small style={{ fontSize: 12, color: "var(--cc-muted)" }}>{subline}</small> : null}
        </div>
        {card.browseServices ? (
          <button type="button" onClick={() => setBrowsing((v) => !v)} aria-expanded={browsing} aria-label={t("public.guestChat.cardServicesAria")} className={a11y.focusRing} style={ROUND_BTN}>
            <LinesIcon />
          </button>
        ) : null}
        <button type="button" onClick={onClose} aria-label={t("public.guestChat.closeAria")} className={a11y.focusRing} style={ROUND_BTN}>
          <XIcon />
        </button>
      </div>

      {resume && !showGate ? (
        <CardChatBackToBooking
          resume={resume}
          locale={brand.locale ?? "en"}
          t={t}
          onBack={() => {
            requestBookingResume();
            onClose();
          }}
        />
      ) : null}

      <div
        ref={scrollRef}
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          padding: "14px 14px 10px",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {browsing ? (
          <CardChatServiceBrowser
            offerings={offerings}
            locale={brand.locale ?? "en"}
            t={t}
            onBack={() => setBrowsing(false)}
            onAdd={(o) => {
              requestChatAddService(o.offeringId);
              setBrowsing(false);
              onClose();
            }}
            onAsk={(o) => {
              setPendingOffering({ ...o, intent: "request", askAbout: [o.title] });
              setBrowsing(false);
            }}
          />
        ) : (
          <>
        <div style={{ textAlign: "center", fontSize: 11.5, color: "var(--cc-muted)" }}>
          {interpolate(t("public.guestChat.cardNote"), { name: talentFirst || name })}
        </div>
        <div style={{ ...BUBBLE, background: "var(--cc-bg)", borderBottomLeftRadius: 6, alignSelf: "flex-start" }}>
          {greeting}
        </div>
        {visibleRows.map((m) =>
          m.kind !== "text" ? (
            // Typed cards (offers, receipts, ...) keep the shared renderer.
            <MiniChatMessageBubble key={m.id} m={m} accent={accent} locale={brand.locale ?? "en"} surfaceMode={surfaceMode} />
          ) : m.authorRole === "system" ? (
            <div key={m.id} style={{ textAlign: "center", fontSize: 11.5, color: "var(--cc-muted)" }}>
              {m.body}
            </div>
          ) : m.authorRole === "guest" ? (
            <div
              key={m.id}
              style={{
                ...BUBBLE,
                background: "var(--cc-accent)",
                color: "var(--cc-on)",
                borderBottomRightRadius: 6,
                alignSelf: "flex-end",
                opacity: m.pending ? 0.6 : 1,
              }}
            >
              {m.body}
            </div>
          ) : (
            <div key={m.id} style={{ ...BUBBLE, background: "var(--cc-bg)", borderBottomLeftRadius: 6, alignSelf: "flex-start" }}>
              {m.body}
            </div>
          ),
        )}
          </>
        )}
      </div>

      {showGate ? (
        <MiniChatGateForm
          t={t}
          talentFirst={talentFirst}
          lineupRecap={buildGateLineupRecap(cartTalentNames, brand.agencyName, t)}
          draft={draft}
          firstName={firstName}
          onFirstNameChange={onFirstNameChange}
          lastName={lastName}
          onLastNameChange={onLastNameChange}
          email={email}
          onEmailChange={onEmailChange}
          accent={accent}
          accentInk={accentInk}
          gateReady={Boolean(firstName.trim()) && EMAIL_RE.test(email.trim())}
          emailNotice={gateEmailNotice}
          emailBlocksSubmit={gateEmailBlocksSubmit}
          sending={sending}
          surfaceMode={surfaceMode}
          onSend={onFirstSend}
        />
      ) : null}

      {(error || (captchaRequired && !showGate)) && !showGate ? (
        <div role="alert" style={{ padding: "7px 14px", fontSize: 11.5, color: C.danger }}>
          {error ?? t("public.guestChat.captchaNotice")}
        </div>
      ) : null}

      {!showGate && extrasEnabled && onSendToAgency && !guestThreadBlocksSendBar(rows) ? (
        <SendToAgencyBar
          accent={accent}
          accentInk={accentInk}
          t={t}
          isHub={isHub || Boolean(brand.omitPlatformBrand)}
          brandName={brand.agencyName}
          surfaceMode={surfaceMode}
          disabled={sending || inCooldown}
          sent={sentNote}
          typicalReply={typicalReply}
          onSend={onSendToAgency}
        />
      ) : null}

      {!showGate && !browsing ? (
        pending ? (
          <CardChatContextCard
            titles={askTitles}
            imageUrl={pending.imageUrl ?? null}
            t={t}
            onPick={fillComposer}
            onClear={() => {
              clearPendingOffering();
              bumpPending((n) => n + 1);
            }}
          />
        ) : visibleRows.length === 0 ? (
          <div style={{ padding: "8px 12px 0" }}>
            <CardChatChips t={t} onPick={fillComposer} />
          </div>
        ) : null
      ) : null}

      {!showGate ? (
        <div
          style={{
            borderTop: "1px solid var(--cc-line)",
            padding: "10px 12px 14px",
            display: "flex",
            gap: 8,
            alignItems: "flex-end",
            background: "var(--cc-surface)",
          }}
        >
          <input
            type="text"
            name="company_website"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            value={honeypot}
            onChange={(e) => onHoneypotChange(e.target.value)}
            style={{ position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0 0 0 0)", border: 0 }}
          />
          <textarea
            ref={textareaRef}
            value={draft}
            rows={1}
            onChange={(e) => onDraftChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (!sendDisabled) onSubmit();
              }
            }}
            placeholder={t("public.guestChat.cardPlaceholder")}
            aria-label={t("public.guestChat.cardPlaceholder")}
            disabled={sending || inCooldown}
            className={a11y.focusRing}
            style={{
              flex: 1,
              minWidth: 0,
              height: 46,
              maxHeight: 132,
              border: "1.5px solid var(--cc-line)",
              borderRadius: 20,
              padding: "11px 14px",
              font: "15px var(--cc-font)",
              resize: "none",
              background: "var(--cc-bg)",
              color: "var(--cc-ink)",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
          <button
            type="button"
            onClick={onSubmit}
            disabled={sendDisabled}
            aria-label={t("public.guestChat.sendMessageAria")}
            data-send-state={sendDisabled ? "disabled" : "ready"}
            className={a11y.focusRing}
            style={{
              width: 46,
              height: 46,
              borderRadius: "50%",
              border: 0,
              background: "var(--cc-accent)",
              color: "var(--cc-on)",
              display: "grid",
              placeItems: "center",
              flex: "0 0 auto",
              padding: 0,
              opacity: sendDisabled ? 0.35 : 1,
              cursor: sendDisabled ? "not-allowed" : "pointer",
            }}
          >
            <ArrowIcon />
          </button>
        </div>
      ) : null}
    </div>
  );
}
