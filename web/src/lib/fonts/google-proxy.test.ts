import test from "node:test";
import assert from "node:assert/strict";
import {
  buildUpstreamCssUrl,
  buildUpstreamFileUrl,
  rewriteFontCss,
  toFontProxyHref,
} from "./google-proxy";

test("font proxy: accepts catalogue families and rebuilds the upstream url", () => {
  const href = toFontProxyHref(
    "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;1,400&family=Jost:wght@300;400&display=swap",
  );
  assert.ok(href.startsWith("/api/fonts/css?"));
  const up = buildUpstreamCssUrl(href.split("?")[1]);
  assert.ok(up?.includes("family=Cormorant+Garamond:ital,wght@0,400;1,400"));
  assert.ok(up?.includes("family=Jost:wght@300;400"));
});

test("font proxy: rejects unknown families, bad axes, missing display, extra params", () => {
  assert.equal(buildUpstreamCssUrl("family=Evil+Font:wght@400&display=swap"), null);
  assert.equal(buildUpstreamCssUrl("family=Jost:wght@400<x>&display=swap"), null);
  assert.equal(buildUpstreamCssUrl("family=Jost:wght@400"), null);
  assert.equal(buildUpstreamCssUrl("family=Jost:wght@400&display=swap&url=http://x"), null);
  assert.equal(buildUpstreamCssUrl("display=swap"), null);
});

test("font proxy: only allows gstatic font paths", () => {
  assert.equal(
    buildUpstreamFileUrl("/s/jost/v15/abc.woff2"),
    "https://fonts.gstatic.com/s/jost/v15/abc.woff2",
  );
  assert.equal(buildUpstreamFileUrl("/other/x.woff2"), null);
  assert.equal(buildUpstreamFileUrl("/s/a/../../etc.woff2"), null);
  assert.equal(buildUpstreamFileUrl("//evil.com/s/a/b.woff2"), null);
});

test("font proxy: rewrites gstatic urls in css", () => {
  const out = rewriteFontCss("src: url(https://fonts.gstatic.com/s/jost/v15/a.woff2) format('woff2');");
  assert.ok(out.includes("/api/fonts/file?p=%2Fs%2Fjost%2Fv15%2Fa.woff2"));
  assert.ok(!out.includes("gstatic"));
});
