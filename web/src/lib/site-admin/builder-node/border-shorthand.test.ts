/**
 * border-shorthand.test.ts — per-side border style/color grammar + the B9
 * mix-blend pin (those four modes were already on the union; this file is
 * the lock so they cannot shrink back out of schema or inspector).
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { builderNodeStyleValueSchema } from "./registry";
import { BUILDER_MIX_BLEND_MODES } from "./types";
import {
  BUILDER_BORDER_STYLE_KEYWORDS,
  composeBorderSideColors,
  composeBorderSideStyles,
  isBuilderBorderStyleShorthand,
  isBuilderColorShorthand,
  parseBorderSideColors,
  parseBorderSideStyles,
  splitCssSpaceList,
} from "./border-shorthand";

test("B9: existing one-keyword borderStyle values still parse", () => {
  for (const keyword of ["solid", "dashed", "dotted"] as const) {
    const result = builderNodeStyleValueSchema.safeParse({ borderStyle: keyword });
    assert.equal(result.success, true, keyword);
    assert.equal(parseBorderSideStyles(keyword)?.top, keyword);
    assert.equal(composeBorderSideStyles(parseBorderSideStyles(keyword)!), keyword);
  }
});

test("B9: per-side style shorthand round-trips and is stored as CSS", () => {
  assert.equal(isBuilderBorderStyleShorthand("solid dashed"), true);
  assert.deepEqual(parseBorderSideStyles("dashed solid"), {
    top: "dashed",
    right: "solid",
    bottom: "dashed",
    left: "solid",
  });
  assert.equal(
    composeBorderSideStyles({
      top: "dashed",
      right: "solid",
      bottom: "none",
      left: "dotted",
    }),
    "dashed solid none dotted",
  );
  const parsed = builderNodeStyleValueSchema.safeParse({
    borderStyle: "dashed solid none dotted",
  });
  assert.equal(parsed.success, true);
});

test("B9: unknown style keywords are refused (no silent snap)", () => {
  assert.equal(isBuilderBorderStyleShorthand("wavy"), false);
  assert.equal(parseBorderSideStyles("solid wavy"), null);
  assert.equal(
    builderNodeStyleValueSchema.safeParse({ borderStyle: "wavy" }).success,
    false,
  );
});

test("B9: existing single borderColor still parses", () => {
  const hex = builderNodeStyleValueSchema.safeParse({ borderColor: "#c9a227" });
  assert.equal(hex.success, true);
  const token = builderNodeStyleValueSchema.safeParse({
    borderColor: "token:color.primary",
  });
  assert.equal(token.success, true);
});

test("B9: per-side color shorthand keeps rgba() intact", () => {
  const raw = "rgba(0,0,0,0.2) #111 #222 rgb(1, 2, 3)";
  assert.deepEqual(splitCssSpaceList(raw), [
    "rgba(0,0,0,0.2)",
    "#111",
    "#222",
    "rgb(1, 2, 3)",
  ]);
  assert.equal(isBuilderColorShorthand(raw), true);
  const sides = parseBorderSideColors(raw);
  assert.equal(sides?.top, "rgba(0,0,0,0.2)");
  assert.equal(sides?.left, "rgb(1, 2, 3)");
  assert.equal(composeBorderSideColors(sides!), raw);
  assert.equal(builderNodeStyleValueSchema.safeParse({ borderColor: raw }).success, true);
});

test("B9: mixBlendMode union still includes difference, color-dodge, luminosity, soft-light", () => {
  const optionsSrc = readFileSync(
    path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../components/edit-chrome/inspectors/style-panel/style-options.ts",
    ),
    "utf8",
  );
  for (const mode of [
    "difference",
    "color-dodge",
    "luminosity",
    "soft-light",
  ] as const) {
    assert.ok(BUILDER_MIX_BLEND_MODES.includes(mode), `schema missing ${mode}`);
    assert.ok(
      optionsSrc.includes(`"${mode}"`),
      `inspector options missing ${mode}`,
    );
    assert.equal(
      builderNodeStyleValueSchema.safeParse({ mixBlendMode: mode }).success,
      true,
      `zod rejects ${mode}`,
    );
  }
});

test("B9: the keyword union still contains the original three styles", () => {
  for (const k of ["solid", "dashed", "dotted"] as const) {
    assert.ok((BUILDER_BORDER_STYLE_KEYWORDS as readonly string[]).includes(k));
  }
});
