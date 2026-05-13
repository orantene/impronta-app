import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  interpolate,
  withInterpolation,
  withPluralization,
  createEnhancedTranslator,
  type Translator,
} from "./interpolate";

describe("interpolate()", () => {
  it("substitutes named placeholders", () => {
    assert.equal(
      interpolate("Welcome, {name}!", { name: "Sofía" }),
      "Welcome, Sofía!",
    );
  });

  it("leaves unknown placeholders intact", () => {
    assert.equal(
      interpolate("{a} and {b}", { a: "1" }),
      "1 and {b}",
    );
  });

  it("coerces numbers to string", () => {
    assert.equal(
      interpolate("{count} items", { count: 3 }),
      "3 items",
    );
  });
});

describe("withInterpolation()", () => {
  it("substitutes values from the catalog", () => {
    const t: Translator = (key) =>
      ({ "welcome.user": "Welcome {name}!" } as Record<string, string>)[key] ?? key;
    const ti = withInterpolation(t);
    assert.equal(ti("welcome.user", { name: "Sofía" }), "Welcome Sofía!");
  });

  it("returns raw resolved string when no values provided", () => {
    const t: Translator = (key) =>
      ({ "greet": "Hello" } as Record<string, string>)[key] ?? key;
    assert.equal(withInterpolation(t)("greet"), "Hello");
  });
});

describe("withPluralization()", () => {
  const catalog: Record<string, string> = {
    "inbox.unread.one": "1 unread message",
    "inbox.unread.other": "{count} unread messages",
  };
  const t: Translator = (key) => catalog[key] ?? key;

  it("uses .one for count === 1", () => {
    assert.equal(withPluralization(t)("inbox.unread", 1), "1 unread message");
  });

  it("uses .other for count !== 1", () => {
    assert.equal(withPluralization(t)("inbox.unread", 5), "5 unread messages");
    assert.equal(withPluralization(t)("inbox.unread", 0), "0 unread messages");
  });

  it("falls back to base key when plural forms missing", () => {
    const tBare: Translator = (key) =>
      ({ "x": "X label" } as Record<string, string>)[key] ?? key;
    assert.equal(withPluralization(tBare)("x", 1), "X label");
  });
});

describe("createEnhancedTranslator()", () => {
  const catalog: Record<string, string> = {
    "x.one": "1 x",
    "x.other": "{count} xs",
    "y": "Hi {name}",
  };
  const t: Translator = (key) => catalog[key] ?? key;

  it("dispatches plural when count is provided", () => {
    assert.equal(createEnhancedTranslator(t)("x", { count: 3 }), "3 xs");
  });

  it("falls through to interpolation when no count", () => {
    assert.equal(createEnhancedTranslator(t)("y", { name: "M" }), "Hi M");
  });
});
