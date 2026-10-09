import test from "node:test";
import assert from "node:assert/strict";
import {
  buildUpstreamCssUrl,
  buildUpstreamFileUrl,
  coalesceFontFilePath,
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

test("font proxy: accepts /l/font kit faces Google still emits for DM Sans", () => {
  const kit =
    "/l/font?kit=rP2tp2ywxg089UriI5-g7M8btVsD8Ck0q-m40F9JadbnoEwAfJtRSW32&skey=cd068b3e1b767e51&v=v17";
  assert.equal(
    buildUpstreamFileUrl(kit),
    "https://fonts.gstatic.com/l/font?kit=rP2tp2ywxg089UriI5-g7M8btVsD8Ck0q-m40F9JadbnoEwAfJtRSW32&skey=cd068b3e1b767e51&v=v17",
  );
  assert.equal(buildUpstreamFileUrl("/l/font?kit=short"), null);
  assert.equal(buildUpstreamFileUrl("/l/font?kit=rP2tp2ywxg089UriI5-g7M8btVsD8Ck0q&url=http://x"), null);
  assert.equal(buildUpstreamFileUrl("/l/font"), null);
});

test("font proxy: coalesce sibling kit params from a broken cached rewrite", () => {
  assert.equal(
    coalesceFontFilePath("/l/font", {
      kit: "rP2tp2ywxg089UriI5-g7M8btVsD8Ck0q-m40F9JadbnoEwAfJtRSW32",
      skey: "cd068b3e1b767e51",
      v: "v17",
    }),
    "/l/font?kit=rP2tp2ywxg089UriI5-g7M8btVsD8Ck0q-m40F9JadbnoEwAfJtRSW32&skey=cd068b3e1b767e51&v=v17",
  );
  assert.equal(coalesceFontFilePath("/s/jost/v15/a.woff2", { kit: "x".repeat(20) }), "/s/jost/v15/a.woff2");
});

test("font proxy: rewrites gstatic urls in css", () => {
  const out = rewriteFontCss("src: url(https://fonts.gstatic.com/s/jost/v15/a.woff2) format('woff2');");
  assert.ok(out.includes("/api/fonts/file?p=%2Fs%2Fjost%2Fv15%2Fa.woff2"));
  assert.ok(!out.includes("gstatic"));
});

test("font proxy: rewrites /l/font kit urls with the query string encoded into p", () => {
  const css =
    "src: url(https://fonts.gstatic.com/l/font?kit=rP2tp2ywxg089UriI5-g7M8btVsD8Ck0q-m40F9JadbnoEwAfJtRSW32&skey=cd068b3e1b767e51&v=v17);";
  const out = rewriteFontCss(css);
  assert.ok(!out.includes("gstatic"));
  assert.ok(!out.includes("?p=%2Fl%2Ffont?kit="), "must not leave kit as a dangling query");
  const m = out.match(/p=([^)"'\s]+)/);
  assert.ok(m);
  const decoded = decodeURIComponent(m![1]);
  assert.equal(
    decoded,
    "/l/font?kit=rP2tp2ywxg089UriI5-g7M8btVsD8Ck0q-m40F9JadbnoEwAfJtRSW32&skey=cd068b3e1b767e51&v=v17",
  );
  assert.ok(buildUpstreamFileUrl(decoded));
});

test("toFontProxyHref keeps the Google URL for a family the proxy would reject", () => {
  const href = "https://fonts.googleapis.com/css2?family=Definitely+Not+A+Font&display=swap";
  assert.equal(toFontProxyHref(href), href);
});

test("proxy accepts a percent-encoded query (server-encoded colon and at)", () => {
  assert.equal(
    buildUpstreamCssUrl("family=Figtree%3Awght%40400..700&display=swap"),
    "https://fonts.googleapis.com/css2?family=Figtree:wght@400..700&display=swap",
  );
  assert.notEqual(
    buildUpstreamCssUrl("family=Bodoni+Moda%3Aital%2Cwght%400%2C400..700%3B1%2C400..700&display=swap"),
    null,
  );
});
