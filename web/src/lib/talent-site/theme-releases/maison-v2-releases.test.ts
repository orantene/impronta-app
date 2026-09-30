/**
 * Maison v2 releases after 2.1: each release is rebuilt from code (the newest
 * payload with later releases reverted) and must classify exactly as authored,
 * carry an EN/ES note per generated item, and merge safely into a real site.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { diffDesignPayloads, type CandidateItem } from "./diff-payload";
import { mergeDesignUpdate } from "./merge";
import { generateReleaseItems, releaseNotesFor as authoredRelease, withAuthoredNotes } from "./release-notes";
import type { DesignSide } from "./types";
import type { DesignPayload } from "../theme-catalog/types";
import {
  findByKind,
  findBySlot,
  maisonV2At,
  propsOf,
} from "./maison-v2-releases.fixtures";

const HEX = /#[0-9a-fA-F]{3,8}\b/;

const diff = (from: DesignPayload, fromV: number, to: DesignPayload, toV: number, code: ReadonlyArray<{ en?: string; es?: string }> = []) =>
  diffDesignPayloads("maison-v2", { payload: from, version: fromV }, { payload: to, version: toV }, code);

const types = (items: CandidateItem[], t: string) => items.filter((i) => i.type === t);

function assertNotesFor(items: CandidateItem[], toVersion: number) {
  const rel = authoredRelease("maison-v2", toVersion);
  assert.ok(rel, `no authored release for v${toVersion}`);
  assert.ok(rel.notes.en && rel.notes.es, "release summary needs EN and ES");
  for (const i of items.filter((x) => x.type !== "code")) {
    const note = rel.byItemId[i.id ?? ""];
    assert.ok(note?.en && note?.es, `missing EN/ES note for ${i.id}`);
    assert.doesNotMatch(`${note.en} ${note.es}`, /—|–/, `dash in note for ${i.id}`);
    assert.doesNotMatch(`${note.en} ${note.es}`, HEX);
  }
  // No stale note: every authored id is a real candidate.
  for (const id of Object.keys(rel.byItemId)) {
    assert.ok(items.some((i) => i.id === id), `authored note ${id} matches no generated item`);
  }
}

/** The base and theirs sides of a site pinned at `from`, moving to `to`. */
async function siteSides(from: DesignPayload, fromV: number, to: DesignPayload, toV: number) {
  const { buildDesignTrees, fallbackHydrationTokens } = await import("../server/theme-apply-core");
  const tokens = { ...fallbackHydrationTokens("Valeria"), bio: "Bio", tagline: "Uñas" };
  const b = buildDesignTrees(from, tokens, 2026, { design: "maison-v2", version: fromV });
  const t = buildDesignTrees(to, tokens, 2026, { design: "maison-v2", version: toV });
  assert.ok(b.ok && t.ok);
  if (!b.ok || !t.ok) throw new Error("build failed");
  const side = (x: { shellTree: DesignSide["trees"][string]; homeTree: DesignSide["trees"][string] }, d: DesignPayload): DesignSide => ({
    trees: { shell: x.shellTree, home: x.homeTree },
    tokens: { ...(d.tokenDefaults ?? {}) },
  });
  return { base: side(b, from), theirs: side(t, to) };
}

/** A site whose draft holds only her own token values (defaults are inherited). */
const siteOf = (base: DesignSide, tokens: Record<string, string> = {}): DesignSide => ({
  trees: JSON.parse(JSON.stringify(base.trees)) as DesignSide["trees"],
  tokens,
});

// ── Release 2.2 (v16, round 2): defaults only ───────────────────────────────

test("Maison v2 v16 classifies as token defaults + one variant default, nothing opt-in", () => {
  const next = maisonV2At(16);
  const items = diff(maisonV2At(15), 15, next, 16);
  assert.deepEqual(
    items.map((i) => i.id).sort(),
    ["token-default:button.padding-x", "token-default:type.display-tracking", "variant-default:home:reviews/reviews"],
  );
  assert.equal(types(items, "token-default").length, 2);
  assert.equal(types(items, "variant-default").length, 1);
  assert.deepEqual(types(items, "variant-default")[0]!.paths, ["limit", "showArrows"]);
  for (const t of ["new-block", "layout", "critical", "code"]) assert.equal(types(items, t).length, 0, `no ${t} in round 2`);
  assertNotesFor(items, 16);
});

