import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseStyleClassesFromSnapshot } from "./composition-revision-snapshot";

describe("parseStyleClassesFromSnapshot", () => {
  it("returns undefined for missing or empty styleClasses", () => {
    assert.equal(parseStyleClassesFromSnapshot(null), undefined);
    assert.equal(parseStyleClassesFromSnapshot({}), undefined);
    assert.equal(parseStyleClassesFromSnapshot({ styleClasses: {} }), undefined);
    assert.equal(parseStyleClassesFromSnapshot({ styleClasses: [] }), undefined);
  });

  it("parses a valid registry from revision snapshot JSON", () => {
    const parsed = parseStyleClassesFromSnapshot({
      builderTree: [],
      styleClasses: {
        "card-elevated": {
          id: "card-elevated",
          name: "Card elevated",
          style: { backgroundColor: "#fff" },
        },
      },
    });
    assert.ok(parsed);
    assert.equal(parsed!["card-elevated"]?.name, "Card elevated");
    assert.equal(parsed!["card-elevated"]?.style.backgroundColor, "#fff");
  });

  it("drops malformed class entries", () => {
    const parsed = parseStyleClassesFromSnapshot({
      styleClasses: {
        good: { id: "good", name: "Good", style: { color: "#111" } },
        bad: { id: "bad", name: "Missing style" },
      },
    });
    assert.ok(parsed);
    assert.equal(Object.keys(parsed!).length, 1);
    assert.ok(parsed!.good);
  });
});
