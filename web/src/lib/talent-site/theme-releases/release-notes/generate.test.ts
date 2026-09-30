/**
 * Theme releases: generated items include authored code notes, prefilled notes,
 * and ONE grouped layout item for the hero inset.
 */
import test from "node:test";
import assert from "node:assert/strict";

import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { buildMaisonV2Payload } from "../../theme-catalog/collection/designs";
import type { DesignPayload } from "../../theme-catalog/types";
import { makeAllow } from "../policy";
import { MAISON_V2_RELEASE_2_1 } from "./maison-v2";
import { generateReleaseItems, groupLayoutItems, releaseNotesFor } from "./index";

/** The pre-2.1 payload rebuilt from the current one (the 2.1 changes reverted). */
function prev21(next: DesignPayload): DesignPayload {
  const prev = JSON.parse(JSON.stringify(next)) as DesignPayload;
  prev.homeTree = prev.homeTree.filter((n) => (n.props as Record<string, unknown>).slotKey !== "before_after");
  const visit = (nodes: BuilderNode[]) => {
    for (const n of nodes) {
      const p = n.props as Record<string, unknown>;
      if (p.slotKey === "hero_inset_bl") {
        delete p.slotKey;
        const style = p.style as Record<string, unknown>;
        delete style.left;
        delete style.bottom;
        Object.assign(style, { right: "-26px", top: "38px", width: "34%" });
      }
      visit(((n as { children?: BuilderNode[] }).children ?? []) as BuilderNode[]);
    }
  };
  visit(prev.homeTree);
  delete prev.tokenDefaults!["layout.menu-row-gap"];
  return prev;
}

test("the module is found by design + version, and only then", () => {
  assert.equal(releaseNotesFor("maison-v2", 15), MAISON_V2_RELEASE_2_1);
  assert.equal(releaseNotesFor("maison-v2", 16), null);
  assert.equal(releaseNotesFor("folio", 15), null);
});

test("Maison v2 2.1: code item appears, notes are prefilled, hero inset is ONE layout item", () => {
  const next = buildMaisonV2Payload();
  const { items, notes } = generateReleaseItems(
    "maison-v2",
    { payload: prev21(next), version: 14 },
    { payload: next, version: 15 },
  );
  const by = (t: string) => items.filter((i) => i.type === t);
  assert.equal(by("code").length, 1, "the code note reaches the release items");
  assert.match(by("code")[0]!.note!.en!, /narrow phones/);
  assert.equal(by("new-block").length, 1);
  assert.equal(by("token-default").length, 1);
  const layout = by("layout");
  assert.equal(layout.length, 1, "two layout candidates collapse into one talent-facing item");
  assert.equal(layout[0]!.keys?.length, 2);
  // Every item has EN + ES notes and the release carries its summary.
  for (const i of items) assert.ok(i.note?.en && i.note?.es, `missing note for ${i.id}`);
  assert.equal(notes.en, MAISON_V2_RELEASE_2_1.notes.en);
  assert.equal(notes.es, MAISON_V2_RELEASE_2_1.notes.es);
  // The merge allows BOTH keys through the one item.
  const allow = makeAllow(items);
  for (const k of layout[0]!.keys!) assert.equal(allow("node", k.replace(/^home:/, ""), "home").ok, true, k);
});

test("no module and no diff: no items, no notes", () => {
  const p = buildMaisonV2Payload();
  const out = generateReleaseItems("folio", { payload: p, version: 1 }, { payload: p, version: 2 });
  assert.deepEqual(out, { items: [], notes: {} });
});

test("groupLayoutItems leaves the list alone when the pair is not both present", () => {
  const one = [{ id: "layout:a", type: "layout" as const, key: "home:a" }];
  assert.deepEqual(groupLayoutItems(one, ["layout:a", "layout:b"], "g"), one);
});
