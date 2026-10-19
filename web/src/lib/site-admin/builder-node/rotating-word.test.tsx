import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { cleanRotatingWords, nextWordIndex, splitRotate, ROTATE_MARKER } from "./rotating-word-logic";
import { RotatingWord } from "./rotating-word";
import { renderBuilderNodes } from "./render";
import { headingPropsSchema } from "./registry";
import { localizeBlockNode } from "./block-i18n";
import { localizableListSpecsForKind } from "@/lib/i18n/builder-i18n-list-props";
import type { BuilderNode } from "./types";

test("splitRotate splits at the marker, absent marker = no rotation", () => {
  assert.deepEqual(splitRotate(`An hour to ${ROTATE_MARKER}.`), ["An hour to ", "."]);
  assert.equal(splitRotate("Plain heading"), null);
});

test("cleanRotatingWords trims, drops blanks, dedupes, caps at 6 and 24 chars", () => {
  const out = cleanRotatingWords([{ text: " let go " }, { text: "" }, { text: "Let go" }, { text: "breathe" }, { text: "x".repeat(40) }]);
  assert.deepEqual(out, ["let go", "breathe", "x".repeat(24)]);
  assert.equal(cleanRotatingWords(Array.from({ length: 9 }, (_, i) => ({ text: `w${i}` }))).length, 6);
  assert.deepEqual(cleanRotatingWords(undefined), []);
});

test("nextWordIndex wraps", () => {
  assert.equal(nextWordIndex(0, 3), 1);
  assert.equal(nextWordIndex(2, 3), 0);
  assert.equal(nextWordIndex(0, 1), 0);
});

test("component: SSR shows the first word active, every word reserved in the same cell (no layout shift)", () => {
  const html = renderToStaticMarkup(<RotatingWord words={["let go", "breathe", "unwind"]} intervalMs={3000} />);
  assert.match(html, /data-rotating-word/);
  assert.match(html, /data-active="true"[^>]*>let go/);
  assert.match(html, />breathe</);
  assert.match(html, />unwind</);
  // Screen readers get one static word, not an animation.
  assert.match(html, /sb-rotating-sr[^>]*>let go/);
});

test("component: one word renders static, no stack", () => {
  const html = renderToStaticMarkup(<RotatingWord words={["let go"]} intervalMs={3000} />);
  assert.doesNotMatch(html, /data-rotating-word/);
  assert.match(html, /let go/);
});

const BASE = { mode: "freeform", includeRendererStyles: false, includeFontLinks: false };
const heading = (props: Record<string, unknown>): BuilderNode =>
  ({ id: "h1", kind: "heading", props: { level: 1, text: `An hour to ${ROTATE_MARKER}`, ...props } }) as unknown as BuilderNode;

test("schema accepts rotatingWords (max 6) and rotateMs, rejects 7 words", () => {
  const ok = headingPropsSchema.safeParse({ text: "x", level: 1, rotatingWords: [{ text: "a" }, { text: "b" }], rotateMs: 3000 });
  assert.ok(ok.success);
  const bad = headingPropsSchema.safeParse({ text: "x", level: 1, rotatingWords: Array.from({ length: 7 }, () => ({ text: "a" })) });
  assert.equal(bad.success, false);
});

test("heading rotatingWords are localizable list items", () => {
  assert.ok(localizableListSpecsForKind("heading").some((s) => s.list === "rotatingWords" && s.fields.includes("text")));
});

test("renderer: marker heading renders the stack; ES overlay words apply", () => {
  const overlay = { es: { text: `Una hora para ${ROTATE_MARKER}`, "rotatingWords.0.text": "soltar", "rotatingWords.1.text": "respirar" } };
  // The renderer reads the mirrored node-level overlay for `text` (the seed mirrors props.i18n there at apply).
  const node = { ...heading({ rotatingWords: [{ text: "let go" }, { text: "breathe" }], i18n: overlay }), i18n: overlay } as BuilderNode;
  const es = renderToStaticMarkup(<>{renderBuilderNodes([node], { ...BASE, contentLocale: { locale: "es", defaultLocale: "en", chain: ["es", "en"] } } as never)}</>);
  assert.match(es, /Una hora para/);
  assert.match(es, />soltar</);
  assert.match(es, />respirar</);
  assert.doesNotMatch(es, /let go/);
  const en = renderToStaticMarkup(<>{renderBuilderNodes([node], BASE as never)}</>);
  assert.match(en, /An hour to/);
  assert.match(en, />let go</);
  assert.doesNotMatch(en, /\{rotate\}/);
});

test("renderer: a heading without rotatingWords never shows the raw marker", () => {
  const html = renderToStaticMarkup(<>{renderBuilderNodes([heading({})], BASE as never)}</>);
  assert.doesNotMatch(html, /\{rotate\}/);
  assert.match(html, /An hour to/);
});

test("localizeBlockNode returns the ES words", () => {
  const node = heading({ rotatingWords: [{ text: "let go" }], i18n: { es: { "rotatingWords.0.text": "soltar" } } });
  const out = localizeBlockNode(node, { locale: "es", defaultLocale: "en", chain: ["es", "en"] } as never) as unknown as { props: { rotatingWords: { text: string }[] } };
  assert.equal(out.props.rotatingWords[0]!.text, "soltar");
});