test("Maison v2 v16 auto-improves untouched parts and keeps talent edits", async () => {
  const next = maisonV2At(16);
  const prev = maisonV2At(15);
  const { base, theirs } = await siteSides(prev, 15, next, 16);
  const items = diff(prev, 15, next, 16);

  // Untouched site: tokens are inherited at render, the reviews default lands.
  const clean = mergeDesignUpdate({ base, ours: siteOf(base), theirs, items });
  const inherited = clean.report.applied.filter((e) => e.change === "token").map((e) => e.key).sort();
  assert.deepEqual(inherited, ["button.padding-x", "type.display-tracking"]);
  const reviews = findByKind(clean.trees.home!, "reviews")!;
  assert.equal(propsOf(reviews).showArrows, true);
  assert.equal(propsOf(reviews).limit, 9);
  assert.equal(clean.report.conflicts.length, 0);

  // The talent set her own button padding and edited her reviews: both are kept.
  const ours = siteOf(base, { "button.padding-x": "40px" });
  propsOf(findByKind(ours.trees.home!, "reviews")!).limit = 3;
  const kept = mergeDesignUpdate({ base, ours, theirs, items });
  assert.equal(kept.tokens["button.padding-x"], "40px", "her own padding wins");
  assert.equal(propsOf(findByKind(kept.trees.home!, "reviews")!).limit, 3, "her own limit wins");
  assert.ok(kept.report.kept.some((e) => e.key === "button.padding-x"));
  assert.ok(kept.report.kept.some((e) => e.key === "reviews/reviews"));
});

// ── Release 2.3 (v17, round 3): opt-in layout + critical fix ────────────────

const LAYOUT_PAIR = ["layout:home:services/services_catalog:removed", "layout:home:services/services_two_col"];
const CRITICAL_ID = "variant-default:home:contact/paragraph";
const CRITICAL_BA = "variant-default:home:before_after/paragraph";

test("Maison v2 v17 classifies as one opt-in layout change plus the contact fix", () => {
  const items = diff(maisonV2At(16), 16, maisonV2At(17), 17);
  assert.deepEqual(items.map((i) => i.id).sort(), [...LAYOUT_PAIR, CRITICAL_ID, CRITICAL_BA].sort());
  assert.deepEqual(types(items, "layout").map((i) => i.layout).sort(), ["nested-new", "removed"]);
  assert.equal(types(items, "variant-default").length, 2);
  for (const i of types(items, "variant-default")) assert.deepEqual(i.paths, ["style.textColor"]);
  for (const t of ["new-block", "token-default"]) assert.equal(types(items, t).length, 0, `no ${t} in round 3`);
  assertNotesFor(items, 17);
});

test("Maison v2 v17: the contact fix is marked critical and names the band and its eyebrow", () => {
  const rel = authoredRelease("maison-v2", 17)!;
  const items = withAuthoredNotes(diff(maisonV2At(16), 16, maisonV2At(17), 17), rel);
  const crit = items.filter((i) => i.type === "critical");
  assert.equal(crit.length, 2);
  const contact = crit.find((i) => i.id === CRITICAL_ID)!;
  assert.deepEqual(contact.keys, ["contact", "contact/paragraph"]);
  // The optional block names only its eyebrow: a removed block stays removed.
  assert.deepEqual(crit.find((i) => i.id === CRITICAL_BA)!.keys, ["before_after/paragraph"]);
  for (const c of crit) assert.ok(c.note?.en && c.note?.es);
  assert.equal(items.filter((i) => i.type === "layout").length, 2, "the layout pair stays opt-in");
});

async function v17Site() {
  const prev = maisonV2At(16);
  const next = maisonV2At(17);
  const { base, theirs } = await siteSides(prev, 16, next, 17);
  const items = withAuthoredNotes(diff(prev, 16, next, 17), authoredRelease("maison-v2", 17)!);
  return { base, theirs, items };
}

const eyebrowOf = (home: DesignSide["trees"][string]) => {
  const contact = findBySlot(home, "contact")!;
  const para = ((contact as { children?: Array<{ kind: string; props: Record<string, unknown> }> }).children ?? []).find((c) => c.kind === "paragraph");
  return para ? ((para.props.style as Record<string, unknown>).textColor as string) : undefined;
};

