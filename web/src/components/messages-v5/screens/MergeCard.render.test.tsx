import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { EN_COPY } from "../kit/test-copy";
import { MergeCard } from "./MergeCard";

const noop = () => {};
const base = {
  duplicate: { inquiryId: "inq-9", name: "Marco Salinas" },
  into: { inquiryId: "inq-1", name: "Marco Salinas", version: 4 },
  busy: false,
  refusal: null,
  onMerge: noop,
  onDismiss: noop,
  copy: EN_COPY,
  variant: "desktop" as const,
};

test("idle: Same person?, the two default rows (merge, not the same), no Keep separate without the handler", () => {
  const html = renderToStaticMarkup(<MergeCard {...base} />);
  assert.match(html, /card k-id me wide/);
  assert.match(html, /Same person\?/);
  assert.match(html, /Marco Salinas, who already has an open conversation/);
  assert.match(html, /Merge into &quot;Marco Salinas&quot;/);
  assert.match(html, /Not the same person/);
  assert.doesNotMatch(html, /Keep separate/);
  assert.doesNotMatch(html, /data-refusal/);
  assert.doesNotMatch(html, /style=/);
});

test("with onKeepSeparate, the middle row renders", () => {
  const html = renderToStaticMarkup(<MergeCard {...base} onKeepSeparate={noop} />);
  assert.match(html, /Keep separate, link the client/);
});

test("busy disables every row", () => {
  const html = renderToStaticMarkup(<MergeCard {...base} busy onKeepSeparate={noop} />);
  assert.match(html, /card k-id me busy wide/);
  assert.match(html, /aria-busy="true"/);
  const disabledCount = (html.match(/role="radio"[^>]*disabled=""/g) ?? []).length;
  assert.equal(disabledCount, 3);
});

test("not_allowed refusal (D-MSG-5: a paid or confirmed record) shows the sentence", () => {
  const html = renderToStaticMarkup(<MergeCard {...base} refusal="not_allowed" />);
  assert.match(html, /data-refusal="not_allowed"/);
  assert.match(html, /You cannot do that from here/);
});

test("mobile variant uses the mx-card grammar", () => {
  const html = renderToStaticMarkup(<MergeCard {...base} variant="mobile" />);
  assert.match(html, /class="mx-card k-id"/);
});
