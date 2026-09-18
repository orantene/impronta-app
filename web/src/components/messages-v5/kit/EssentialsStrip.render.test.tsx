import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { EssentialsStrip } from "./EssentialsStrip";
import { EN_COPY } from "./test-copy";
import { CHIP_OFFER, STATE_BARE, STATE_NEEDS } from "./test-fixtures";

test("ready: opportunity, main record, amount, Details", () => {
  const html = renderToStaticMarkup(<EssentialsStrip state={STATE_NEEDS} chips={[CHIP_OFFER]} amountLabel="$3,800 · $0 paid" copy={EN_COPY} onDetails={() => {}} />);
  assert.match(html, /data-essentials-strip/);
  assert.match(html, /pill opp">Awaiting acceptance/);
  assert.match(html, /Offer v2 · \$3,800/);
  assert.match(html, /pill money">\$3,800 · \$0 paid/);
  assert.match(html, />Details<\/button>/);
});

test("empty: no opportunity, no record, Nothing owed", () => {
  const html = renderToStaticMarkup(<EssentialsStrip state={STATE_BARE} chips={[]} amountLabel={null} copy={EN_COPY} onDetails={() => {}} />);
  assert.doesNotMatch(html, /pill opp/);
  assert.match(html, /pill ch">Nothing owed/);
});