test("Maison v2 v17: the critical fix reaches an untouched, an edited and a removed contact band", async () => {
  const { base, theirs, items } = await v17Site();
  const fixed = "token:color.ink";

  const clean = mergeDesignUpdate({ base, ours: siteOf(base), theirs, items });
  assert.equal(eyebrowOf(clean.trees.home!), fixed);

  // She restyled the eyebrow herself: the critical item forces the fix anyway.
  const edited = siteOf(base);
  const editedPara = ((findBySlot(edited.trees.home!, "contact") as unknown as { children: Array<{ kind: string; props: Record<string, unknown> }> }).children).find((c) => c.kind === "paragraph")!;
  (editedPara.props.style as Record<string, unknown>).textColor = "token:color.muted";
  const forced = mergeDesignUpdate({ base, ours: edited, theirs, items });
  assert.equal(eyebrowOf(forced.trees.home!), fixed);
  assert.ok(forced.report.applied.some((e) => e.key === "contact/paragraph" && e.reason === "critical"));

  // She deleted the whole contact band: the critical item names it, so it returns with the fix.
  const removed = siteOf(base);
  removed.trees.home = removed.trees.home!.filter((n) => propsOf(n).slotKey !== "contact");
  const restored = mergeDesignUpdate({ base, ours: removed, theirs, items });
  assert.equal(eyebrowOf(restored.trees.home!), fixed, "removed band restored with the fix");
  assert.ok(restored.report.applied.some((e) => e.change === "restore" && e.key === "contact"));

  // Control: the same change as a plain (non-critical) variant default leaves a removed band removed.
  const plain = items.map((i) => (i.id === CRITICAL_ID ? { ...i, type: "variant-default" as const, keys: undefined } : i));
  const stays = mergeDesignUpdate({ base, ours: removed, theirs, items: plain });
  assert.equal(findBySlot(stays.trees.home!, "contact"), undefined, "without critical it stays removed");
});

test("Maison v2 v17: the services layout is opt-in and needs both halves of the pair", async () => {
  const { base, theirs, items } = await v17Site();
  const servicesKinds = (home: DesignSide["trees"][string]) => {
    const out: string[] = [];
    const visit = (nodes: ReadonlyArray<unknown>) => {
      for (const n of nodes as Array<{ kind: string; props: Record<string, unknown>; children?: unknown[] }>) {
        if (n.kind === "services_catalog") out.push(`${String(n.props.slotKey ?? "catalog")}:${String(n.props.layout)}`);
        visit(n.children ?? []);
      }
    };
    visit(home);
    return out;
  };

  // The critical fix alone does not touch the services layout.
  const only = mergeDesignUpdate({ base, ours: siteOf(base), theirs, items: items.filter((i) => i.type === "critical") });
  assert.deepEqual(servicesKinds(only.trees.home!), ["catalog:rows"]);

  // Choosing the layout pair swaps the catalog for the two-column one.
  const chosen = mergeDesignUpdate({ base, ours: siteOf(base), theirs, items: items.filter((i) => i.type === "layout") });
  assert.deepEqual(servicesKinds(chosen.trees.home!), ["services_two_col:cards"]);
});

test("Maison v2 v17 through the one generator: layout pair grouped, notes filled, critical marked", () => {
  const { items, notes } = generateReleaseItems(
    "maison-v2",
    { payload: maisonV2At(16), version: 16 },
    { payload: maisonV2At(17), version: 17 },
  );
  assert.ok(notes.en && notes.es);
  const layout = items.filter((i) => i.type === "layout");
  assert.equal(layout.length, 1, "the pair is ONE talent-facing layout item");
  assert.deepEqual([...(layout[0]!.keys ?? [])].sort(), ["home:services/services_catalog", "home:services/services_two_col"]);
  assert.ok(layout[0]!.note?.en && layout[0]!.note?.es);
  const crit = items.filter((i) => i.type === "critical");
  assert.equal(crit.length, 2);
  for (const c of crit) assert.ok(c.note?.en && c.note?.es && c.keys?.length);
});

