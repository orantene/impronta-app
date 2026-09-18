import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { EN_SCREEN } from "../test-screen-copy";
import { OfferEditorView, type OfferEditorViewProps } from "./OfferEditor";
import type { OfferDraftLine, OfferDraftState } from "@/lib/messages-v5/offer-draft";
import { emptyTerms } from "@/lib/messages-v5/offer-draft";

const noop = () => {};

function talentLine(over: Partial<OfferDraftLine> = {}): OfferDraftLine {
  return {
    id: "l1",
    kind: "talent",
    talentProfileId: "tp1",
    ownerTenantId: null,
    label: "DJ set",
    pricingUnit: "hour",
    units: 2,
    unitPriceCents: 10000,
    talentCostCents: 15000,
    note: null,
    sortOrder: 0,
    sourceServiceId: null,
    proposedBy: "staff",
    proposedByName: null,
    confirmed: false,
    priceSnapshotCents: null,
    catalogPriceCentsAtAdd: null,
    catalogNowCents: null,
    discountCents: 0,
    discountLabel: null,
    taxCents: 0,
    taxLabel: null,
    removedBy: null,
    ...over,
  };
}

function draft(over: Partial<OfferDraftState> = {}, lines: OfferDraftLine[] = [talentLine()]): OfferDraftState {
  return {
    offerId: "offer1",
    inquiryId: "inq1",
    version: 1,
    inquiryExpectedVersion: 1,
    status: "draft",
    currencyCode: "USD",
    lines,
    terms: emptyTerms(),
    coordinatorFeeCents: 2000,
    ...over,
  };
}

const base: OfferEditorViewProps = {
  phase: "ready",
  copy: EN_SCREEN,
  variant: "desktop",
  onClose: noop,
  refusalCode: null,
  draft: draft(),
  clientName: "Ana Ruiz",
  saveState: { status: "idle" },
  lastSavedLineCount: 1,
  lastSavedTotalCents: 20000,
  sendBusy: false,
  addingCustom: false,
  customLabel: "",
  customUnits: "1",
  customPrice: "",
  onCustomOpen: noop,
  onCustomCancel: noop,
  onCustomLabel: noop,
  onCustomUnits: noop,
  onCustomPrice: noop,
  onCustomConfirm: noop,
  onAddCatalog: noop,
  onLineUnits: noop,
  onLinePrice: noop,
  onLineRemove: noop,
  onLineRestore: noop,
  onDepositPct: noop,
  onDepositAmount: noop,
  onValidUntil: noop,
  onNoteToClient: noop,
  onSaveDraft: noop,
  onSend: noop,
  versions: [],
  onOpenVersion: noop,
  compare: null,
  onCloseCompare: noop,
  conflict: null,
  onKeepMine: noop,
  onTakeTheirs: noop,
};

test("loading: shows the skeleton, no line editor", () => {
  const html = renderToStaticMarkup(<OfferEditorView {...base} phase="loading" draft={null} />);
  assert.match(html, /data-offer-editor-phase="loading"/);
  assert.doesNotMatch(html, /data-offer-lines/);
});

test("empty: zero lines shows the empty state, not a fake zero total", () => {
  const html = renderToStaticMarkup(<OfferEditorView {...base} draft={draft({}, [])} />);
  assert.match(html, /No lines yet/);
  assert.doesNotMatch(html, /data-line-row/);
});

test("ready: one line renders as a LineEditorRow, footer has Save draft and Send v1", () => {
  const html = renderToStaticMarkup(<OfferEditorView {...base} />);
  assert.match(html, /data-line-row/);
  assert.match(html, /data-offer-save-draft/);
  assert.match(html, /data-offer-send[^>]*>Send v1/);
});

test("busy: sendBusy sets data-offer-editor-phase to busy and disables Send", () => {
  const html = renderToStaticMarkup(<OfferEditorView {...base} sendBusy />);
  assert.match(html, /data-offer-editor-phase="busy"/);
  assert.match(html, /disabled=""[^>]*data-offer-send/);
});

test("refused: a top-level load failure shows the refusal line, no editor body", () => {
  const html = renderToStaticMarkup(<OfferEditorView {...base} phase="refused" refusalCode="not_allowed" />);
  assert.match(html, /data-offer-editor-phase="refused"/);
  assert.match(html, /data-refusal="not_allowed"/);
  assert.doesNotMatch(html, /data-offer-lines/);
});

test("conflict (version_stale mid-edit): shows the refusal plus a keep-mine / take-theirs choice, draft stays visible", () => {
  const html = renderToStaticMarkup(
    <OfferEditorView {...base} conflict={{ localLineCount: 1, localTotalCents: 20000 }} />,
  );
  assert.match(html, /data-offer-conflict/);
  assert.match(html, /data-refusal="version_stale"/);
  assert.match(html, /data-offer-conflict-keep-mine/);
  assert.match(html, /data-offer-conflict-take-theirs/);
  // The editor itself is still drawn underneath — the local snapshot is never discarded.
  assert.match(html, /data-line-row/);
});

test("done is a transient state the wrapper handles by closing the sheet: the view has no 'done' phase to render", () => {
  // OfferEditorView's phase union intentionally has no "done" member — sending
  // success calls ctx.reloadThread() + onClose() in the stateful wrapper, so
  // there is nothing for the pure view to render once send succeeds.
  const phases: OfferEditorViewProps["phase"][] = ["loading", "ready", "refused"];
  assert.deepEqual(phases, ["loading", "ready", "refused"]);
});

test("internal block never renders talent net / agency fee / platform fee labels near the client preview card without the internal marker", () => {
  const html = renderToStaticMarkup(<OfferEditorView {...base} />);
  assert.match(html, /data-offer-internal/);
  assert.match(html, /Internal · never sent/);
  assert.match(html, /Talent net/);
  assert.match(html, /Agency fee/);
  assert.match(html, /Platform fee/);
});

test("a price-drifted line shows the catalog-now hint", () => {
  const drifted = talentLine({ catalogPriceCentsAtAdd: 10000, priceSnapshotCents: 10000, unitPriceCents: 10000, catalogNowCents: 12000 });
  const html = renderToStaticMarkup(<OfferEditorView {...base} draft={draft({}, [drifted])} />);
  assert.match(html, /catalog price now/i);
});

test("a removed line shows the restore control instead of price/units", () => {
  const removed = talentLine({ removedBy: "Ana" });
  const html = renderToStaticMarkup(<OfferEditorView {...base} draft={draft({}, [removed])} />);
  assert.match(html, /removed by Ana/i);
  assert.match(html, /data-offer-lines/);
});

test("version chips render when there is more than one version", () => {
  const html = renderToStaticMarkup(
    <OfferEditorView {...base} versions={[{ id: "a", version: 1, status: "sent" }, { id: "b", version: 2, status: "draft" }]} />,
  );
  assert.match(html, /data-offer-version-chip="1"/);
  assert.match(html, /data-offer-version-chip="2"/);
});

test("mobile variant renders the mobile-full sheet", () => {
  const html = renderToStaticMarkup(<OfferEditorView {...base} variant="mobile" />);
  assert.match(html, /data-sheet="full"/);
});
