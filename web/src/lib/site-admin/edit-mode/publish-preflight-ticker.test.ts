import assert from "node:assert/strict";
import test from "node:test";

import { collectTickerPreflightIssues } from "./publish-preflight-ticker";

const node = (props: Record<string, unknown>, id = "m1") => ({ id, kind: "marquee", props });

test("a services ticker with words of its own, a custom one and a legacy one raise nothing", () => {
  const words = [{ text: "a" }, { text: "b" }];
  assert.deepEqual(
    collectTickerPreflightIssues([
      node({ source: "services", items: words }),
      node({ source: "custom", items: words }),
      node({ items: words }),
    ]),
    [],
  );
});

test("a services ticker with no fallback words warns and names the node", () => {
  const issues = collectTickerPreflightIssues([
    { id: "wrap", kind: "container", props: {}, children: [node({ source: "services" }, "deep")] },
  ]);
  assert.equal(issues.length, 1);
  assert.equal(issues[0]!.nodeId, "deep");
  assert.equal(issues[0]!.severity, "warn");
});

test("an unknown source is flagged, never silently reinterpreted", () => {
  const issues = collectTickerPreflightIssues([node({ source: "rss", items: [{ text: "a" }] })]);
  assert.equal(issues.length, 1);
  assert.match(issues[0]!.message, /do not recognise/);
});

test("garbage input fails closed to no issues", () => {
  assert.deepEqual(collectTickerPreflightIssues(null), []);
  assert.deepEqual(collectTickerPreflightIssues([null, 3, "x"]), []);
});

test("messages carry no dashes", () => {
  for (const i of collectTickerPreflightIssues([node({ source: "services" }), node({ source: "x" }, "n2")])) {
    assert.ok(!/[–—]/.test(i.message));
  }
});
