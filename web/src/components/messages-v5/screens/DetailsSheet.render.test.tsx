import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { ESSENTIALS, STATE_NEEDS, TASKS } from "../kit/test-fixtures";
import { EN_COPY } from "../kit/test-copy";

import { DetailsSheet } from "./DetailsSheet";

const noop = () => {};

test("closed renders nothing", () => {
  const html = renderToStaticMarkup(
    <DetailsSheet open={false} essentials={ESSENTIALS} state={STATE_NEEDS} chips={[]} tasks={[]} itemsLabel="Items" loading={false} copy={EN_COPY} variant="mobile" onAction={noop} onClose={noop} />,
  );
  assert.equal(html, "");
});

test("open: one mobile 92% sheet, no tabs, shortcut buttons then every expandable section", () => {
  const html = renderToStaticMarkup(
    <DetailsSheet open essentials={ESSENTIALS} state={STATE_NEEDS} chips={[]} tasks={TASKS} itemsLabel="Services" loading={false} copy={EN_COPY} variant="mobile" onAction={noop} onClose={noop} />,
  );
  assert.match(html, /data-sheet="mobile-h92"/);
  assert.doesNotMatch(html, /role="tablist"/);
  assert.match(html, /data-details-shortcuts/);
  assert.match(html, /data-shortcut="revise_offer"/);
  assert.match(html, /data-shortcut="request_payment"/);
  assert.match(html, /data-shortcut="add_items"/);
  assert.match(html, /data-panel-section="Services"/);
  assert.match(html, /data-panel-section="Money"/);
  assert.match(html, /data-panel-section="Files"/);
  assert.match(html, /data-panel-section="Team notes"/);
  assert.match(html, /data-panel-section="Follow-up"/);
  assert.doesNotMatch(html, /style=/);
});
