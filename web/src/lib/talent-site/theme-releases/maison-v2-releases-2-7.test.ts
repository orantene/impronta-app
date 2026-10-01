/**
 * Maison v2 release 2.7 (v21, "hero + footer"): rebuilt from code (the newest
 * payload with 2.7 reverted to the 2.5 shapes), classified exactly as authored,
 * EN + ES notes on every item, and merged safely into a real site.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { diffDesignPayloads, type CandidateItem } from "./diff-payload";
import { mergeDesignUpdate } from "./merge";
import { generateReleaseItems, releaseNotesFor as authoredRelease } from "./release-notes";
import type { DesignSide } from "./types";
import type { DesignPayload } from "../theme-catalog/types";
import { findByKind, findBySlot, maisonV2At, propsOf, walkNodes } from "./maison-v2-releases.fixtures";

const HEX = /#[0-9a-fA-F]{3,8}\b/;

const diff = (from: DesignPayload, to: DesignPayload) =>
  diffDesignPayloads("maison-v2", { payload: from, version: 20 }, { payload: to, version: 21 });

const FOOTER_PAIR = ["layout:shell:footer:removed", "layout:shell:footer_rich"];
/** The parts inside the old dark band: candidates of their own, grouped into the swap by the generator. */
const FOOTER_PARTS = [
  "layout:shell:footer/button:removed",
  "layout:shell:footer/container:removed",
  "layout:shell:footer/container/paragraph:removed",
  "layout:shell:footer/container/social_links:removed",
  "layout:shell:footer/heading:removed",
];
const HERO_LINES = [
  "variant-default:home:hero/container/heading",
  "variant-default:home:hero/container/paragraph",
  "variant-default:home:hero/container/paragraph#2",
  "variant-default:home:hero/container/paragraph#3",
];
const TONE = "token-default:footer.tone";

test("Maison v2 v21 classifies: live hero lines + footer tone are automatic, the rich footer is ONE opt-in layout swap", () => {
  const items = diff(maisonV2At(20), maisonV2At(21));
  assert.deepEqual(items.map((i) => i.id).sort(), [...FOOTER_PAIR, ...FOOTER_PARTS, ...HERO_LINES, TONE].sort());
  const byType = (t: string) => items.filter((i) => i.type === t);
  assert.equal(byType("variant-default").length, 4);
  assert.equal(byType("token-default").length, 1);
  assert.equal(byType("layout").length, 2 + FOOTER_PARTS.length, "the dark band removal, its parts and the rich footer");
  for (const t of ["new-block", "critical", "code"]) assert.equal(byType(t).length, 0, `no ${t} in 2.7`);
  // The two footer halves are one atomic swap (the new half is a layout change, not a new block).
  const pair = byType("layout").filter((i) => FOOTER_PAIR.includes(i.id ?? ""));
  assert.equal(new Set(pair.map((i) => i.group)).size, 1);
  assert.ok(pair.every((i) => i.swap?.from === "footer" && i.swap?.to === "footer_rich"));
  for (const i of byType("variant-default")) assert.deepEqual((i as CandidateItem).paths, ["liveText"]);
  assert.deepEqual((items.find((i) => i.id === TONE)!.detail), { from: null, to: "light" });
});

test("Maison v2 v21 notes: every generated item has an EN and ES note, no dashes, no hex", () => {
  const rel = authoredRelease("maison-v2", 21);
  assert.ok(rel && rel.toVersion === 21);
  assert.ok(rel.notes.en && rel.notes.es);
  const items = diff(maisonV2At(20), maisonV2At(21));
  for (const i of items) {
    const note = rel.byItemId[i.id ?? ""];
    assert.ok(note?.en && note?.es, `missing EN/ES note for ${i.id}`);
    assert.doesNotMatch(`${note.en} ${note.es}`, /—|–/);
    assert.doesNotMatch(`${note.en} ${note.es}`, HEX);
  }
  for (const id of Object.keys(rel.byItemId)) assert.ok(items.some((i) => i.id === id), `authored note ${id} matches no item`);
});

