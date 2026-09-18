import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { EN_COPY } from "../../kit/test-copy";
import type { PaymentTargetChip, RefundChoice } from "@/lib/messages-v5/payment-view";

import { CancelRefundView, type CancelRefundViewProps } from "./CancelRefund.view";

const noop = () => {};

const TARGETS: PaymentTargetChip[] = [{ kind: "order", recordId: "or-1203", label: "#1203 · $48.50" }];
const CANCEL_CHOICES: readonly RefundChoice[] = [
  { mode: "full", enabled: true, maxCents: 4850 },
  { mode: "partial", enabled: true, maxCents: 4850 },
  { mode: "keep", enabled: true, maxCents: 0 },
];
const REFUND_ONLY_CHOICES: readonly RefundChoice[] = [
  { mode: "full", enabled: true, maxCents: 4850 },
  { mode: "partial", enabled: true, maxCents: 4850 },
];

function baseProps(over: Partial<CancelRefundViewProps> = {}): CancelRefundViewProps {
  return {
    open: true,
    onClose: noop,
    copy: EN_COPY,
    variant: "desktop",
    mode: "cancel",
    targets: TARGETS,
    selectedTargetId: "or-1203",
    onSelectTarget: noop,
    windowLabel: null,
    freesCount: 0,
    refundChoices: CANCEL_CHOICES,
    refundMode: "full",
    onSelectRefundMode: noop,
    partialAmountInput: "",
    onPartialAmountChange: noop,
    reason: "",
    onReasonChange: noop,
    effectAmountCents: 4850,
    phase: "idle",
    refusalCode: null,
    canSubmit: true,
    onSubmit: noop,
    ...over,
  };
}

test("closed renders nothing", () => {
  const html = renderToStaticMarkup(<CancelRefundView {...baseProps({ open: false })} />);
  assert.equal(html, "");
});

test("loading: the preview sentence, no form, no footer button", () => {
  const html = renderToStaticMarkup(<CancelRefundView {...baseProps({ phase: "loading" })} />);
  assert.match(html, /data-cancel-loading/);
  assert.doesNotMatch(html, /data-cancel-submit/);
});

test("idle (cancel mode): refund choices, reason field, effects, solid red footer", () => {
  const html = renderToStaticMarkup(<CancelRefundView {...baseProps({ freesCount: 2 })} />);
  assert.match(html, /data-cancel-refund-choice/);
  assert.match(html, /Full refund/);
  assert.match(html, /Keep the payment/);
  assert.match(html, /data-cancel-reason/);
  assert.match(html, /The client sees this reason/);
  assert.match(html, /data-cancel-frees/);
  assert.match(html, /Cancel and refund \$48\.5/);
  assert.match(html, /btn danger/);
  assert.doesNotMatch(html, /style=/);
});

test("partial refund mode shows the amount field, capped by maxCents", () => {
  const html = renderToStaticMarkup(<CancelRefundView {...baseProps({ refundMode: "partial", effectAmountCents: 1000 })} />);
  assert.match(html, /data-cancel-partial/);
  assert.match(html, /Amount to refund/);
});

test("keep mode: footer reads plain Cancel, effects show 'nothing refunded'", () => {
  const html = renderToStaticMarkup(<CancelRefundView {...baseProps({ refundMode: "keep", effectAmountCents: 0 })} />);
  assert.match(html, /data-cancel-submit="true">Cancel</);
  assert.match(html, /nothing refunded/);
});

test("busy: working label, submit disabled", () => {
  const html = renderToStaticMarkup(<CancelRefundView {...baseProps({ phase: "working" })} />);
  assert.match(html, /Working/);
  assert.match(html, /disabled=""/);
});

test("done: OkLine, no form", () => {
  const html = renderToStaticMarkup(<CancelRefundView {...baseProps({ phase: "done" })} />);
  assert.match(html, /data-ok-line/);
  assert.match(html, /Cancelled/);
  assert.doesNotMatch(html, /data-cancel-refund-choice/);
});

test("refund-only mode: no cancel window/frees, footer reads Refund $X, no 'keep' choice", () => {
  const html = renderToStaticMarkup(
    <CancelRefundView {...baseProps({ mode: "refundOnly", refundChoices: REFUND_ONLY_CHOICES, freesCount: 3 })} />,
  );
  assert.doesNotMatch(html, /Keep the payment/);
  assert.doesNotMatch(html, /data-cancel-frees/);
  assert.match(html, /Refund \$48\.5/);
});

test("a refusal after a failed submit draws the sentence, not free text", () => {
  const html = renderToStaticMarkup(<CancelRefundView {...baseProps({ refusalCode: "not_allowed" })} />);
  assert.match(html, /data-refusal="not_allowed"/);
});
