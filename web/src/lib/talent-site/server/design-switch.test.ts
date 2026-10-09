/**
 * TUL-421 / L3: Design switch carry-over + warn plan (pure).
 */
import test from "node:test";
import assert from "node:assert/strict";

import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { getPath, propsOf, refreshOriginFingerprints, stampDesignOrigin } from "@/lib/talent-site/theme-releases/origin";
import { findKeyPath } from "@/lib/talent-site/theme-releases/tree-ops";
import { addNode, built, edit, plain, prop } from "@/lib/talent-site/theme-releases/test-fixtures";
import {
  DESIGN_APPLY_DRAFT_SITE_KEYS,
  draftUnchangedSinceSwitch,
  isDesignSwitchReport,
  planDesignSwitch,
  snapshotDesignSlug,
} from "./design-switch";
import { planRestore } from "@/lib/talent-site/history/restore-plan";
import type { HistorySnapshot } from "@/lib/talent-site/history/types";

function stampAs(side: ReturnType<typeof built>, design: string, version: number) {
  const src = { design, version };
  return {
    shell: refreshOriginFingerprints(stampDesignOrigin(side.trees.shell!, src)),
    home: refreshOriginFingerprints(stampDesignOrigin(side.trees.home!, src)),
  };
}

test("carry-over: matched keys keep her content text and i18n", () => {
  let from = built(1);
  from = edit(from, "home", "hero/heading", "text", "Studio Luna");
  from = edit(from, "home", "hero/button", "i18n", { es: { label: "Reservar" }, en: { label: "Book" } });
  const to = stampAs(built(2, { heroVariant: "stacked", ctaLabel: "Book a visit" }), "folio", 3);

  const plan = planDesignSwitch({
    fromShell: from.trees.shell!,
    fromHome: from.trees.home!,
    toShell: to.shell,
    toHome: to.home,
    fromSlug: "maison-v2",
    toSlug: "folio",
    fromVersion: 1,
    toVersion: 3,
  });

  const headingAt = findKeyPath(plan.home, "hero/heading")!;
  let cur: BuilderNode | undefined;
  let list = plan.home;
  for (const i of headingAt) {
    cur = list[i];
    list = (cur as { children?: BuilderNode[] }).children ?? [];
  }
  assert.equal(getPath(propsOf(cur!), "text").value, "Studio Luna");
  assert.deepEqual(prop({ trees: { home: plan.home }, tokens: {} }, "home", "hero/button", "i18n"), {
    es: { label: "Reservar" },
    en: { label: "Book" },
  });
  assert.ok(plan.mappedKeys.includes("hero"));
  assert.ok(plan.mappedKeys.includes("hero/heading"));
});

test("carry-over: unmatched stamped section is kept and warned (not deleted)", () => {
  const from = built(1, { withGallery: true });
  // Target has no gallery key.
  const to = stampAs(built(2, { withGallery: false }), "folio", 1);

  const plan = planDesignSwitch({
    fromShell: from.trees.shell!,
    fromHome: from.trees.home!,
    toShell: to.shell,
    toHome: to.home,
    fromSlug: "maison-v2",
    toSlug: "folio",
    fromVersion: 1,
    toVersion: 1,
  });

  assert.ok(plan.home.some((n) => (propsOf(n).__origin as { key?: string } | undefined)?.key === "gallery"));
  assert.ok(plan.warned.some((w) => w.key === "gallery" && w.reason === "no_match" && w.tree === "home"));
});

test("carry-over: talent-added top-level node is kept and warned", () => {
  let from = built(1);
  from = addNode(from, "home", null, plain("paragraph", { text: "My note" }));
  const to = stampAs(built(2), "gridline", 1);

  const plan = planDesignSwitch({
    fromShell: from.trees.shell!,
    fromHome: from.trees.home!,
    toShell: to.shell,
    toHome: to.home,
    fromSlug: "maison-v2",
    toSlug: "gridline",
    fromVersion: 1,
    toVersion: 1,
  });

  assert.ok(plan.home.some((n) => n.kind === "paragraph" && getPath(propsOf(n), "text").value === "My note"));
  assert.ok(plan.warned.some((w) => w.reason === "talent_added" && w.kind === "paragraph"));
});

test("first apply on a fresh site (no Design pinned): the unstamped starter tree is replaced, not appended as orphans", () => {
  // The starter tree a new talent site is created with: unstamped, ids like default-talent-*.
  const starterHome: BuilderNode[] = [
    { id: "default-talent-hero", kind: "split", props: {}, children: [] } as unknown as BuilderNode,
    { id: "default-talent-about", kind: "container", props: {}, children: [] } as unknown as BuilderNode,
    { id: "default-talent-services", kind: "container", props: {}, children: [] } as unknown as BuilderNode,
  ];
  const starterShell: BuilderNode[] = [{ id: "default-talent-header", kind: "container", props: {}, children: [] } as unknown as BuilderNode];
  const to = stampAs(built(1), "maison-v2", 1);
  const plan = planDesignSwitch({
    fromShell: starterShell,
    fromHome: starterHome,
    toShell: to.shell,
    toHome: to.home,
    fromSlug: null,
    toSlug: "maison-v2",
    fromVersion: null,
    toVersion: 1,
  });
  assert.deepEqual(plan.home, to.home, "home is exactly the design");
  assert.deepEqual(plan.shell, to.shell, "shell is exactly the design");
  assert.ok(!plan.home.some((n) => String(n.id).startsWith("default-talent-")), "no starter node survives");
  assert.deepEqual(plan.warned, []);
  // A blank slug string counts as "no design pinned" too.
  const blank = planDesignSwitch({ fromShell: starterShell, fromHome: starterHome, toShell: to.shell, toHome: to.home, fromSlug: " ", toSlug: "maison-v2", fromVersion: null, toVersion: 1 });
  assert.deepEqual(blank.home, to.home);
});

