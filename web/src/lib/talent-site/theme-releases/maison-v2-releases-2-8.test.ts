/**
 * Maison v2 release 2.8 (v22, "order", G-3): the default page order is the mockup's,
 * shipped as ONE opt-in layout item. A talent's page is never reordered silently and a
 * block she has (Before and after, Aftercare tips) is never removed.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { generateReleaseItems, releaseNotesFor as authoredRelease } from "./release-notes";
import { mergeDesignUpdate } from "./merge";
import type { DesignSide } from "./types";
import type { DesignPayload } from "../theme-catalog/types";
import { MAISON_V2_DEMO_STYLES } from "../theme-catalog/theme-demos";
import { validateDesign } from "../theme-catalog/validate";
import { maisonV2At, propsOf } from "./maison-v2-releases.fixtures";

/** The mockup's DOM order (`#hero`, `#s-work`, `#s-menu`, `#s-revs`, `#s-about`, `#s-faq`, `#s-loc`). */
const MOCKUP_ORDER = ["hero", "gallery", "services", "reviews", "about", "contact", "location"];
const slots = (tree: ReadonlyArray<{ props?: unknown }>) => tree.map((n) => String((n.props as Record<string, unknown>).slotKey));
const HEX = /#[0-9a-fA-F]{3,8}\b/;

const gen = () =>
  generateReleaseItems("maison-v2", { payload: maisonV2At(21), version: 21 }, { payload: maisonV2At(22), version: 22 });

test("the default page is the mockup order, and the two extra blocks are optional, not on the page", () => {
  const p = maisonV2At(22);
  assert.deepEqual(slots(p.homeTree), MOCKUP_ORDER);
  assert.deepEqual(slots(p.optionalBlocks ?? []).sort(), ["aftercare", "before_after"]);
  const v = validateDesign(p);
  assert.equal(v.ok, true, v.ok ? "" : v.errors.join("; "));
  assert.doesNotMatch(JSON.stringify(p), HEX);
  // v21 had them on the page (the fixture rebuilds that shape from code).
  assert.ok(slots(maisonV2At(21).homeTree).includes("before_after"));
});

test("v22 order: ONE opt-in layout item with EN + ES notes; removing the optional blocks is not an item", () => {
  const { items, notes } = gen();
  assert.ok(notes.en && notes.es);
  assert.deepEqual(items.map((i) => i.id), ["layout:home:(root):order"]);
  assert.equal(items[0]!.type, "layout");
  const rel = authoredRelease("maison-v2", 22)!;
  for (const i of items) {
    const n = rel.byItemId[i.id ?? ""];
    assert.ok(n?.en && n?.es, `note for ${i.id}`);
    assert.doesNotMatch(`${n.en} ${n.es}`, /—|–/);
  }
});

async function sites(extra: boolean) {
  const prev = maisonV2At(21);
  const next = maisonV2At(22);
  const { buildDesignTrees, fallbackHydrationTokens } = await import("../server/theme-apply-core");
  const tokens = { ...fallbackHydrationTokens("Valeria"), bio: "Bio", tagline: "Uñas" };
  const b = buildDesignTrees(prev, tokens, 2026, { design: "maison-v2", version: 21 });
  const t = buildDesignTrees(next, tokens, 2026, { design: "maison-v2", version: 22 });
  assert.ok(b.ok && t.ok);
  if (!b.ok || !t.ok) throw new Error("build failed");
  const side = (x: { shellTree: DesignSide["trees"][string]; homeTree: DesignSide["trees"][string] }, d: DesignPayload): DesignSide => ({
    trees: { shell: x.shellTree, home: x.homeTree },
    tokens: { ...(d.tokenDefaults ?? {}) },
  });
  void extra;
  return { base: side(b, prev), theirs: side(t, next), items: gen().items };
}
const copy = (s: DesignSide): DesignSide => ({ trees: JSON.parse(JSON.stringify(s.trees)) as DesignSide["trees"], tokens: {} });

test("an untouched v21 site keeps its order until she chooses; choosing moves the sections and keeps every block she has", async () => {
  const { base, theirs, items } = await sites(false);
  const idle = mergeDesignUpdate({ base, ours: copy(base), theirs, items: [] });
  assert.deepEqual(slots(idle.trees.home!), slots(base.trees.home!), "nothing moves without the item");

  const chosen = mergeDesignUpdate({ base, ours: copy(base), theirs, items });
  const order = slots(chosen.trees.home!);
  const listed = order.filter((s) => MOCKUP_ORDER.includes(s));
  assert.deepEqual(listed, MOCKUP_ORDER, "the sections the design lists follow the mockup order");
  for (const keep of ["before_after", "aftercare"]) assert.ok(order.includes(keep), `${keep} is kept`);
  assert.equal(chosen.report.conflicts.length, 0);
});

test("a talent who reordered her own page keeps her order", async () => {
  const { base, theirs, items } = await sites(false);
  const mine = copy(base);
  const home = mine.trees.home!;
  [home[1], home[2]] = [home[2]!, home[1]!];
  const before = slots(home);
  const r = mergeDesignUpdate({ base, ours: mine, theirs, items });
  assert.deepEqual(slots(r.trees.home!), before, "her order is kept");
});

test("Alba follows the default: no custom order and no extra blocks for her", () => {
  assert.equal(MAISON_V2_DEMO_STYLES["TAL-93020"], undefined);
  for (const [code, style] of Object.entries(MAISON_V2_DEMO_STYLES)) {
    assert.equal(style.order.length, 6, `${code} lists the six sections`);
  }
  void propsOf;
});
