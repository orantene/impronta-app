import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { CARD_KINDS, type CardKind, type ThreadMessage } from "@/lib/messaging/types";

import { ESSENTIALS, inboxRow, STATE_NEEDS } from "../kit/test-fixtures";
import { Thread, ThreadEmpty } from "./Thread";
import { ThreadCard } from "./ThreadCards";
import { BUBBLE_KINDS } from "./thread-stream";
import { EN_SCREEN } from "./test-screen-copy";

function msg(id: string, at: string, over: Partial<ThreadMessage> = {}): ThreadMessage {
  return { id, inquiryId: "inq-1", kind: "text", body: `body ${id}`, payload: null, senderUserId: null, guestSessionId: "g-1", createdAt: at, editedAt: null, deletedAt: null, thread: "private", internal: false, delivery: null, ...over };
}

const noop = () => {};
const composer = {
  inquiryId: "inq-1",
  version: 4,
  channel: "web_chat" as const,
  resolved: false,
  whatsappConnected: false,
  draft: "",
  onDraftChange: noop,
  onWrote: noop,
  onConflict: async () => null,
  onReopened: noop,
  onTray: noop,
  onComing: noop,
  actions: { reply: async () => ({ ok: true as const }), note: async () => ({ ok: true as const }), reopen: async () => ({ ok: true as const }), upload: async () => ({ ok: true as const }) },
};

function render(over: Partial<Parameters<typeof Thread>[0]> = {}) {
  return renderToStaticMarkup(
    <Thread
      row={inboxRow()}
      essentials={ESSENTIALS}
      messages={[msg("a", "2026-09-17T10:00:00Z"), msg("b", "2026-09-17T10:01:00Z"), msg("s", "2026-09-17T10:05:00Z", { senderUserId: "u-sofia", guestSessionId: null, delivery: { channel: "web_chat", state: "sent" } }), msg("c", "2026-09-17T10:20:00Z"), msg("d", "2026-09-17T10:21:00Z")]}
      error={null}
      state={STATE_NEEDS}
      chips={ESSENTIALS.linked}
      tasks={[{ key: "reply", title: "Reply to the client", why: "The client is waiting on a reply.", primary: true }, { key: "await_offer", title: "Follow up on the offer", why: "", primary: false }]}
      currentUserId="u-sofia"
      copy={EN_SCREEN}
      variant="desktop"
      now={new Date("2026-09-17T12:00:00Z")}
      onAction={noop}
      onCopyText={noop}
      onRetryLoad={noop}
      onMoreTasks={noop}
      menuOpen={false}
      onMenu={noop}
      menuItems={[{ id: "rename", label: "Rename", icon: "note" }]}
      composer={composer}
      {...over}
    />,
  );
}