test("a site already on a Design still keeps unmatched and talent-added sections when she switches", () => {
  const from = built(1, { withGallery: true });
  const to = stampAs(built(2, { withGallery: false }), "folio", 1);
  const plan = planDesignSwitch({ fromShell: from.trees.shell!, fromHome: from.trees.home!, toShell: to.shell, toHome: to.home, fromSlug: "maison-v2", toSlug: "folio", fromVersion: 1, toVersion: 1 });
  assert.ok(plan.warned.length > 0);
});

test("draft-first: apply site patch keys never include published columns", () => {
  for (const key of DESIGN_APPLY_DRAFT_SITE_KEYS) {
    assert.equal(/published/i.test(key), false, key);
  }
  assert.ok(DESIGN_APPLY_DRAFT_SITE_KEYS.includes("shell_tree"));
  assert.ok(!DESIGN_APPLY_DRAFT_SITE_KEYS.includes("shell_published" as never));
  assert.ok(!DESIGN_APPLY_DRAFT_SITE_KEYS.includes("design_tokens" as never));
});

test("restore-exact: planRestore from pre-switch snapshot returns prior shell, tokens, pin", () => {
  const priorShell = built(1).trees.shell!;
  const priorHome = built(1).trees.home!;
  const snapshot: HistorySnapshot = {
    v: 1,
    source: "draft",
    rev: 4,
    shell: priorShell,
    tokens: { "color.primary": "#111111" },
    design: { slug: "maison-v2", version: 8, look: "maison-stone" },
    pages: { "page-home": priorHome },
  };
  const currentHome = stampAs(built(2), "folio", 1).home;
  const plan = planRestore(snapshot, {
    shell: stampAs(built(2), "folio", 1).shell,
    pages: { "page-home": currentHome },
  });
  assert.deepEqual(plan.site.shell_tree, priorShell);
  assert.deepEqual(plan.site.design_tokens_draft, { "color.primary": "#111111" });
  assert.equal(plan.site.theme_design_slug, "maison-v2");
  assert.equal(plan.site.theme_design_version, 8);
  assert.equal(plan.site.theme_look_slug, "maison-stone");
  assert.equal(plan.pages.length, 1);
  assert.deepEqual(plan.pages[0], { id: "page-home", patch: { blocks: priorHome } });
});

test("restore-exact: allowed only when draft_rev still equals the leave entry rev", () => {
  // A→B wrote history.draft_rev=5; no edits → current still 5 → restore-exact.
  assert.equal(draftUnchangedSinceSwitch(5, 5), true);
  assert.equal(draftUnchangedSinceSwitch(5, null), false);
  assert.equal(draftUnchangedSinceSwitch(5, undefined), false);
});

test("carry-over: preferred when draft moved after the leave (edited on B)", () => {
  // A→B left at rev 5; she edited → rev 6+ → gallery re-pick of A carries, not restores.
  assert.equal(draftUnchangedSinceSwitch(6, 5), false);
  assert.equal(draftUnchangedSinceSwitch(12, 5), false);
  assert.equal(draftUnchangedSinceSwitch(4, 5), false);
});

test("report helpers: isDesignSwitchReport + snapshotDesignSlug", () => {
  const plan = planDesignSwitch({
    fromShell: [],
    fromHome: [],
    toShell: stampAs(built(1), "folio", 1).shell,
    toHome: stampAs(built(1), "folio", 1).home,
    fromSlug: "maison-v2",
    toSlug: "folio",
    fromVersion: 2,
    toVersion: 1,
  });
  assert.equal(isDesignSwitchReport(plan.report), true);
  assert.equal(isDesignSwitchReport({ design: "x" }), false);
  assert.equal(snapshotDesignSlug({ design: { slug: "maison-v2" } }), "maison-v2");
  assert.equal(snapshotDesignSlug({ design: { slug: null } }), null);
});

test("copy: undo design strings are bilingual and have no em dashes", async () => {
  const { CHROME_COPY } = await import("@/lib/talent-site/history/copy");
  assert.ok(CHROME_COPY.undoDesign.en.includes("design"));
  assert.ok(CHROME_COPY.undoDesign.es.includes("diseño"));
  assert.equal(/—/.test(JSON.stringify([CHROME_COPY.undoDesign, CHROME_COPY.undoDesignConfirm])), false);
});