test("Maison v2 v17: the generated (grouped) layout item swaps atomically, even over an edited catalog", async () => {
  const prev = maisonV2At(16);
  const next = maisonV2At(17);
  const { base, theirs } = await siteSides(prev, 16, next, 17);
  const { items } = generateReleaseItems("maison-v2", { payload: prev, version: 16 }, { payload: next, version: 17 });
  const ours = siteOf(base);
  propsOf(findByKind(ours.trees.home!, "services_catalog")!).eyebrow = "Mine";
  const r = mergeDesignUpdate({ base, ours, theirs, items: items.filter((i) => i.type === "layout") });
  let catalogs = 0;
  const visit = (nodes: ReadonlyArray<{ kind: string; children?: unknown[] }>) => {
    for (const n of nodes) {
      if (n.kind === "services_catalog") catalogs += 1;
      visit((n.children ?? []) as Array<{ kind: string; children?: unknown[] }>);
    }
  };
  visit(r.trees.home as never);
  assert.equal(catalogs, 1, "never two catalogs");
});

// ── Release 2.4 (v18, round 4): new optional block + reorder ────────────────

const slotOrder = (home: DesignSide["trees"][string]) => home.map((n) => String(propsOf(n).slotKey));

async function v18Site() {
  const prev = maisonV2At(17);
  const next = maisonV2At(18);
  const { base, theirs } = await siteSides(prev, 17, next, 18);
  const items = withAuthoredNotes(diff(prev, 17, next, 18), authoredRelease("maison-v2", 18)!);
  return { base, theirs, items };
}

test("Maison v2 v18 classifies as one new block plus one reorder, nothing automatic", () => {
  const items = diff(maisonV2At(17), 17, maisonV2At(18), 18);
  assert.deepEqual(items.map((i) => i.id).sort(), ["layout:home:(root):order", "new-block:home:aftercare"]);
  assert.equal(types(items, "new-block")[0]!.key, "home:aftercare");
  assert.equal(types(items, "layout")[0]!.layout, "order");
  // The block's own children ride with the new-block item.
  assert.ok(!items.some((i) => i.key.startsWith("home:aftercare/")));
  for (const t of ["token-default", "variant-default", "critical", "code"]) assert.equal(types(items, t).length, 0, `no ${t} in round 4`);
  assertNotesFor(items, 18);
});

test("Maison v2 v18: the new block and the reorder are opt-in, each on its own", async () => {
  const { base, theirs, items } = await v18Site();
  const before = slotOrder(base.trees.home!);
  assert.ok(before.indexOf("gallery") < before.indexOf("reviews"), "v17 has the gallery above reviews");
  assert.ok(!before.includes("aftercare"));

  // Nothing chosen: nothing changes.
  const none = mergeDesignUpdate({ base, ours: siteOf(base), theirs, items: [] });
  assert.deepEqual(slotOrder(none.trees.home!), before);

  // Only the block: it is inserted, the order stays.
  const block = mergeDesignUpdate({ base, ours: siteOf(base), theirs, items: items.filter((i) => i.type === "new-block") });
  const b = slotOrder(block.trees.home!);
  assert.ok(b.includes("aftercare"));
  assert.ok(b.indexOf("gallery") < b.indexOf("reviews"), "block alone does not reorder");
  assert.ok(block.report.added.some((e) => e.key === "aftercare"));

  // Only the reorder: reviews move above the gallery, no block appears.
  const order = mergeDesignUpdate({ base, ours: siteOf(base), theirs, items: items.filter((i) => i.type === "layout") });
  const o = slotOrder(order.trees.home!);
  assert.ok(o.indexOf("reviews") < o.indexOf("gallery"), "reviews above gallery");
  assert.ok(!o.includes("aftercare"));

  // Both: the final order matches the new design.
  const both = mergeDesignUpdate({ base, ours: siteOf(base), theirs, items });
  assert.deepEqual(slotOrder(both.trees.home!), slotOrder(theirs.trees.home!));
});

test("Maison v2 v18: a talent who reordered her own page keeps her order", async () => {
  const { base, theirs, items } = await v18Site();
  const ours = siteOf(base);
  // She moved the menu to the very top of her page.
  const menuAt = ours.trees.home!.findIndex((n) => propsOf(n).slotKey === "services");
  const [menu] = ours.trees.home!.splice(menuAt, 1);
  ours.trees.home!.unshift(menu!);
  const mine = slotOrder(ours.trees.home!);
  const r = mergeDesignUpdate({ base, ours, theirs, items: items.filter((i) => i.type === "layout") });
  assert.deepEqual(slotOrder(r.trees.home!), mine, "her order is kept");
  assert.ok(r.report.kept.some((e) => e.change === "order" || e.reason === "your_order"));
});

// ── Release 2.5 (v19, "look only"): automatic defaults + two opt-in layout items ──

