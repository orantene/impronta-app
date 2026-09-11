"use client";

import type { ReactNode } from "react";

import { renderCard } from "@/lib/messaging/cards";
import {
  fixtureEssentials,
  fixtureInbox,
  fixtureThread,
  type MessagingPreview,
  type MessagingSheetName,
} from "@/lib/messaging/fixture";
import type { CardKind } from "@/lib/messaging/types";

import { CheckoutView } from "@/app/(public)/pay/[code]/CheckoutView";
import { CustomerThread } from "@/app/(public)/c/t/[token]/CustomerThread";

import { MessagesShell } from "../MessagesShell";

const TABLET = { width: 1194, height: 834 };
const PORTRAIT = { width: 834, height: 1194 };
const PHONE = { width: 390, height: 844 };

export function BoardPreview(props: { readonly board: string }) {
  const board = props.board.toUpperCase();
  const preview = previewFor(board);
  const size = sizeFor(board);

  if (preview.checkoutStatus) {
    return (
      <Frame width={PHONE.width} height={PHONE.height} board={board}>
        <CheckoutView
          code="pay-fixture"
          amountCents={60000}
          currency="MXN"
          expiresAt="19:15"
          status={preview.checkoutStatus}
          lines={[
            { label: "Margherita", units: 2, unitCents: 18000 },
            { label: "Diavola", units: 1, unitCents: 21000 },
          ]}
          holdUntil="19:40"
          stripeUrl={null}
          threadHref="/c/t/preview"
          receiptHref="/r/fixture"
        />
      </Frame>
    );
  }

  if (preview.customerView) {
    const messages = fixtureThread(preview.activeId ?? "inq-visitor").map((message) => ({
      ...message,
      render: renderCard(message.kind as CardKind, message.payload, "customer"),
    }));
    return (
      <Frame width={PHONE.width} height={PHONE.height} board={board}>
        <CustomerThread
          token="preview"
          messages={messages}
          smsOnly={board === "MC12"}
          talentView={board === "MC14"}
        />
      </Frame>
    );
  }

  return (
    <Frame width={size.width} height={size.height} board={board}>
      <MessagesShell
        mode="counter"
        locationSlug="default"
        tenantId="33333333-3333-4333-8333-333333333333"
        adminBasePath="/admin"
        compact={preview.compact}
        preview={preview}
      />
    </Frame>
  );
}

function Frame(props: { width: number; height: number; board: string; children: ReactNode }) {
  const sizeClass =
    props.width === 1194 ? "h-[834px] w-[1194px]" : props.height === 1194 ? "h-[1194px] w-[834px]" : "h-[844px] w-[390px]";
  return (
    <div data-board={props.board} data-fixture="mock" className={`overflow-hidden bg-admin-surface text-admin-ink ${sizeClass}`}>
      {props.children}
    </div>
  );
}

function sizeFor(board: string) {
  if (board === "MS31") return PORTRAIT;
  if (board.startsWith("MC") || board.startsWith("MM") || board === "CC01") return PHONE;
  return TABLET;
}

function previewFor(board: string): MessagingPreview {
  const rows = fixtureInbox();
  const activeId = board === "MS16" || board === "MS12" || board === "MS13" ? "inq-laura-o" : board.startsWith("MS09") || board === "MS10" || board === "MS14" || board === "MS15" || board === "MS17" ? "inq-laura-m" : "inq-visitor";
  const base: MessagingPreview = {
    board,
    rows,
    activeId,
    messages: fixtureThread(activeId),
    essentials: fixtureEssentials(activeId),
    loadState: "ok",
    focused: false,
    sheet: null,
    toast: false,
    search: "",
    compact: board.startsWith("MM"),
    portrait: board === "MS31",
    customerView: board.startsWith("MC") && !board.startsWith("MC15") && Number(board.slice(2, 4)) < 15,
    checkoutStatus: null,
  };

  const sheets: Record<string, MessagingSheetName> = {
    MS04: "capture",
    MS05: "match",
    MS05B: "match",
    MS06: "assign",
    MS07: "options",
    MS08: "options",
    MS09: "options",
    MS10: "options",
    MS11: "link",
    MS12: "offer",
    MS13: "offer",
    MS14: "payment",
    MS15: "payment",
    MS16: "follow",
    MS17: "change",
    MS18: "diff",
    MS19: "recover",
    MS19B: "recover",
    MS20: "diff",
    MS21: "start",
    MS22: "note",
    MS23: "delivery",
    MS24: "resolve",
    MS25: "search",
    MS26: "reminder",
    MS30: "agency",
    MM02B: "actions",
    MM03: "payment",
    MM05: "recover",
  };

  if (board === "MS01") return { ...base, toast: true, activeId: "inq-visitor" };
  if (board === "MS02B") return { ...base, focused: true };
  if (board === "MS03") return { ...base, rows: [], loadState: "empty", activeId: null, messages: [], essentials: null };
  if (board === "MS31") return { ...base, portrait: true, toast: true };
  if (board === "MM01") return { ...base, compact: true, activeId: null };
  if (board === "MM06") return { ...base, compact: true, activeId: null, toast: true };
  if (board === "MC15" || board === "CC01") return { ...base, customerView: false, checkoutStatus: "open" };
  if (board === "MC16") return { ...base, customerView: false, checkoutStatus: "processing" };
  if (board === "MC17") return { ...base, customerView: false, checkoutStatus: "paid" };
  if (board === "MC18") return { ...base, customerView: false, checkoutStatus: "expired" };
  if (board === "MC19") return { ...base, customerView: false, checkoutStatus: "unknown" };
  if (board === "MC20") return { ...base, customerView: true };
  if (sheets[board]) return { ...base, sheet: sheets[board] };
  if (board.startsWith("MC")) return { ...base, customerView: true };
  return base;
}
