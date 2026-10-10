/**
 * GRK-077/100 — contrastChrome footers (Gridline / Trades) paint ink and put
 * `tone: muted` © lines inside. The band must publish `--bn-ink-muted` so fine
 * print is soft paper, not page muted-on-ink (~3.3:1).
 */
import assert from "node:assert/strict";
import test from "node:test";

import { sharedNodeStyle } from "./render";

test("contrast background publishes bn-ink + bn-ink-muted for child muted ©", () => {
  const band = sharedNodeStyle({ background: "contrast" }) as Record<string, string>;
  assert.equal(band.background, "var(--token-color-ink,#111)");
  assert.equal(band.color, "var(--token-color-background,#fff)");
  assert.equal(band["--bn-ink"], "var(--token-color-background,#fff)");
  assert.match(band["--bn-ink-muted"] ?? "", /color-mix\(in oklab, var\(--token-color-background,#fff\) 72%, transparent\)/);
});

test("muted tone prefers band ink-muted, then AA muted-text", () => {
  const muted = sharedNodeStyle({ tone: "muted" }) as Record<string, string>;
  assert.equal(
    muted.color,
    "var(--bn-ink-muted, var(--token-color-muted-text, var(--token-color-muted, rgba(18, 18, 18, 0.62))))",
  );
});

test("contrast + muted on one node keeps soft paper via bn-ink-muted", () => {
  const node = sharedNodeStyle({ background: "contrast", tone: "muted" }) as Record<string, string>;
  assert.equal(node.background, "var(--token-color-ink,#111)");
  assert.ok(node["--bn-ink-muted"]?.includes("72%"));
  assert.equal(
    node.color,
    "var(--bn-ink-muted, var(--token-color-muted-text, var(--token-color-muted, rgba(18, 18, 18, 0.62))))",
  );
});