const V19_TOKENS = [
  "token-default:layout.header-pad-y",
  "token-default:layout.header-pad-y-phone",
  "token-default:layout.section-pad-bottom",
  "token-default:layout.section-pad-bottom-phone",
  "token-default:layout.section-pad-top",
  "token-default:layout.section-pad-top-phone",
  "token-default:shape.chrome",
];
const V19_VARIANTS = [
  "variant-default:home:aftercare",
  "variant-default:home:about",
  "variant-default:home:before_after",
  "variant-default:home:contact",
  "variant-default:home:gallery/marquee",
  "variant-default:home:gallery/portfolio",
  "variant-default:home:hero/container#2/next_free_chip",
  "variant-default:home:reviews",
  "variant-default:home:services",
  "variant-default:home:visit",
  "variant-default:shell:header",
];
const V19_LAYOUT_PAIR = ["layout:home:services/services_two_col:removed", "layout:home:services/services_row_cards"];
const V19_ABOUT_ACTIONS = "layout:home:about/container/about_actions";

test("Maison v2 v19 classifies: token + variant defaults are automatic, the menu swap and About actions are opt-in", () => {
  const items = diff(maisonV2At(18), 18, maisonV2At(19), 19);
  assert.deepEqual(
    items.map((i) => i.id).sort(),
    [...V19_TOKENS, ...V19_VARIANTS, ...V19_LAYOUT_PAIR, V19_ABOUT_ACTIONS].sort(),
  );
  assert.equal(types(items, "token-default").length, V19_TOKENS.length);
  assert.equal(types(items, "variant-default").length, V19_VARIANTS.length);
  assert.deepEqual(types(items, "layout").map((i) => i.layout).sort(), ["nested-new", "nested-new", "removed"]);
  for (const t of ["new-block", "critical", "code"]) assert.equal(types(items, t).length, 0, `no ${t} in 2.5`);
  // The soft chrome switch and the option values ride as plain defaults.
  const byId = new Map(items.map((i) => [i.id, i]));
  assert.deepEqual(byId.get("token-default:shape.chrome")!.detail, { from: null, to: "soft" });
  assert.deepEqual(byId.get("variant-default:home:gallery/portfolio")!.paths, [
    "cardStyle",
    "style.paddingBottom",
    "style.paddingTop",
    "style.responsive.mobile.paddingBottom",
    "style.responsive.mobile.paddingTop",
  ]);
  assert.deepEqual(byId.get("variant-default:home:hero/container#2/next_free_chip")!.paths, ["href"]);
  assertNotesFor(items, 19);
});

test("Maison v2 v19 through the one generator: menu pair grouped into ONE item, every note EN + ES", () => {
  const { items, notes } = generateReleaseItems(
    "maison-v2",
    { payload: maisonV2At(18), version: 18 },
    { payload: maisonV2At(19), version: 19 },
  );
  assert.ok(notes.en && notes.es);
  const layout = items.filter((i) => i.type === "layout");
  assert.equal(layout.length, 2, "menu swap (one grouped item) + About actions");
  const swap = layout.find((i) => i.id === "layout:maison-v2:services-row-cards")!;
  assert.deepEqual([...(swap.keys ?? [])].sort(), ["home:services/services_row_cards", "home:services/services_two_col"]);
  for (const i of items) assert.ok(i.note?.en && i.note?.es, `note for ${i.id}`);
});

async function v19Site() {
  const prev = maisonV2At(18);
  const next = maisonV2At(19);
  const { base, theirs } = await siteSides(prev, 18, next, 19);
  const items = withAuthoredNotes(diff(prev, 18, next, 19), authoredRelease("maison-v2", 19)!);
  return { base, theirs, items };
}

const catalogOf = (home: DesignSide["trees"][string]) => propsOf(findByKind(home, "services_catalog")!);

test("Maison v2 v19: an untouched site gets the automatic defaults and none of the opt-in layout items", async () => {
  const { base, theirs, items } = await v19Site();
  const auto = items.filter((i) => i.type === "token-default" || i.type === "variant-default");
  const r = mergeDesignUpdate({ base, ours: siteOf(base), theirs, items: auto });
  assert.equal(r.report.conflicts.length, 0);
  const portfolio = propsOf(findByKind(r.trees.home!, "portfolio")!);
  assert.equal(portfolio.cardStyle, "framed");
  assert.equal((portfolio.style as Record<string, unknown>).paddingTop, "88px");
  assert.equal(propsOf(findByKind(r.trees.home!, "next_free_chip")!).href, "#services");
  // The menu is still the 2.3 cards and the About section has no actions yet.
  assert.equal(catalogOf(r.trees.home!).layout, "cards");
  assert.equal(catalogOf(r.trees.home!).slotKey, "services_two_col");
  assert.equal(findBySlot(r.trees.home!, "about_actions"), undefined);
  // The soft chrome switch is inherited (a token default), not written into the draft.
  assert.ok(r.report.applied.some((e) => e.change === "token" && e.key === "shape.chrome"));
});

