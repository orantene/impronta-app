import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { EN_COPY } from "../../kit/test-copy";
import { amountOptions, type AmountOption, type PaymentTargetChip } from "@/lib/messages-v5/payment-view";

import { PaymentRequestView, type PaymentRequestViewProps } from "./PaymentRequest.view";

const noop = () => {};

const TARGETS: PaymentTargetChip[] = [{ kind: "order", recordId: "or-1203", label: "#1203 · $48.50" }];
const OFFER = { status: "accepted", depositPct: 30, depositAmountCents: null, totalClientPrice: 1000 };
const OPTIONS: readonly AmountOption[] = amountOptions(OFFER);

function baseProps(over: Partial<PaymentRequestViewProps> = {}): PaymentRequestViewProps {
  return {
    open: true,
    onClose: noop,
    copy: EN_COPY,
    variant: "desktop",
    identityConfirmed: true,
    onCaptureIdentity: noop,
    targets: TARGETS,
    selectedTargetId: "or-1203",
    onSelectTarget: noop,
    canMintLink: true,
    amountOptions: OPTIONS,
    amountKind: "deposit",
    onSelectAmountKind: noop,
    otherAmountInput: "",
    onOtherAmountChange: noop,
    how: "link",
    onSelectHow: noop,
    outsideMethod: "cash",
    onOutsideMethodChange: noop,
    reference: "",
    onReferenceChange: noop,
    openRequestBlocking: false,
    collectHref: "/impronta/admin/pos?view=sell&order=or-1203",
    phase: "idle",
    refusalCode: null,
    canSend: true,
    onSend: noop,
    ...over,
  };
}

test("closed renders nothing", () => {
  const html = renderToStaticMarkup(<PaymentRequestView {...baseProps({ open: false })} />);
  assert.equal(html, "");
});

test("identity unconfirmed: gate blocks the form, offers Capture identity", () => {
  const html = renderToStaticMarkup(<PaymentRequestView {...baseProps({ identityConfirmed: false })} />);
  assert.match(html, /data-refusal="identity_unconfirmed"/);
  assert.doesNotMatch(html, /data-payment-amount/);
  assert.match(html, /Capture identity/);
});

test("ready: amount ladder (deposit shown), how options, message preview", () => {
  const html = renderToStaticMarkup(<PaymentRequestView {...baseProps()} />);
  assert.match(html, /data-payment-amount/);
  assert.match(html, /Deposit 30%/);
  assert.match(html, /data-payment-how/);
  assert.match(html, /Send a pay link/);
  assert.match(html, /data-payment-message/);
  assert.match(html, /data-payment-send/);
  assert.doesNotMatch(html, /style=/);
});

test("open request blocks Send with the footer hint", () => {
  const html = renderToStaticMarkup(<PaymentRequestView {...baseProps({ openRequestBlocking: true, canSend: false })} />);
  assert.match(html, /One open request at a time/);
  assert.match(html, /disabled=""/);
});

test("busy: minting shows the busy label and disables Send", () => {
  const html = renderToStaticMarkup(<PaymentRequestView {...baseProps({ phase: "sending" })} />);
  assert.match(html, /Sending/);
});

test("sent: OkLine, no form", () => {
  const html = renderToStaticMarkup(<PaymentRequestView {...baseProps({ phase: "sent" })} />);
  assert.match(html, /data-ok-line/);
  assert.match(html, /Request sent/);
  assert.doesNotMatch(html, /data-payment-amount/);
});

test("outside how: not tied to canMintLink, shows method and reference fields", () => {
  const html = renderToStaticMarkup(<PaymentRequestView {...baseProps({ how: "outside", canMintLink: false })} />);
  assert.match(html, /data-payment-outside/);
  assert.match(html, /Cash/);
  assert.match(html, /Needs an order on this thread/);
});