test("Maison v2 v21 through the one generator: the footer pair becomes ONE item covering both keys", () => {
  const { items, notes } = generateReleaseItems(
    "maison-v2",
    { payload: maisonV2At(20), version: 20 },
    { payload: maisonV2At(21), version: 21 },
  );
  assert.ok(notes.en && notes.es);
  const layout = items.filter((i) => i.type === "layout");
  assert.equal(layout.length, 1);
  assert.equal(layout[0]!.id, "layout:maison-v2:footer-rich");
  const keys = layout[0]!.keys ?? [];
  assert.ok(keys.includes("shell:footer") && keys.includes("shell:footer_rich"), "both halves of the swap");
  assert.ok(keys.every((k) => k.startsWith("shell:footer")), "the parts of the old band ride along");
  assert.deepEqual(layout[0]!.swap, { from: "footer", to: "footer_rich" }, "still ONE atomic swap in the merge");
  for (const i of items) assert.ok(i.note?.en && i.note?.es, `note for ${i.id}`);
});

async function v21Site() {
  const prev = maisonV2At(20);
  const next = maisonV2At(21);
  const { buildDesignTrees, fallbackHydrationTokens } = await import("../server/theme-apply-core");
  // A profile with a trade, a city and a proof line, so every hero line exists on the base site.
  const tokens = {
    ...fallbackHydrationTokens("Valeria"),
    bio: "Bio",
    tagline: "Uñas",
    primaryTypeLabel: "Nail Artist",
    heroEyebrow: "Nail Artist · Mérida",
    proofLine: "9 years of craft",
  };
  const b = buildDesignTrees(prev, tokens, 2026, { design: "maison-v2", version: 20 });
  const t = buildDesignTrees(next, tokens, 2026, { design: "maison-v2", version: 21 });
  assert.ok(b.ok && t.ok);
  if (!b.ok || !t.ok) throw new Error("build failed");
  const side = (x: { shellTree: DesignSide["trees"][string]; homeTree: DesignSide["trees"][string] }, d: DesignPayload): DesignSide => ({
    trees: { shell: x.shellTree, home: x.homeTree },
    tokens: { ...(d.tokenDefaults ?? {}) },
  });
  const base = side(b, prev);
  const theirs = side(t, next);
  const { items } = generateReleaseItems("maison-v2", { payload: prev, version: 20 }, { payload: next, version: 21 });
  return { base, theirs, items, freshSite: { shell: t.shellTree, home: t.homeTree } };
}

const ours = (base: DesignSide, tokens: Record<string, string> = {}): DesignSide => ({
  trees: JSON.parse(JSON.stringify(base.trees)) as DesignSide["trees"],
  tokens,
});

test("Maison v2 v21: an untouched site gets the live hero lines and none of the footer swap", async () => {
  const { base, theirs, items } = await v21Site();
  const auto = items.filter((i) => i.type === "token-default" || i.type === "variant-default");
  const r = mergeDesignUpdate({ base, ours: ours(base), theirs, items: auto });
  assert.equal(r.report.conflicts.length, 0);
  const live: Record<string, string | undefined> = {};
  walkNodes(r.trees.home!, (n) => {
    const props = propsOf(n);
    if (typeof props.liveText === "string") live[props.liveText] = String(props.text);
  });
  assert.deepEqual(Object.keys(live).sort(), ["hero_eyebrow", "hero_headline", "hero_proof", "hero_tagline"]);
  assert.ok(findBySlot(r.trees.shell!, "footer"), "still the dark band");
  assert.equal(findBySlot(r.trees.shell!, "footer_rich"), undefined);
  assert.ok(r.report.applied.some((e) => e.change === "token" && e.key === "footer.tone"));
});