test("Maison v2 v19: choosing the menu swap and the About actions applies them, each on its own", async () => {
  const { base, theirs, items } = await v19Site();
  const layout = items.filter((i) => i.type === "layout");
  const swapOnly = mergeDesignUpdate({ base, ours: siteOf(base), theirs, items: layout.filter((i) => i.id !== V19_ABOUT_ACTIONS) });
  assert.equal(catalogOf(swapOnly.trees.home!).layout, "rows");
  assert.equal(catalogOf(swapOnly.trees.home!).rowStyle, "card");
  assert.equal(catalogOf(swapOnly.trees.home!).slotKey, "services_row_cards");
  assert.equal(findBySlot(swapOnly.trees.home!, "about_actions"), undefined, "swap alone adds no About actions");
  const actionsOnly = mergeDesignUpdate({ base, ours: siteOf(base), theirs, items: layout.filter((i) => i.id === V19_ABOUT_ACTIONS) });
  assert.ok(findBySlot(actionsOnly.trees.home!, "about_actions"), "About actions inserted");
  assert.equal(catalogOf(actionsOnly.trees.home!).layout, "cards", "actions alone do not swap the menu");
});

test("Maison v2 v19: a talent's own edits win over the automatic defaults", async () => {
  const { base, theirs, items } = await v19Site();
  const ours = siteOf(base, { "shape.chrome": "flat" });
  propsOf(findByKind(ours.trees.home!, "portfolio")!).limit = 3;
  const auto = items.filter((i) => i.type === "token-default" || i.type === "variant-default");
  const r = mergeDesignUpdate({ base, ours, theirs, items: auto });
  assert.equal(r.tokens["shape.chrome"], "flat", "her own card look wins");
  assert.equal(propsOf(findByKind(r.trees.home!, "portfolio")!).limit, 3, "her own limit is kept");
  assert.ok(r.report.kept.some((e) => e.key === "gallery/portfolio"));
});

test("Maison v2 v19 payload: every new option is set, tokens only, no hex", () => {
  const home = maisonV2At(19).homeTree;
  assert.equal(propsOf(findByKind(home, "portfolio")!).cardStyle, "framed");
  assert.equal(propsOf(findByKind(home, "services_catalog")!).rowStyle, "card");
  assert.equal(propsOf(findByKind(home, "next_free_chip")!).href, "#services");
  assert.doesNotMatch(JSON.stringify(maisonV2At(19)), HEX);
  assert.equal(maisonV2At(19).tokenDefaults!["shape.chrome"], "soft");
});

// ── Release 2.6 (v20, slice "chrome"): header switcher + help bubble default ─

const headerOf = (trees: DesignSide["trees"]) =>
  trees.shell!.find((n) => propsOf(n).sectionTypeKey === "site_header")!;
const centerTypes = (trees: DesignSide["trees"]) =>
  (((propsOf(headerOf(trees)).sectionProps as { regions: { center: Array<{ type: string }> } }).regions.center) ?? []).map(
    (i) => i.type,
  );

test("Maison v2 v20 classifies as one header default plus the opt-in Location block (chat and dock ride as code notes)", () => {
  const items = diff(maisonV2At(19), 19, maisonV2At(20), 20);
  assert.deepEqual(items.map((i) => i.id).sort(), ["new-block:home:location", "variant-default:shell:header"]);
  assert.deepEqual(types(items, "variant-default")[0]!.paths, ["sectionProps.regions.center"]);
  for (const t of ["layout", "critical"]) assert.equal(types(items, t).length, 0, `no ${t} in 2.6`);
  assertNotesFor(items, 20);
  // The platform chat and dock changes ride as code notes (EN + ES, no dashes).
  const rel = authoredRelease("maison-v2", 20)!;
  assert.ok(rel.codeNotes.length >= 1);
  for (const n of rel.codeNotes) {
    assert.ok(n.en && n.es);
    assert.doesNotMatch(`${n.en} ${n.es}`, /—|–/);
  }
});

