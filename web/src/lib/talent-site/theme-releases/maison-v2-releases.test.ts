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
