import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { CHIP_OFFER, ESSENTIALS, ESSENTIALS_VISITOR, STATE_NEEDS, TASKS } from "../kit/test-fixtures";
import { EN_COPY } from "../kit/test-copy";

import { ContextPanel } from "./ContextPanel";

const noop = () => {};

test("loading: SummaryBlock loading, no crash without essentials", () => {
  const html = renderToStaticMarkup(
    <ContextPanel essentials={null} state={STATE_NEEDS} chips={[]} tasks={[]} itemsLabel="Items" loading copy={EN_COPY} variant="desktop" onAction={noop} />,
  );
  assert.match(html, /aria-busy="true"/);
  assert.match(html, /data-context-panel/);
});

test("loaded: summary, Client section with contact fields, Items section labelled per business with Add item, Money empty state", () => {
  const html = renderToStaticMarkup(
    <ContextPanel
      essentials={ESSENTIALS}
      state={STATE_NEEDS}
      chips={[CHIP_OFFER]}
      tasks={TASKS}
      itemsLabel="Talent & services"
      loading={false}
      copy={EN_COPY}
      variant="desktop"
      onAction={noop}
    />,
  );
  assert.match(html, /<b>Valentina Ruiz<\/b>/);
  assert.match(html, /data-panel-section="Talent &amp; services"/);
  assert.match(html, /data-add-items/);
  assert.match(html, /\+ Add item/);
  assert.match(html, /data-panel-section="Money"/);
  assert.match(html, /No charges yet/);
  assert.match(html, /data-request-payment/);
  assert.doesNotMatch(html, /style=/);
});

test("visitor essentials: no identity, Client section still renders without crashing", () => {
  const html = renderToStaticMarkup(
    <ContextPanel essentials={ESSENTIALS_VISITOR} state={STATE_NEEDS} chips={[]} tasks={[]} itemsLabel="Items" loading={false} copy={EN_COPY} variant="desktop" onAction={noop} />,
  );
  assert.match(html, /data-panel-client/);
});

test("items list: renders a line row per item, and the drift flag when priceSnapshot is set", () => {
  const html = renderToStaticMarkup(
    <ContextPanel
      essentials={ESSENTIALS}
      state={STATE_NEEDS}
      chips={[]}
      tasks={[]}
      itemsLabel="Menu"
      loading={false}
      copy={EN_COPY}
      variant="desktop"
      onAction={noop}
      items={[{ id: "l-1", name: "Ceviche", units: "2", price: "$18.00", proposedBy: "client", proposedByName: "Valentina", confirmed: false, priceSnapshot: "$20.00" }]}
    />,
  );
  assert.match(html, /Ceviche/);
  assert.match(html, /data-line-row/);
});

test("money: total/deposit/paid/balance render when `money` is passed", () => {
  const html = renderToStaticMarkup(
    <ContextPanel
      essentials={ESSENTIALS}
      state={STATE_NEEDS}
      chips={[]}
      tasks={[]}
      itemsLabel="Items"
      loading={false}
      copy={EN_COPY}
      variant="desktop"
      onAction={noop}
      money={{ totalLabel: "$3,800", depositLabel: "$950", paidLabel: "$950", balanceLabel: "$2,850", balanceDueCents: 285000 }}
    />,
  );
  assert.match(html, /data-panel-money/);
  assert.match(html, /\$3,800/);
  assert.match(html, /\$950/);
  assert.match(html, /\$2,850/);
});

test("follow-up: the next reminder shows as the collapsed section's count, not a fake zero when there is none", () => {
  const withReminder = renderToStaticMarkup(
    <ContextPanel essentials={ESSENTIALS} state={STATE_NEEDS} chips={[]} tasks={[]} itemsLabel="Items" loading={false} copy={EN_COPY} variant="desktop" onAction={noop} nextReminderLabel="Aug 1" />,
  );
  assert.match(withReminder, /data-panel-section="Follow-up"[\s\S]*?class="cnt">Aug 1</);
  const without = renderToStaticMarkup(
    <ContextPanel essentials={ESSENTIALS} state={STATE_NEEDS} chips={[]} tasks={[]} itemsLabel="Items" loading={false} copy={EN_COPY} variant="desktop" onAction={noop} />,
  );
  assert.doesNotMatch(without, /class="cnt">/);
});
