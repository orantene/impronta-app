import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import type { ConfirmConflict } from "@/lib/messaging/confirm-plan";
import type { ConfirmSourceOption, DepositGate } from "@/lib/messages-v5/confirm-view";

import { EN_COPY } from "../../kit/test-copy";
import { ConfirmRecordView, type ConfirmRecordPhase } from "./ConfirmRecord";

const noop = () => {};

const OFFER_OPTION: ConfirmSourceOption = { source: "offer", id: "of-1", label: "v2", version: 2, totalCents: 380000, paymentState: "unpaid" };
const DRAFT_OPTION: ConfirmSourceOption = { source: "draft", id: "or-9", label: "#1203 · $48.50", version: null, totalCents: null, paymentState: null };

const NO_GATE: DepositGate = { due: false, paid: false, needsOverride: false };
const GATE_BLOCKED: DepositGate = { due: true, paid: false, needsOverride: true };

function baseProps(over: Partial<Parameters<typeof ConfirmRecordView>[0]> = {}) {
  return {
    open: true,
    onClose: noop,
    copy: EN_COPY,
    variant: "desktop" as const,
    loadingOptions: false,
    options: [OFFER_OPTION, DRAFT_OPTION],
    selected: OFFER_OPTION,
    onSelect: noop,
    deposit: NO_GATE,
    overrideReason: "",
    onOverrideChange: noop,
    phase: "idle" as ConfirmRecordPhase,
    conflicts: [] as readonly ConfirmConflict[],
    refusal: null,
    doneText: null,
    onConfirm: noop,
    onSeeAlternatives: noop,
    onOpenRecord: noop,
    onCaptureIdentity: noop,
    ...over,
  };
}

test("closed renders nothing", () => {
  assert.equal(renderToStaticMarkup(<ConfirmRecordView {...baseProps({ open: false })} />), "");
});

test("idle, no deposit due: both sources, checked and created lists, primary enabled", () => {
  const html = renderToStaticMarkup(<ConfirmRecordView {...baseProps()} />);
  assert.match(html, /data-confirm-sources/);
  assert.match(html, /Offer v2/);
  assert.match(html, /Shared draft/);
  assert.match(html, /data-confirm-checked-row="people"/);
  assert.match(html, /data-confirm-checked-row="resources"/);
  assert.match(html, /Will be checked on confirm/);
  assert.match(html, /data-confirm-created-row="project"/);
  assert.match(html, /data-confirm-created-row="calendar_blocks"/);
  assert.match(html, /Availability is checked again on click/);
  assert.doesNotMatch(html, /disabled=""[^>]*data-confirm-primary/);
  assert.match(html, /data-confirm-primary[^>]*>Confirm booking/);
  assert.doesNotMatch(html, /style=/);
});

test("deposit due and unpaid: primary disabled, the sentence, and an override field", () => {
  const html = renderToStaticMarkup(<ConfirmRecordView {...baseProps({ deposit: GATE_BLOCKED })} />);
  assert.match(html, /A deposit is due before this can be confirmed\./);
  assert.match(html, /data-confirm-override-input/);
  assert.match(html, /disabled=""[^>]*data-confirm-primary/);
});

test("deposit due, override reason typed (8+ chars): primary is enabled", () => {
  const html = renderToStaticMarkup(<ConfirmRecordView {...baseProps({ deposit: GATE_BLOCKED, overrideReason: "client asked to lock the date now" })} />);
  assert.doesNotMatch(html, /disabled=""[^>]*data-confirm-primary/);
});

test("busy: Confirming, rechecking availability, primary busy and disabled", () => {
  const html = renderToStaticMarkup(<ConfirmRecordView {...baseProps({ phase: "busy" })} />);
  assert.match(html, /Confirming… rechecking availability/);
  assert.match(html, /aria-busy="true"[^>]*data-confirm-primary/);
});

test("unavailable: every conflict as its own sentence, See alternatives, nothing created", () => {
  const conflicts: ConfirmConflict[] = [
    { line: "Ana", why: "Ana is no longer free on 2026-09-20", at: "2026-09-20T18:00:00Z", code: "person_busy" },
    { line: "Room A", why: "Room A is no longer free on 2026-09-20", at: null, code: "capacity_short" },
  ];
  const html = renderToStaticMarkup(<ConfirmRecordView {...baseProps({ phase: "conflict", conflicts })} />);
  assert.match(html, /Ana is no longer free on 2026-09-20/);
  assert.match(html, /Room A is no longer free on 2026-09-20/);
  assert.match(html, /Nothing was created\./);
  assert.match(html, /See alternatives/);
  assert.doesNotMatch(html, /data-confirm-primary/, "the primary button is not shown once nothing was created");
});

test("already: OkLine plus Open record, no primary button", () => {
  const html = renderToStaticMarkup(<ConfirmRecordView {...baseProps({ phase: "already" })} />);
  assert.match(html, /data-ok-line/);
  assert.match(html, /Already confirmed/);
  assert.match(html, /data-confirm-open-record/);
  assert.doesNotMatch(html, /data-confirm-primary/);
});

test("done: the confirmed sentence, no primary button", () => {
  const html = renderToStaticMarkup(<ConfirmRecordView {...baseProps({ phase: "done", doneText: EN_COPY.confirm.doneBooking })} />);
  assert.match(html, /data-ok-line/);
  assert.match(html, /Booking confirmed/);
  assert.doesNotMatch(html, /data-confirm-primary/);
});

test("a refusal other than unavailable/already renders the catalogue sentence", () => {
  const html = renderToStaticMarkup(<ConfirmRecordView {...baseProps({ refusal: "identity_unconfirmed" })} />);
  assert.match(html, /data-refusal="identity_unconfirmed"/);
  assert.match(html, /Client identity is not confirmed\./);
});

test("draft source: title and primary say order, not booking", () => {
  const html = renderToStaticMarkup(<ConfirmRecordView {...baseProps({ selected: DRAFT_OPTION })} />);
  assert.match(html, /Confirm order/);
  assert.match(html, /data-confirm-created-row="kitchen_ticket"/);
  assert.doesNotMatch(html, /data-confirm-created-row="assignments"/);
});

test("mobile variant renders as a full-screen sheet", () => {
  const html = renderToStaticMarkup(<ConfirmRecordView {...baseProps({ variant: "mobile" })} />);
  assert.match(html, /data-sheet="full"/);
});

test("loading: a skeleton in place of the source list", () => {
  const html = renderToStaticMarkup(<ConfirmRecordView {...baseProps({ loadingOptions: true, options: [], selected: null })} />);
  assert.match(html, /data-skeleton/);
  assert.doesNotMatch(html, /data-confirm-sources/);
});

test("no candidates: the empty sentence, not a blank list", () => {
  const html = renderToStaticMarkup(<ConfirmRecordView {...baseProps({ options: [], selected: null })} />);
  assert.match(html, /data-confirm-empty/);
  assert.match(html, /Nothing to confirm yet\./);
});
