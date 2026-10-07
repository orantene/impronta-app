import assert from "node:assert/strict";
import { test } from "node:test";

import {
  getActiveContentLocaleSnapshot,
  publishActiveContentLocale,
} from "@/lib/i18n/active-content-locale-store";
import {
  buildEditingLocaleState,
  isTextUnchanged,
  resolveCanvasLabelLocale,
  selectEditingLocale,
  showsMissingTranslationHint,
} from "./editing-locale";
import { runCommitBuilderNodeText } from "./use-inline-text-commit";

const reset = () =>
  publishActiveContentLocale(buildEditingLocaleState("es", "es", ["es", "en"]));

test("one editing-locale state drives canvas label locale and inspector tab", () => {
  reset();
  const tab = () => {
    const s = getActiveContentLocaleSnapshot();
    return ["es", "en"].includes(s.locale) ? s.locale : "es";
  };
  const canvas = () =>
    resolveCanvasLabelLocale("es", getActiveContentLocaleSnapshot().locale).locale;

  selectEditingLocale("en", "es", ["es", "en"]);
  assert.equal(tab(), "en");
  assert.equal(canvas(), "en");
  assert.deepEqual([...getActiveContentLocaleSnapshot().chain], ["en", "es"]);

  selectEditingLocale("es", "es", ["es", "en"]);
  assert.equal(tab(), "es");
  assert.equal(canvas(), "es");
});

test("site-locale swaps and live text apply only in the site locale", () => {
  assert.equal(resolveCanvasLabelLocale("es", "es").followsSite, true);
  assert.equal(resolveCanvasLabelLocale("es", "en").followsSite, false);
  assert.equal(resolveCanvasLabelLocale("es", null).locale, "es");
});

test("empty secondary locale shows the missing hint, default never does", () => {
  assert.equal(showsMissingTranslationHint("en", "es", false), true);
  assert.equal(showsMissingTranslationHint("en", "es", true), false);
  assert.equal(showsMissingTranslationHint("es", "es", false), false);
});

test("isTextUnchanged ignores edge whitespace and nbsp", () => {
  assert.equal(isTextUnchanged("Hola mundo", "  Hola mundo "), true);
  assert.equal(isTextUnchanged("Hola", "Hola mundo"), false);
});

function fakeDeps(props: Record<string, unknown>, i18n?: Record<string, Record<string, string>>) {
  const calls: unknown[] = [];
  const tree = [{ id: "n1", kind: "heading", props: { level: 1, ...props }, ...(i18n ? { i18n } : {}) }];
  return {
    calls,
    deps: {
      builderTreeRef: { current: tree } as never,
      defaultLocale: "es",
      patchBuilderNodeProps: async (_id: string, patch: unknown) => {
        calls.push(patch);
        return { ok: true } as never;
      },
      reportMutationError: () => {},
      setBanner: () => {},
    },
  };
}

test("no save when the inline value is unchanged (focus/click without typing)", async () => {
  const { deps, calls } = fakeDeps({ text: "Hola, soy Ana" });
  const target = { id: "n1", propKey: "text", locale: "es" } as never;
  assert.equal(await runCommitBuilderNodeText(deps, target, "Hola, soy Ana ", "Hola, soy Ana"), false);
  assert.equal(await runCommitBuilderNodeText(deps, target, "Hello, I'm Ana", "Hola, soy Ana"), false);
  assert.equal(calls.length, 0);
});

test("no save for an unchanged secondary-locale overlay; a real edit still saves", async () => {
  const { deps, calls } = fakeDeps({ text: "Hola" }, { en: { text: "Hello" } });
  const target = { id: "n1", propKey: "text", locale: "en" } as never;
  assert.equal(await runCommitBuilderNodeText(deps, target, "Hola", "Hello"), false);
  assert.equal(calls.length, 0);
  assert.equal(await runCommitBuilderNodeText(deps, target, "Hello", "Hello there"), true);
  assert.equal(calls.length, 1);
});
