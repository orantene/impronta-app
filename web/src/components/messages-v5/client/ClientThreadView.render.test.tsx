import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import type { ThreadMessage } from "@/lib/messaging/types";
import type { ClientOfferSummary } from "@/lib/messages-v5/client-thread-view";

import { ClientComposer, ClientRefusal, ClientThreadView, type ClientThreadViewProps } from "./ClientThreadView";
import { EN_CLIENT, EN_KIT, ES_CLIENT } from "./test-copy";

const now = new Date("2026-09-17T10:00:00.000Z");

function msg(over: Partial<ThreadMessage> & { id: string }): ThreadMessage {
  return { inquiryId: "inq", kind: "text", body: "hi", payload: null, senderUserId: null, guestSessionId: null, createdAt: "2026-09-17T09:00:00.000Z", editedAt: null, deletedAt: null, thread: "private", internal: false, delivery: null, ...over };
}

const offer: ClientOfferSummary = { id: "of1", version: 2, status: "sent", totalCents: 380000, currency: "USD", depositPct: 30, depositCents: null, refundPolicy: null, validUntil: null, noteToClient: null, lines: [] };

const base: ClientThreadViewProps = {
  copy: EN_CLIENT,
  kit: EN_KIT,
  locale: "en",
  business: { name: "Impronta Models", handlerFirstName: "Sofía" },
  messages: [
    msg({ id: "m1", senderUserId: "staff", body: "Congratulations! Sending you a proposal now." }),
    msg({ id: "m2", body: "Great, thank you.", createdAt: "2026-09-17T09:01:00.000Z" }),
    msg({ id: "n1", kind: "internal_note", internal: true, senderUserId: "staff", body: "SECRET NOTE", createdAt: "2026-09-17T09:02:00.000Z" }),
    msg({ id: "e1", kind: "offer_event", senderUserId: "staff", body: "Offer sent to client.", payload: { status: "sent", offer_id: "of1", total_label: "3800.00 USD" }, createdAt: "2026-09-17T09:03:00.000Z" }),
    msg({ id: "c1", kind: "menu_options", senderUserId: "staff", payload: { offeringIds: ["a"], labels: ["Taco"], pricesCents: [900] }, createdAt: "2026-09-17T09:04:00.000Z" }),
    msg({ id: "p1", kind: "payment_request", senderUserId: "staff", payload: { paymentLinkCode: "abc", amountCents: 114000, amountKind: "deposit", state: "sent" }, createdAt: "2026-09-17T09:05:00.000Z" }),
    msg({ id: "k1", kind: "appointment_confirmation", senderUserId: "staff", payload: { recordKind: "appointment", recordId: "r1", when: "2026-09-20T15:00:00.000Z", title: "Balayage" }, createdAt: "2026-09-17T09:06:00.000Z" }),
    msg({ id: "q1", kind: "change_request", body: "Start later", payload: { state: "sent" }, createdAt: "2026-09-17T09:07:00.000Z" }),
    msg({ id: "s1", kind: "offer_state", body: "Accepted offer v2", payload: { offerId: "of1", offerStatus: "accepted" }, createdAt: "2026-09-17T09:08:00.000Z" }),
  ],
  offers: [offer],
  payCode: null,
  now,
  composer: { value: "", phase: "idle" },
  onChoose: () => {},
  onPickTime: () => {},
  onAcceptOffer: () => {},
  onDeclineOffer: () => {},
  onChangeOffer: () => {},
  onChangeRecord: () => {},
  onPay: () => {},
  onSaveToEmail: null,
};

test("header: business name and the handler's first name; team fallback", () => {
  const html = renderToStaticMarkup(<ClientThreadView {...base} />);
  assert.match(html, /data-client-header/);
  assert.match(html, /<b>Impronta Models<\/b>/);
  assert.match(html, /Sofía is handling your request/);
  const team = renderToStaticMarkup(<ClientThreadView {...base} business={{ name: "El Paisa", handlerFirstName: null }} />);
  assert.match(team, /The team is handling your request/);
});

test("stream: staff bubble, client bubble as me, day separator, one card per kind, internal note never rendered, later offer rows read as one line", () => {
  const html = renderToStaticMarkup(<ClientThreadView {...base} />);
  assert.match(html, /mx-day/);
  assert.match(html, /Impronta Models · /);
  assert.match(html, /mx-msg me single/);
  assert.match(html, /You · /);
  assert.doesNotMatch(html, /SECRET NOTE/);
  assert.match(html, /data-card="client-offer"/);
  assert.match(html, /data-card="choices"/);
  assert.match(html, /data-card="client-pay"/);
  assert.match(html, /data-card="client-confirmed"/);
  assert.match(html, /data-card="client-change"/);
  assert.match(html, /data-system-line[^>]*>.*Accepted offer v2/);
  assert.equal((html.match(/data-card="client-offer"/g) ?? []).length, 1);
  assert.doesNotMatch(html, /net|commission|payout/i);
});

