import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { FilterChips, FilterSheet, InboxSegments } from "./InboxSegments";
import { EN_COPY } from "./test-copy";

const noop = () => {};

test("segments: Needs action / Waiting / All with the count only where there is one", () => {
  const html = renderToStaticMarkup(<InboxSegments value="needs" counts={{ needs: 3 }} copy={EN_COPY} onChange={noop} />);
  assert.match(html, /class="seg" role="tablist"/);
  assert.match(html, /aria-selected="true" class="on">Needs action<span class="n">3<\/span>/);
  assert.match(html, /aria-selected="false" class="">Waiting<\/button>/);
  assert.match(html, />All<\/button>/);
  const mobile = renderToStaticMarkup(<InboxSegments value="all" counts={{}} copy={EN_COPY} onChange={noop} variant="mobile" />);
  assert.match(mobile, /class="mx-seg"/);
});

test("filter chips narrow, never hide: the active ones are `on`", () => {
  const html = renderToStaticMarkup(<FilterChips active={["mine", "unread"]} copy={EN_COPY} onToggle={noop} />);
  assert.match(html, /chip on[^>]*aria-pressed="true"[^>]*>Mine/);
  assert.match(html, /chip soft" aria-pressed="false"[^>]*>Unassigned/);
  assert.match(html, /Payment issues/);
});

test("filter sheet: closed renders nothing; open is an h60 bottom sheet; busy count disables Show", () => {
  assert.equal(renderToStaticMarkup(<FilterSheet open={false} active={[]} copy={EN_COPY} resultCount={3} onToggle={noop} onClear={noop} onApply={noop} onClose={noop} />), "");
  const ready = renderToStaticMarkup(<FilterSheet open active={["mine"]} copy={EN_COPY} resultCount={3} onToggle={noop} onClear={noop} onApply={noop} onClose={noop} />);
  assert.match(ready, /mx-sheet h60/);
  assert.match(ready, /<h3[^>]*>Filter<\/h3>/);
  assert.match(ready, /mx-opt on" aria-pressed="true"><span>Mine<\/span>/);
  assert.match(ready, /Show 3 conversations/);
  assert.match(ready, />Clear</);
  const busy = renderToStaticMarkup(<FilterSheet open active={[]} copy={EN_COPY} resultCount={null} onToggle={noop} onClear={noop} onApply={noop} onClose={noop} />);
  assert.match(busy, /aria-busy="true"[^>]*>Counting/);
});
