import assert from "node:assert/strict";
import { test } from "node:test";

import { parseParagraphText } from "@/lib/cms/post-text-lists";

test("plain text without list lines is unchanged: one paragraph per blank-line chunk", () => {
  assert.deepEqual(parseParagraphText("Hola\n\nMundo"), [
    { kind: "p", text: "Hola" },
    { kind: "p", text: "Mundo" },
  ]);
});

test("dash, star and bullet lines become one unordered list", () => {
  assert.deepEqual(parseParagraphText("- uno\n* dos\n• tres"), [{ kind: "ul", items: ["uno", "dos", "tres"] }]);
});

test("numbered lines become an ordered list", () => {
  assert.deepEqual(parseParagraphText("1. a\n2) b"), [{ kind: "ol", items: ["a", "b"] }]);
});

test("intro line, list, then closing line keep their order", () => {
  assert.deepEqual(parseParagraphText("Includes:\n- x\n- y\nThanks"), [
    { kind: "p", text: "Includes:" },
    { kind: "ul", items: ["x", "y"] },
    { kind: "p", text: "Thanks" },
  ]);
});

test("switching list type starts a new list", () => {
  assert.deepEqual(parseParagraphText("- a\n1. b"), [
    { kind: "ul", items: ["a"] },
    { kind: "ol", items: ["b"] },
  ]);
});

test("a hyphen inside a sentence or a dash without a space is not a list", () => {
  assert.deepEqual(parseParagraphText("-5 degrees\nwell-known"), [{ kind: "p", text: "-5 degrees\nwell-known" }]);
});
