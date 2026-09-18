"use client";

/**
 * GuestDockItemsShelf — L13 wave 2. The non-talent items of the conversation
 * inside the dock's Items tab: the shared POS draft lines (with the S5 author
 * flag: you chose / added by {business} / confirmed) and the record chips
 * (order, appointment, reservation, session, tickets) with their state. Read
 * only: the client adds through the cards in Chat (choices, times), removes
 * nothing here, and never books (owner decision 3). Rendered between the
 * talent shelf and Saved so a restaurant or a salon sees its order or its
 * service where an agency sees its lineup.
 */

import type { Translator } from "@/i18n/interpolate";
import { interpolate } from "@/i18n/interpolate";
import type { GuestConversationItems, GuestDraftLine, GuestRecordChip } from "@/lib/inquiry/guest-chat-contract";
import { formatOrderMoney } from "@/lib/orders/money-format";

import { FONT, type paletteFor } from "./mini-chat-styles";

type Palette = ReturnType<typeof paletteFor>;

const RECORD_KIND_KEY: Record<string, string> = {
  order: "public.guestChat.dockItemsRecordOrder",
  appointment: "public.guestChat.dockItemsRecordAppointment",
  reservation: "public.guestChat.dockItemsRecordReservation",
  class_enrolment: "public.guestChat.dockItemsRecordSession",
  tickets: "public.guestChat.dockItemsRecordTickets",
  project: "public.guestChat.dockItemsRecordProject",
  offer: "public.guestChat.dockItemsRecordOffer",
};

const PAYMENT_KEY: Record<string, string> = {
  requested: "public.guestChat.dockItemsPayRequested",
  opened: "public.guestChat.dockItemsPayOpened",
  paid: "public.guestChat.dockItemsPayPaid",
  failed: "public.guestChat.dockItemsPayFailed",
  expired: "public.guestChat.dockItemsPayExpired",
  refunded: "public.guestChat.dockItemsPayRefunded",
  partially_refunded: "public.guestChat.dockItemsPayPartlyRefunded",
};

const FULFILMENT_KEY: Record<string, string> = {
  hold: "public.guestChat.dockItemsFulHold",
  confirmed: "public.guestChat.dockItemsFulConfirmed",
  preparing: "public.guestChat.dockItemsFulPreparing",
  ready: "public.guestChat.dockItemsFulReady",
  fulfilled: "public.guestChat.dockItemsFulFulfilled",
  seated: "public.guestChat.dockItemsFulSeated",
  checked_in: "public.guestChat.dockItemsFulCheckedIn",
  cancelled: "public.guestChat.dockItemsFulCancelled",
};

function Flag({ text, tone, C, accent }: { text: string; tone: "client" | "staff" | "ok"; C: Palette; accent: string }) {
  const bg = tone === "ok" ? `${accent}1f` : tone === "client" ? C.surfaceFaint : "transparent";
  return (
    <span
      style={{
        display: "inline-block",
        marginLeft: 6,
        padding: "1px 7px",
        borderRadius: 999,
        fontSize: 10.5,
        fontWeight: 600,
        fontFamily: FONT,
        background: bg,
        border: tone === "staff" ? `1px solid ${C.borderSoft}` : "none",
        color: tone === "ok" ? accent : C.inkMuted,
        verticalAlign: 1,
        whiteSpace: "nowrap",
      }}
    >
      {text}
    </span>
  );
}

function LineRow({ line, currency, businessName, t, C, accent }: { line: GuestDraftLine; currency: string; businessName: string; t: Translator; C: Palette; accent: string }) {
  const flag = line.confirmed
    ? { text: t("public.guestChat.dockItemsConfirmed"), tone: "ok" as const }
    : line.author === "client"
      ? { text: t("public.guestChat.dockItemsYouChose"), tone: "client" as const }
      : { text: interpolate(t("public.guestChat.dockItemsAddedBy"), { business: businessName }), tone: "staff" as const };
  const amount = line.unitCents > 0 ? formatOrderMoney(line.unitCents * line.units, currency) : null;
  return (
    <div
      data-guest-dock-item="line"
      style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", fontFamily: FONT }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {line.label}
          <Flag text={flag.text} tone={flag.tone} C={C} accent={accent} />
        </div>
        {line.units > 1 && <div style={{ fontSize: 11.5, color: C.inkDim }}>× {line.units}</div>}
      </div>
      {amount && (
        <div style={{ fontSize: 12.5, fontWeight: 600, color: C.ink, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{amount}</div>
      )}
    </div>
  );
}

function RecordRow({ chip, t, C, accent, locale }: { chip: GuestRecordChip; t: Translator; C: Palette; accent: string; locale: string }) {
  const kindKey = RECORD_KIND_KEY[chip.kind];
  const label = kindKey ? t(kindKey) : chip.kind;
  const pay = chip.paymentState && PAYMENT_KEY[chip.paymentState] ? t(PAYMENT_KEY[chip.paymentState]) : null;
  const ful = chip.fulfilmentState && FULFILMENT_KEY[chip.fulfilmentState] ? t(FULFILMENT_KEY[chip.fulfilmentState]) : null;
  const when = chip.recordDate
    ? new Date(chip.recordDate).toLocaleDateString(locale, { day: "numeric", month: "short" })
    : null;
  const state = [ful, pay].filter(Boolean).join(" · ");
  return (
    <div data-guest-dock-item="record" style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", fontFamily: FONT }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>
          {label}
          {when && <span style={{ fontWeight: 500, color: C.inkDim }}> · {when}</span>}
        </div>
        {state ? (
          <div style={{ fontSize: 11.5, color: chip.paymentState === "paid" || chip.fulfilmentState === "confirmed" ? accent : C.inkDim }}>{state}</div>
        ) : (
          <div style={{ fontSize: 11.5, color: C.inkDim }}>{t("public.guestChat.dockItemsStateUnknown")}</div>
        )}
      </div>
    </div>
  );
}

export function GuestDockItemsShelf({
  items,
  businessName,
  locale,
  t,
  C,
  accent,
  header,
}: {
  items: GuestConversationItems | null;
  businessName: string;
  locale: string;
  t: Translator;
  C: Palette;
  accent: string;
  /** The shelf header, rendered by the parent so every shelf reads alike. */
  header: (label: string, count: number) => React.ReactNode;
}) {
  if (!items || (items.lines.length === 0 && items.records.length === 0)) return null;
  const count = items.lines.length + items.records.length;
  return (
    <div data-guest-dock-items-shelf>
      {header(t("public.guestChat.dockItemsShelf"), count)}
      {items.records.map((chip) => (
        <RecordRow key={`${chip.kind}:${chip.recordId}`} chip={chip} t={t} C={C} accent={accent} locale={locale} />
      ))}
      {items.lines.map((line) => (
        <LineRow key={line.id} line={line} currency={items.currency} businessName={businessName} t={t} C={C} accent={accent} />
      ))}
      <div style={{ padding: "2px 14px 8px", fontSize: 11, color: C.inkDim, fontFamily: FONT }}>
        {interpolate(t("public.guestChat.dockItemsFootnote"), { business: businessName })}
      </div>
    </div>
  );
}
