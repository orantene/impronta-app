/**
 * Auto notes (Template Factory publish): one EN + ES sentence per item type,
 * no em dashes, deterministic, and the release manager sees no missing notes.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { itemsMissingNotes } from "../manager/items";
import type { ReleaseItem } from "../types";
import { autoNotes, maybePolish, sectionName } from "./auto-notes";

const ITEMS: ReleaseItem[] = [
  { id: "token-default:type.section-title-size", type: "token-default", key: "type.section-title-size", detail: { from: "48px", to: "44px" } },
  { id: "token-default:type.footer-title-size", type: "token-default", key: "type.footer-title-size", detail: { from: "60px", to: null } },
  { id: "variant-default:home:hero", type: "variant-default", tree: "home", key: "home:hero", detail: { paths: ["style.padding"] } },
  { id: "new-block:home:faq", type: "new-block", tree: "home", key: "home:faq" },
  { id: "layout:home:hero/eyebrow", type: "layout", tree: "home", key: "home:hero/eyebrow", detail: { layout: "nested-new" } },
  { id: "layout:home:about:removed", type: "layout", tree: "home", key: "home:about", detail: { layout: "removed" } },
  { id: "layout:home:(root):order", type: "layout", tree: "home", key: "home:(root)", detail: { layout: "order" } },
  { id: "layout:home:services:order", type: "layout", tree: "home", key: "home:services", detail: { layout: "order" } },
  { id: "layout:shell:header:kind", type: "layout", tree: "shell", key: "shell:header", detail: { layout: "kind" } },
  {
    id: "layout:home:gallery",
    type: "layout",
    tree: "home",
    key: "home:gallery",
    swap: { from: "grid", to: "gallery" },
    group: "swap:home:grid>gallery",
    detail: { layout: "nested-new" },
  },
  { id: "code:1", type: "code", key: "code:1" },
  { id: "critical:home:contact", type: "critical", tree: "home", key: "home:contact" },
];

test("every item type gets a plain EN and ES note, no em dash", () => {
  const out = autoNotes({ designTitle: "Folio", items: ITEMS });
  assert.equal(out.items.length, ITEMS.length);
  for (const item of out.items) {
    const id = item.id!;
    const n = out.byItemId[id]!;
    assert.ok(n.en.trim().length > 10, `${id} en`);
    assert.ok(n.es.trim().length > 10, `${id} es`);
    assert.notEqual(n.en, n.es, `${id} es is translated`);
    for (const s of [n.en, n.es]) {
      assert.doesNotMatch(s, /—|–/, `${id} has no em/en dash`);
      assert.doesNotMatch(s, /token|slot|variant|payload|undefined|null|\(root\)/i, `${id} has no jargon: ${s}`);
    }
    assert.deepEqual(item.note, n);
  }
  assert.equal(itemsMissingNotes(out.items), 0);
  assert.match(out.notes.en, /^Folio update: 12 changes/);
  assert.match(out.notes.es, /^Actualización de Folio: 12 cambios/);
});

test("labels come from the style token and section maps", () => {
  const out = autoNotes({ designTitle: "Folio", items: ITEMS });
  const tok = out.byItemId["token-default:type.section-title-size"]!;
  assert.match(tok.en, /44px by default/);
  assert.match(tok.es, /44px por defecto/);
  assert.match(out.byItemId["token-default:type.footer-title-size"]!.en, /standard setting/);
  assert.match(out.byItemId["layout:home:(root):order"]!.en, /sections of the page/);
  assert.equal(sectionName("contact", "es"), "Contacto");
  assert.equal(sectionName("about", "es"), "Sobre mí");
  assert.equal(sectionName("zzchapter_one", "en", { zzchapter_one: "Chapter" }), "Chapter");
  assert.equal(sectionName("zzchapter_one", "es", { zzchapter_one: "Chapter" }), "Capítulo");
});

test("deterministic, and an authored note is kept", () => {
  const a = autoNotes({ designTitle: "Folio", items: ITEMS });
  const b = autoNotes({ designTitle: "Folio", items: ITEMS });
  assert.deepEqual(a, b);
  const authored = autoNotes({
    designTitle: "Folio",
    items: [{ ...ITEMS[0]!, note: { en: "Mine.", es: "Mía." } }],
  });
  assert.deepEqual(authored.items[0]!.note, { en: "Mine.", es: "Mía." });
});

test("polish hook falls back to the deterministic notes", async () => {
  const base = autoNotes({ designTitle: "Folio", items: ITEMS });
  assert.equal(await maybePolish(base), base);
  assert.equal(
    await maybePolish(base, {
      polishNotes: async () => {
        throw new Error("x");
      },
    }),
    base,
  );
  assert.equal(await maybePolish(base, { polishNotes: async (n) => ({ ...n, byItemId: {} }) }), base);
});
