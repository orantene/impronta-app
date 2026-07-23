/**
 * button.test.ts — variant → class contract for the ONE chrome Button (W2-C2).
 *
 * `buttonClassName` is the pure mapping that drives the injected CSS. If a class
 * name here drifts from a selector in the stylesheet, hover/disabled/active
 * silently stop painting — so this pins the contract without a DOM.
 *
 * Run: node_modules/.bin/tsx --test src/components/edit-chrome/kit/button.test.ts
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { buttonClassName } from "./button";

test("base + variant + size classes are always present", () => {
  const cls = buttonClassName("primary", "md");
  assert.ok(cls.split(" ").includes("ec-btn"), "has base class");
  assert.ok(cls.split(" ").includes("ec-btn--primary"), "has variant class");
  assert.ok(cls.split(" ").includes("ec-btn--md"), "has size class");
});

test("every variant maps to its own class token", () => {
  for (const v of ["primary", "secondary", "ghost", "subtle", "danger"] as const) {
    assert.ok(
      buttonClassName(v, "sm").split(" ").includes(`ec-btn--${v}`),
      `variant ${v} emits ec-btn--${v}`,
    );
  }
});

test("both sizes map to their own class token", () => {
  assert.ok(buttonClassName("ghost", "sm").split(" ").includes("ec-btn--sm"));
  assert.ok(buttonClassName("ghost", "md").split(" ").includes("ec-btn--md"));
});

test("iconOnly adds the icon modifier only when requested", () => {
  assert.ok(
    !buttonClassName("ghost", "md").includes("ec-btn--icon"),
    "no icon modifier by default",
  );
  assert.ok(
    buttonClassName("ghost", "md", { iconOnly: true })
      .split(" ")
      .includes("ec-btn--icon"),
    "icon modifier when iconOnly",
  );
});

test("caller className is appended, not swallowed", () => {
  const cls = buttonClassName("secondary", "md", { className: "w-full mt-2" });
  assert.ok(cls.includes("ec-btn--secondary"));
  assert.ok(cls.includes("w-full"));
  assert.ok(cls.includes("mt-2"));
});

test("class string has no leading/trailing/double spaces", () => {
  const cls = buttonClassName("danger", "sm", { iconOnly: true });
  assert.equal(cls, cls.trim());
  assert.ok(!cls.includes("  "), "no double spaces");
});
