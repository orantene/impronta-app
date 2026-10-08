import assert from "node:assert/strict";
import { test } from "node:test";

import { acceptEnglish, type AddEnglishDeps } from "./add-english-core";
import {
  collectMissingEnglish,
  withEnglishCaption,
  withEnglishMap,
  type MissingEnglishKind,
} from "./missing-english";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

test("collects captions, service titles, categories and ticker items with no English", () => {
  const out = collectMissingEnglish({
    primary: "es",
    photos: [
      { id: "p1", metadata: { caption: "Pestañas" } },
      { id: "p2", metadata: { caption: "Cejas", caption_i18n: { en: "Brows" } } },
      { id: "p3", metadata: { alt_i18n: { en: "x" } } },
    ],
    offerings: [
      { id: "o1", title: "Lifting de pestañas", category: "Mirada única", title_i18n: null, category_i18n: null },
      { id: "o2", title: "Tinte", category: "Mirada única", title_i18n: { es: "Tinte", en: "Tint" }, category_i18n: { en: "Unique look" } },
    ],
    marquees: [{ id: "m1", items: [{ text: "Tinte" }, { text: "Cejas" }], i18n: { en: { "items.1.text": "Brows" } } }],
  });
  assert.deepEqual(
    out.map((f) => `${f.kind}:${f.id}:${f.path}`),
    ["photo_caption:p1:", "service_title:o1:", "service_category:o1:", "ticker_item:m1:items.0.text"],
  );
  assert.equal(out[0]!.source, "Pestañas");
});

test("an English primary has nothing to add", () => {
  const out = collectMissingEnglish({
    primary: "en",
    photos: [{ id: "p1", metadata: { caption: "Lashes" } }],
    offerings: [],
  });
  assert.deepEqual(out, []);
});

test("a standard trade category already has platform English and is not listed", () => {
  const out = collectMissingEnglish({
    primary: "es",
    photos: [],
    offerings: [{ id: "o1", title: null, category: "Pestañas", title_i18n: null, category_i18n: null }],
  });
  assert.deepEqual(out, []);
});

test("a value that is not a plain text map is left alone, never listed or rewritten", () => {
  const out = collectMissingEnglish({
    primary: "es",
    photos: [],
    offerings: [{ id: "o1", title: "Tinte", category: null, title_i18n: { es: 5 }, category_i18n: null }],
  });
  assert.deepEqual(out, []);
  assert.equal(withEnglishMap({ es: 5 }, "Tint"), null);
});

test("withEnglishMap adds only en, keeps es and other keys, and never overwrites en", () => {
  assert.deepEqual(withEnglishMap({ es: "Tinte", fr: "Teinte" }, "Tint"), { es: "Tinte", fr: "Teinte", en: "Tint" });
  assert.deepEqual(withEnglishMap(null, "Tint"), { en: "Tint" });
  assert.equal(withEnglishMap({ es: "Tinte", en: "Dye" }, "Tint"), null);
  assert.equal(withEnglishMap({ es: "Tinte" }, "   "), null);
});

test("withEnglishCaption touches only caption_i18n.en", () => {
  const meta = { caption: "Hola", albumId: "a", caption_i18n: { fr: "Salut" }, alt_i18n: { en: "Beach" } };
  assert.deepEqual(withEnglishCaption(meta, "Hello"), {
    caption: "Hola",
    albumId: "a",
    caption_i18n: { fr: "Salut", en: "Hello" },
    alt_i18n: { en: "Beach" },
  });
  assert.equal(withEnglishCaption({ caption_i18n: { en: "Hi" } }, "Hello"), null);
  assert.deepEqual(withEnglishCaption(null, "Hello"), { caption_i18n: { en: "Hello" } });
});

function makeDeps(stored: Record<string, unknown>) {
  const writes: Array<{ kind: MissingEnglishKind; id: string; value: unknown }> = [];
  const deps: AddEnglishDeps = {
    readStored: async (_kind, id) => (id in stored ? { stored: stored[id] } : null),
    writeStored: async (kind, id, value) => {
      writes.push({ kind, id, value });
      return true;
    },
  };
  return { deps, writes };
}

test("acceptEnglish writes the en key only", async () => {
  const { deps, writes } = makeDeps({ [A]: { es: "Tinte" } });
  const res = await acceptEnglish(deps, { kind: "service_title", id: A, text: "  Tint  " });
  assert.deepEqual(res, { ok: true, text: "Tint" });
  assert.deepEqual(writes, [{ kind: "service_title", id: A, value: { es: "Tinte", en: "Tint" } }]);
});

test("acceptEnglish refuses to overwrite a non-empty en", async () => {
  const { deps, writes } = makeDeps({ [A]: { es: "Tinte", en: "Dye" } });
  const res = await acceptEnglish(deps, { kind: "service_title", id: A, text: "Tint" });
  assert.deepEqual(res, { ok: false, code: "already_has_english" });
  assert.equal(writes.length, 0);
});

test("acceptEnglish treats another talent's row as not found and writes nothing", async () => {
  const { deps, writes } = makeDeps({ [A]: { caption: "Hola" } });
  const res = await acceptEnglish(deps, { kind: "photo_caption", id: B, text: "Hello" });
  assert.deepEqual(res, { ok: false, code: "not_found" });
  assert.equal(writes.length, 0);
});

test("acceptEnglish rejects bad input and the unwired ticker kind", async () => {
  const { deps, writes } = makeDeps({ [A]: {} });
  assert.deepEqual(await acceptEnglish(deps, { kind: "service_title", id: "nope", text: "x" }), { ok: false, code: "invalid" });
  assert.deepEqual(await acceptEnglish(deps, { kind: "service_title", id: A, text: "   " }), { ok: false, code: "invalid" });
  assert.deepEqual(await acceptEnglish(deps, { kind: "ticker_item", id: A, text: "x" }), { ok: false, code: "unsupported" });
  assert.equal(writes.length, 0);
});

test("acceptEnglish writes a photo caption into metadata.caption_i18n.en", async () => {
  const { deps, writes } = makeDeps({ [A]: { caption: "Hola" } });
  const res = await acceptEnglish(deps, { kind: "photo_caption", id: A, text: "Hello" });
  assert.equal(res.ok, true);
  assert.deepEqual(writes[0]!.value, { caption: "Hola", caption_i18n: { en: "Hello" } });
});