test("offer card actions read the live offer: sent shows Accept and pay deposit; accepted shows the pay button when a code exists", () => {
  const sent = renderToStaticMarkup(<ClientThreadView {...base} />);
  assert.match(sent, /data-client-action="accept_offer"[^>]*>Accept and pay deposit · \$1,140\.00/);
  const accepted = renderToStaticMarkup(<ClientThreadView {...base} offers={[{ ...offer, status: "accepted" }]} payCode="abc" />);
  assert.match(accepted, /Accepted\. Next: pay the deposit to confirm\./);
  assert.match(accepted, /data-client-action="pay"[^>]*>Pay \$1,140\.00/);
});

test("activity: a busy choice card, a refused offer card", () => {
  const html = renderToStaticMarkup(<ClientThreadView {...base} activity={{ c1: { phase: "busy" }, of1: { phase: "refused", refusal: "expired" } }} />);
  assert.match(html, /data-card="choices"[^>]*aria-busy="true"/);
  assert.match(html, /data-refusal="expired"/);
});

test("empty and loading states; ES locale", () => {
  const empty = renderToStaticMarkup(<ClientThreadView {...base} messages={[]} />);
  assert.match(empty, /data-client-empty/);
  assert.match(empty, /Nothing here yet/);
  assert.match(empty, /When Impronta Models writes to you, it shows up here\./);
  const loading = renderToStaticMarkup(<ClientThreadView {...base} messages={[]} loading />);
  assert.match(loading, /data-client-loading/);
  assert.match(loading, /Loading your conversation/);
  const es = renderToStaticMarkup(<ClientThreadView {...base} copy={ES_CLIENT} locale="es" messages={[]} />);
  assert.match(es, /Todavía no hay nada/);
  assert.match(es, /Sofía atiende tu solicitud/);
});

test("composer states: idle send off, typing send on, sending disabled, failed with retry, sent ok line; placeholder names the business", () => {
  const idle = renderToStaticMarkup(<ClientComposer copy={EN_CLIENT} business="Impronta" value="" phase="idle" />);
  assert.match(idle, /placeholder="Write to Impronta"/);
  assert.match(idle, /class="send off"[^>]*disabled/);
  const typing = renderToStaticMarkup(<ClientComposer copy={EN_CLIENT} business="Impronta" value="Hello" phase="idle" />);
  assert.match(typing, /class="send"/);
  assert.doesNotMatch(typing, /class="send"[^>]*disabled/);
  const sending = renderToStaticMarkup(<ClientComposer copy={EN_CLIENT} business="Impronta" value="Hello" phase="sending" />);
  assert.match(sending, /data-phase="sending"/);
  assert.match(sending, /<textarea[^>]*disabled/);
  assert.match(sending, /aria-busy="true"/);
  const failed = renderToStaticMarkup(<ClientComposer copy={EN_CLIENT} business="Impronta" value="Hello" phase="failed" onRetry={() => {}} />);
  assert.match(failed, /data-composer-failed/);
  assert.match(failed, /Your message did not send\./);
  assert.match(failed, />Try again</);
  const sent = renderToStaticMarkup(<ClientComposer copy={EN_CLIENT} business="Impronta" value="" phase="sent" />);
  assert.match(sent, /data-ok-line/);
  assert.match(sent, />Sent</);
});

test("footer: secure line and a greyed Save to email when no writer is reachable; enabled with a handler", () => {
  const greyed = renderToStaticMarkup(<ClientThreadView {...base} />);
  assert.match(greyed, /Secure link · valid for your booking/);
  assert.match(greyed, /data-client-action="save_to_email"/);
  assert.match(greyed, /<button[^>]*disabled[^>]*data-client-action="save_to_email"|<button[^>]*data-client-action="save_to_email"[^>]*disabled/);
  const live = renderToStaticMarkup(<ClientThreadView {...base} onSaveToEmail={() => {}} />);
  assert.doesNotMatch(live, /disabled=""[^>]*data-client-action="save_to_email"/);
});

test("footer: link-expiry sentence only on /c/t/[token] when threadTokenExpiresAt is passed", () => {
  const dock = renderToStaticMarkup(<ClientThreadView {...base} />);
  assert.doesNotMatch(dock, /data-client-link-expiry/);
  const link = renderToStaticMarkup(<ClientThreadView {...base} threadTokenExpiresAt="2026-10-18T00:00:00.000Z" />);
  assert.match(link, /data-client-link-expiry/);
  assert.match(link, /This link is valid until /);
});

test("whole-thread refusal (expired link) is one catalogue sentence", () => {
  const html = renderToStaticMarkup(<ClientRefusal code="expired" kit={EN_KIT} />);
  assert.match(html, /data-refusal="expired"/);
  assert.match(html, /This link or offer has expired\./);
});