test("desktop thread: header, grouped bubbles, unread divider before the last 2 client messages, next step bar above the composer", () => {
  const html = render();
  assert.match(html, /data-thread-header="desktop"/);
  assert.match(html, /data-message="a" data-position="first"/);
  assert.match(html, /data-message="b" data-position="last"/);
  assert.match(html, /data-message="s" data-position="single"/);
  assert.match(html, /data-message="c" data-position="first"/);
  assert.match(html, /data-message="d" data-position="last"/);
  const unreadAt = html.indexOf("data-unread-divider");
  assert.ok(unreadAt > 0 && unreadAt < html.indexOf('data-message="c"') && unreadAt > html.indexOf('data-message="s"'), "divider sits before c");
  assert.match(html, /2 new/);
  assert.match(html, /data-day-separator[^>]*>Today</);
  assert.match(html, /Valentina Ruiz · /);
  assert.match(html, /You · /);
  assert.match(html, /class="msg me single"/);
  assert.match(html, /data-next-step[^>]*>[\s\S]*Reply to the client/);
  assert.match(html, /data-next-step-action[^>]*>Reply</);
  assert.match(html, /\+ 1 other tasks|1 other task/);
  assert.match(html, /data-composer="idle"/);
  assert.doesNotMatch(html, /style="/);
  assert.doesNotMatch(html, /dashboard\.messagesV5\./);
  assert.doesNotMatch(html, /—/);
  assert.doesNotMatch(html, /customer/i);
});

test("mobile thread: mobile header, essentials strip with Details, next step block, mobile composer", () => {
  const html = render({ variant: "mobile", detailsAction: { label: "Details", onClick: noop } });
  assert.match(html, /data-thread-header="mobile"/);
  assert.match(html, /data-essentials-strip/);
  assert.match(html, /class="mx-next"/);
  assert.match(html, /class="mx-cmp"/);
  assert.match(html, /class="mx-msg first"/);
});

test("loading, failed and empty states", () => {
  const loading = render({ messages: null });
  assert.match(loading, /aria-busy="true"/);
  assert.match(loading, /thread-loading/);
  const failed = render({ messages: [], error: "unavailable" });
  assert.match(failed, /data-refusal="unavailable"/);
  assert.match(failed, />Try again</);
  const empty = renderToStaticMarkup(<ThreadEmpty copy={EN_SCREEN} variant="desktop" />);
  assert.match(empty, /Pick a conversation/);
});

test("resolved thread locks the composer; the menu draws its rows", () => {
  const html = render({ row: inboxRow({ conversationState: "resolved" }), state: { ...STATE_NEEDS, conversation: "resolved" }, composer: { ...composer, resolved: true }, menuOpen: true });
  assert.match(html, /data-composer="resolved"/);
  assert.match(html, /data-thread-reopen/);
  assert.match(html, /data-thread-menu/);
  assert.match(html, /data-menu-item="rename"/);
});

const PAYLOAD: Partial<Record<CardKind, Record<string, unknown>>> = {
  menu_options: { labels: ["Margherita"], pricesCents: [18000], currency: "USD", offeringIds: ["o"] },
  basket: { orderId: "or-1", version: 2, currency: "USD", lines: [{ label: "Pepperoni L", units: 2, unitCents: 1950 }], promisedAt: "2026-09-17T19:40:00Z" },
  professional_times: { slots: [{ startsAt: "2026-09-20T10:00:00Z", professionalName: "Dani" }], timezone: "UTC", state: "selected" },
  offer_review: { offerId: "iq-1", version: 2, totalCents: 380000, currency: "USD", validUntil: "2026-08-01T00:00:00Z", state: "viewed" },
  offer_state: { offerId: "iq-1", version: 2, offerStatus: "accepted" },
  payment_request: { paymentLinkCode: "abc", amountCents: 114000, currency: "USD", amountKind: "deposit", expiresAt: "2026-09-19T00:00:00Z", reservationId: null, state: "sent" },
  order_confirmation: { orderId: "or-1", version: 3, currency: "USD", lines: [{ label: "Pepperoni L", units: 1, unitCents: 1950 }], state: "paid" },
  appointment_confirmation: { recordKind: "appointment", recordId: "ap-1", when: "2026-09-20T10:00:00Z" },
  change_request: { recordKind: "appointment", recordId: "ap-1", requestedAt: "2026-09-17T10:00:00Z", hoursBefore: 48, freeUntil: null, oldWhen: "2026-09-20T10:00:00Z", newWhen: "2026-09-21T10:00:00Z" },
  change_result: { recordKind: "appointment", recordId: "ap-1", requestedAt: "2026-09-17T10:00:00Z", hoursBefore: 48, freeUntil: null, oldWhen: null, newWhen: null, state: "cancelled" },
  tickets_card: { eventId: "ev-1", title: "Friday night", tiers: [{ id: "t1", label: "General", priceCents: 5000 }], currency: "USD" },
};

const EXPECTED_CARD: Record<string, string> = {
  offer_review: "offer",
  offer_state: "offer",
  payment_request: "payment",
  basket: "order",
  order_confirmation: "order",
  professional_times: "times",
  appointment_confirmation: "appointment",
  change_request: "change",
  change_result: "change",
  // L11 (D-MSG-156/158): tickets_card always renders TicketsCard; service_card
  // only becomes TableCard with `payload.variant === "table"` (unset here,
  // so it still falls through to the generic card under its own kind name).
  tickets_card: "tickets",
};

test("every engine CardKind renders as a kit card (typed cards by kind, the rest through the generic Card), and an unknown kind falls back too", () => {
  for (const kind of CARD_KINDS) {
    if (BUBBLE_KINDS.has(kind)) continue;
    const html = renderToStaticMarkup(<ThreadCard message={msg(`k-${kind}`, "2026-09-17T10:00:00Z", { kind, payload: PAYLOAD[kind] ?? { state: "sent" }, senderUserId: "u-sofia" })} cardKind={kind} clientName="Valentina" copy={EN_SCREEN} variant="desktop" onAction={noop} onCopyText={noop} />);
    const expected = EXPECTED_CARD[kind] ?? kind;
    assert.match(html, new RegExp(`data-card="${expected}"`), `${kind} → ${expected}`);
    assert.doesNotMatch(html, /style="/);
    assert.doesNotMatch(html, /dashboard\.messagesV5\./);
  }
  const accepted = renderToStaticMarkup(<ThreadCard message={msg("o", "2026-09-17T10:00:00Z", { kind: "offer_state", payload: PAYLOAD.offer_state })} cardKind="offer_state" clientName="Valentina" copy={EN_SCREEN} variant="desktop" onAction={noop} onCopyText={noop} />);
  assert.match(accepted, /data-offer-action="request_deposit"/);
  const pay = renderToStaticMarkup(<ThreadCard message={msg("p", "2026-09-17T10:00:00Z", { kind: "payment_request", payload: PAYLOAD.payment_request })} cardKind="payment_request" clientName="Valentina" copy={EN_SCREEN} variant="desktop" onAction={noop} onCopyText={noop} />);
  assert.match(pay, /\$1,140/);
  assert.match(pay, /data-payment-action="copy_link"/);
  const basket = renderToStaticMarkup(<ThreadCard message={msg("b", "2026-09-17T10:00:00Z", { kind: "basket", payload: PAYLOAD.basket })} cardKind="basket" clientName="Valentina" copy={EN_SCREEN} variant="mobile" onAction={noop} onCopyText={noop} />);
  assert.match(basket, /\$39\.00/);
  assert.match(basket, /data-order-action="confirm"/);
});