test("Maison v2 v21: choosing the footer applies it whole, with its columns, and leaves nothing of the old band", async () => {
  const { base, theirs, items } = await v21Site();
  const layout = items.filter((i) => i.type === "layout");
  assert.equal(layout.length, 1);
  const r = mergeDesignUpdate({ base, ours: ours(base), theirs, items: layout });
  assert.equal(r.report.conflicts.length, 0);
  assert.equal(findBySlot(r.trees.shell!, "footer"), undefined, "the dark band is gone");
  const rich = findBySlot(r.trees.shell!, "footer_rich");
  assert.ok(rich, "the rich footer is in");
  assert.equal(propsOf(rich).anchorId, "s-foot");
  for (const slot of ["footer_top", "footer_lead", "footer_cols", "footer_where", "footer_contact"]) {
    assert.ok(findBySlot(r.trees.shell!, slot), `${slot} present`);
  }
  assert.doesNotMatch(JSON.stringify(r.trees.shell), /Hecho con Tulala|Made with Tulala|Powered by Tulala/, "no second credit");
  // The hero lines are NOT applied by the layout choice alone.
  walkNodes(r.trees.home!, (n) => assert.equal(propsOf(n).liveText, undefined));
});

test("Maison v2 v21: a hero line she edited keeps her words and her styling", async () => {
  const { base, theirs, items } = await v21Site();
  const mine = ours(base);
  let edited = 0;
  walkNodes(mine.trees.home!, (n) => {
    if (n.kind === "paragraph" && (propsOf(n).style as Record<string, unknown> | undefined)?.lineHeight === "1.2" && !edited) {
      (propsOf(n).style as Record<string, unknown>).lineHeight = "1.6";
      edited += 1;
    }
  });
  assert.equal(edited, 1);
  const auto = items.filter((i) => i.type === "token-default" || i.type === "variant-default");
  const r = mergeDesignUpdate({ base, ours: mine, theirs, items: auto });
  assert.ok(r.report.kept.some((e) => e.key.startsWith("hero/container/paragraph")), "her edited line is kept");
});

test("Maison v2 v21 payload: live lines, light footer default, menu intro, no hex, no em dash, one credit only", () => {
  const p = maisonV2At(21);
  assert.equal(p.tokenDefaults!["footer.tone"], "light");
  const live = new Map<string, string>();
  walkNodes([...p.homeTree, ...p.shellTree], (n) => {
    const props = propsOf(n);
    if (typeof props.liveText === "string") live.set(props.liveText, String(props.text));
  });
  assert.deepEqual(
    [...live.keys()].sort(),
    ["footer_contact", "footer_hours", "footer_intro", "footer_where", "hero_eyebrow", "hero_headline", "hero_proof", "hero_tagline"],
  );
  assert.equal(live.get("hero_headline"), "{{headline}}");
  assert.equal(propsOf(findByKind(p.homeTree, "services_catalog")!).subtitle, "{{menuSubtitle}}");
  const json = JSON.stringify(p);
  assert.doesNotMatch(json, HEX);
  assert.doesNotMatch(json, /—|–/);
  assert.doesNotMatch(JSON.stringify(p.shellTree), /Hecho con Tulala|Made with Tulala|Powered by Tulala/);
  // Footer copy: the big line, the booking button, both columns with their links.
  const footer = JSON.stringify(p.shellTree);
  for (const s of ["See you {i}soon.{/i}", "Book an appointment", "See location", "Write from this site", "#talent-ask", "#visit"]) {
    assert.ok(footer.includes(s), `footer has ${s}`);
  }
});

test("Maison v2 v21: applying it to a profile with no data keeps every live line (zero-width placeholder) so it can fill in later", async () => {
  const { freshSite } = await v21Site();
  const live: string[] = [];
  walkNodes([...freshSite.home, ...freshSite.shell], (n) => {
    if (typeof propsOf(n).liveText === "string") live.push(String(propsOf(n).liveText));
  });
  assert.equal(live.length, 8, "none of the live lines were pruned at apply");
});
