import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { EmptyState, Skeleton } from "./Skeleton";
import { EN_COPY } from "./test-copy";

test("skeleton: N rows, a status for readers, no text that could read as empty", () => {
  const html = renderToStaticMarkup(<Skeleton rows={3} copy={EN_COPY} />);
  assert.match(html, /role="status" aria-live="polite" aria-label="Loading"/);
  assert.equal((html.match(/class="sk-row"/g) ?? []).length, 3);
  assert.doesNotMatch(html, /No conversations/);
  assert.equal((renderToStaticMarkup(<Skeleton rows={2} variant="mobile" copy={EN_COPY} />).match(/class="mx-sk"/g) ?? []).length, 2);
});

test("empty state: title, one sentence, one action; failed uses the primary Try again; small has no illustration", () => {
  const empty = renderToStaticMarkup(<EmptyState title={EN_COPY.inbox.empty.needsTitle} body={EN_COPY.inbox.empty.needsBody} action={{ label: EN_COPY.inbox.empty.needsAction, onClick: () => {} }} />);
  assert.match(empty, /class="empty" data-empty-state/);
  assert.match(empty, /class="ill"/);
  assert.match(empty, /<b>Nothing needs you<\/b><span>Every conversation is waiting on a client or resolved\.<\/span><button[^>]*class="btn sm"[^>]*>Show Waiting on client/);
  const failed = renderToStaticMarkup(<EmptyState icon="refresh" title={EN_COPY.inbox.empty.failedTitle} body={EN_COPY.inbox.empty.failedBody} action={{ label: EN_COPY.inbox.empty.failedAction, onClick: () => {}, primary: true }} />);
  assert.match(failed, /Your messages are safe/);
  assert.match(failed, /btn primary sm[^>]*>Try again/);
  const busy = renderToStaticMarkup(<EmptyState title="x" action={{ label: "Try again", onClick: () => {}, busy: true }} />);
  assert.match(busy, /aria-busy="true"/);
  const small = renderToStaticMarkup(<EmptyState title="Nothing sent yet" small />);
  assert.match(small, /empty small/);
  assert.doesNotMatch(small, /class="ill"/);
  assert.match(renderToStaticMarkup(<EmptyState title="x" variant="mobile" />), /empty mx-empty/);
});
