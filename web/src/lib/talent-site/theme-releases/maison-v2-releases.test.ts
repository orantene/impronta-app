/**
 * Maison v2 releases after 2.1: each release is rebuilt from code (the newest
 * payload with later releases reverted) and must classify exactly as authored,
 * carry an EN/ES note per generated item, and merge safely into a real site.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { diffDesignPayloads, type CandidateItem } from "./diff-payload";
import { mergeDesignUpdate } from "./merge";
import { authoredRelease } from "./release-notes";
import type { DesignSide } from "./types";
import type { DesignPayload } from "../theme-catalog/types";
import {
  currentMaisonV2,
  findByKind,
  propsOf,
  revertR16,
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
  const next = currentMaisonV2();
  const items = diff(revertR16(next), 15, next, 16);
  assert.deepEqual(
    items.map((i) => i.id).sort(),
    ["token-default:button.radius", "token-default:type.display-tracking", "variant-default:home:reviews/reviews"],
  );
  assert.equal(types(items, "token-default").length, 2);
  assert.equal(types(items, "variant-default").length, 1);
  assert.deepEqual(types(items, "variant-default")[0]!.paths, ["limit", "showArrows"]);
  for (const t of ["new-block", "layout", "critical", "code"]) assert.equal(types(items, t).length, 0, `no ${t} in round 2`);
  assertNotesFor(items, 16);
});

test("Maison v2 v16 auto-improves untouched parts and keeps talent edits", async () => {
  const next = currentMaisonV2();
  const prev = revertR16(next);
  const { base, theirs } = await siteSides(prev, 15, next, 16);
  const items = diff(prev, 15, next, 16);

  // Untouched site: tokens are inherited at render, the reviews default lands.
  const clean = mergeDesignUpdate({ base, ours: siteOf(base), theirs, items });
  const inherited = clean.report.applied.filter((e) => e.change === "token").map((e) => e.key).sort();
  assert.deepEqual(inherited, ["button.radius", "type.display-tracking"]);
  const reviews = findByKind(clean.trees.home!, "reviews")!;
  assert.equal(propsOf(reviews).showArrows, true);
  assert.equal(propsOf(reviews).limit, 9);
  assert.equal(clean.report.conflicts.length, 0);

  // The talent set her own button radius and edited her reviews: both are kept.
  const ours = siteOf(base, { "button.radius": "4px" });
  propsOf(findByKind(ours.trees.home!, "reviews")!).limit = 3;
  const kept = mergeDesignUpdate({ base, ours, theirs, items });
  assert.equal(kept.tokens["button.radius"], "4px", "her own radius wins");
  assert.equal(propsOf(findByKind(kept.trees.home!, "reviews")!).limit, 3, "her own limit wins");
  assert.ok(kept.report.kept.some((e) => e.key === "button.radius"));
  assert.ok(kept.report.kept.some((e) => e.key === "reviews/reviews"));
});