test("Maison v2 v20: the payload carries the switcher phone-only, and v19 does not", () => {
  const now = maisonV2At(20);
  const before = maisonV2At(19);
  const header = now.shellTree.find((n) => propsOf(n).sectionTypeKey === "site_header")!;
  const center = (propsOf(header).sectionProps as { regions: { center: Array<Record<string, unknown>> } }).regions.center;
  const sw = center.find((i) => i.type === "section_switcher")!;
  assert.deepEqual(sw.responsive, { desktop: "hide", tablet: "hide", mobile: "show" });
  assert.equal(now.tokenDefaults!["chat.help-bubble"], undefined, "a Design token default must be a site style token");
  const old = before.shellTree.find((n) => propsOf(n).sectionTypeKey === "site_header")!;
  const oldCenter = (propsOf(old).sectionProps as { regions: { center: Array<{ type: string }> } }).regions.center;
  assert.ok(!oldCenter.some((i) => i.type === "section_switcher"));
});

test("Maison v2 v20 merge: an untouched header gains the switcher; an edited one keeps hers", async () => {
  const prev = maisonV2At(19);
  const next = maisonV2At(20);
  const { base, theirs } = await siteSides(prev, 19, next, 20);
  const items = diff(prev, 19, next, 20);

  const clean = mergeDesignUpdate({ base, ours: siteOf(base), theirs, items });
  assert.ok(centerTypes(clean.trees).includes("section_switcher"), "untouched header gets the switcher");
  assert.equal(clean.report.conflicts.length, 0);

  // She rebuilt her header centre herself: her choice wins, nothing is forced.
  const ours = siteOf(base);
  const sp = propsOf(headerOf(ours.trees)).sectionProps as { regions: { center: Array<Record<string, unknown>> } };
  sp.regions.center = [{ type: "nav" }];
  const kept = mergeDesignUpdate({ base, ours, theirs, items });
  assert.ok(!centerTypes(kept.trees).includes("section_switcher"), "her header is kept as she built it");
  assert.ok(kept.report.kept.some((e) => e.key === "header"));
});

// ── Location release (v20): one new optional block, its own separable notes ──

async function v20Site() {
  const prev = maisonV2At(19);
  const next = maisonV2At(20);
  const { base, theirs } = await siteSides(prev, 19, next, 20);
  const items = withAuthoredNotes(diff(prev, 19, next, 20), authoredRelease("maison-v2", 20)!);
  return { base, theirs, items };
}

test("Maison v2 v20 (location) classifies as exactly one new block, nothing automatic", () => {
  const items = diff(maisonV2At(19), 19, maisonV2At(20), 20);
  assert.ok(items.some((i) => i.id === "new-block:home:location"));
  assert.equal(types(items, "new-block")[0]!.key, "home:location");
  assert.ok(!items.some((i) => i.key.startsWith("home:location/")), "children ride with the block");
  for (const t of ["token-default", "layout", "critical", "code"]) {
    assert.equal(types(items, t).length, 0, `no ${t} in the location release`);
  }
  assertNotesFor(items, 20);
});

test("Maison v2 v20: the Location block is opt-in and carries no place or address", async () => {
  const { base, theirs, items } = await v20Site();
  assert.ok(!slotOrder(base.trees.home!).includes("location"));

  const none = mergeDesignUpdate({ base, ours: siteOf(base), theirs, items: [] });
  assert.ok(!slotOrder(none.trees.home!).includes("location"), "nothing chosen, nothing added");

  const chosen = mergeDesignUpdate({ base, ours: siteOf(base), theirs, items });
  const order = slotOrder(chosen.trees.home!);
  assert.ok(order.includes("location"));
  assert.ok(order.indexOf("visit") < order.indexOf("location"), "Location follows Visit");
  assert.ok(chosen.report.added.some((e) => e.key === "location"));

  // The block is the shared widget in its location layout, with no data baked in.
  const block = findBySlot(chosen.trees.home as never, "location")!;
  const visit = findByKind([block], "visit")!;
  assert.equal(propsOf(visit).layout, "location");
  const json = JSON.stringify(block);
  assert.doesNotMatch(json, /Mérida|Calle|Ejemplo|exactAddress|exact_address/);
  assert.doesNotMatch(json, HEX);
});
