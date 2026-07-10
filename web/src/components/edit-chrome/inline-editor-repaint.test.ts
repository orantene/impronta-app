import assert from "node:assert/strict";
import { test } from "node:test";

import { renderInlineRichHtml } from "./inline-editor-repaint";

// W1-L3 — the optimistic-repaint HTML serializer must (a) mirror the published
// `renderInlineRich` tag/class output so the server refresh reconciles cleanly,
// and (b) HTML-escape every author-supplied text run so the innerHTML write can
// never smuggle markup. These are the pure commit-repaint semantics.

test("plain text is wrapped in a span and returns the same textContent", () => {
  assert.equal(renderInlineRichHtml("A photograph should remember"), "<span>A photograph should remember</span>");
});

test("empty / nullish input returns empty string (no-op repaint)", () => {
  assert.equal(renderInlineRichHtml(""), "");
  assert.equal(renderInlineRichHtml(null), "");
  assert.equal(renderInlineRichHtml(undefined), "");
});

test("accent marker → italic-serif accent em with the published class + style", () => {
  assert.equal(
    renderInlineRichHtml("{accent}remember{/accent}"),
    '<em class="site-accent" style="font-style:italic;font-weight:300">remember</em>',
  );
});

test("color marker → site-color span with the hex inlined", () => {
  assert.equal(
    renderInlineRichHtml("{color:#ff0066}bold hue{/color}"),
    '<span class="site-color" style="color:#ff0066">bold hue</span>',
  );
});

test("bold and italic markers → semantic strong / em", () => {
  assert.equal(renderInlineRichHtml("{b}strong{/b}"), "<strong>strong</strong>");
  assert.equal(renderInlineRichHtml("{i}soft{/i}"), "<em>soft</em>");
});

test("safe external link → anchor with target+rel; internal → anchor without", () => {
  assert.equal(
    renderInlineRichHtml("[Book now](https://example.com)"),
    '<a href="https://example.com" class="site-link" target="_blank" rel="noopener noreferrer">Book now</a>',
  );
  assert.equal(
    renderInlineRichHtml("[About](/about)"),
    '<a href="/about" class="site-link">About</a>',
  );
});

test("unsafe link scheme (javascript:) never becomes an anchor — renders plain label", () => {
  const html = renderInlineRichHtml("[click](javascript:void)");
  assert.equal(html.includes("<a "), false);
  assert.equal(html, "<span>click</span>");
});

test("author angle brackets / quotes in text are HTML-escaped (no injection)", () => {
  assert.equal(
    renderInlineRichHtml("<img src=x onerror=alert(1)>"),
    "<span>&lt;img src=x onerror=alert(1)&gt;</span>",
  );
  assert.equal(
    renderInlineRichHtml('{b}<script>"evil"{/b}'),
    "<strong>&lt;script&gt;&quot;evil&quot;</strong>",
  );
});

test("mixed markers + surrounding text preserve order and escaping", () => {
  assert.equal(
    renderInlineRichHtml("Hello {b}world{/b} & {accent}goodbye{/accent}"),
    '<span>Hello </span><strong>world</strong><span> &amp; </span><em class="site-accent" style="font-style:italic;font-weight:300">goodbye</em>',
  );
});
