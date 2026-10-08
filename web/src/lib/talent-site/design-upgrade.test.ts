/**
 * design-upgrade: design defaults move to the new release, the talent's own
 * edits stay, and running it twice is a no-op.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { upgradeSiteDesign, type UpgradeResult, type UpgradeSiteInput } from "./design-upgrade";
import { buildDesignTrees, fallbackHydrationTokens } from "./server/theme-apply-core";
import { addNode, edit, plain, prop, removeKey, topKeys } from "./theme-releases/test-fixtures";
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import type { DesignPayload } from "./theme-catalog/types";
import type { DesignSide } from "./theme-releases/types";

const hydration = fallbackHydrationTokens("Valeria");
const SLUG = "maison-v2";

let seq = 0;
const nd = (kind: string, props: Record<string, unknown>, children?: BuilderNode[]): BuilderNode =>
  ({ id: `u-${(seq += 1)}`, kind, props, ...(children ? { children } : {}) }) as unknown as BuilderNode;

/** A small schema-valid Design: keyed sections, `{{token}}` content, optional new gallery. */
function payload(o: { heroLayout: string; gallery?: boolean }, tokenDefaults: Record<string, string>): DesignPayload {
  const home = [
    nd("container", { slotKey: "hero", layout: o.heroLayout }, [
      nd("heading", { text: "{{displayName}}", level: 1 }),
      nd("paragraph", { text: "Book now" }),
    ]),
    nd("container", { slotKey: "about", layout: "stack" }, [nd("paragraph", { text: "About my work" })]),
    ...(o.gallery ? [nd("container", { slotKey: "gallery", layout: "grid" }, [nd("paragraph", { text: "Gallery" })])] : []),
    nd("container", { slotKey: "faq", layout: "stack" }, [nd("paragraph", { text: "Questions" })]),
  ];
  const shell = [nd("container", { slotKey: "footer", layout: "row" }, [nd("paragraph", { text: "{{displayName}}" })])];
  return { shellTree: shell, homeTree: home, tokenDefaults };
}

const V1 = payload({ heroLayout: "stack" }, { "space.row": "12px", "font.body": "Inter" });
const V2 = payload({ heroLayout: "row", gallery: true }, { "space.row": "16px", "font.body": "Inter" });

/** A site as the app leaves it right after applying `p` (stamped trees). */
function siteAt(version: number, p: DesignPayload, tokens: Record<string, string> = {}): DesignSide {
  const b = buildDesignTrees(p, hydration, undefined, { design: SLUG, version });
  if (!b.ok) throw new Error(b.errors.join("; "));
  return { trees: { shell: b.shellTree, home: b.homeTree }, tokens };
}

const input = (s: DesignSide, pinned: number | null = 1): UpgradeSiteInput => ({
  designSlug: SLUG,
  pinnedVersion: pinned,
  shellTree: s.trees.shell,
  homeBlocks: s.trees.home,
  designTokensDraft: s.tokens ?? {},
  themeTokenOrigin: null,
  themeLookSlug: null,
});

const run = (s: DesignSide, pinned: number | null = 1) =>
  upgradeSiteDesign({
    site: input(s, pinned),
    target: { version: 2, payload: V2 },
    basePayload: pinned === 1 ? V1 : null,
    hydration,
  });

type Applied = Extract<UpgradeResult, { ok: true; upToDate: false }>;
function applied(r: UpgradeResult): Applied {
  assert.ok(r.ok && !r.upToDate, JSON.stringify(r).slice(0, 300));
  return r as Applied;
}
const asSide = (r: Applied): DesignSide => ({ trees: { shell: r.shell, home: r.home }, tokens: r.tokens });

test("design token replaced, talent token kept", () => {
  const untouched = applied(run(siteAt(1, V1, { "space.row": "12px", "font.body": "Inter" })));
  assert.equal(untouched.tokens["space.row"], "16px");
  assert.ok(untouched.summary.tokensChanged >= 1);
  const edited = applied(run(siteAt(1, V1, { "space.row": "40px", "font.body": "Inter" })));
  assert.equal(edited.tokens["space.row"], "40px");
  assert.ok(edited.summary.keptEdits.some((k) => k.kind === "token" && k.key === "space.row"));
});

test("design prop replaced, talent-edited prop kept", () => {
  const plainSite = applied(run(siteAt(1, V1)));
  assert.equal(prop(asSide(plainSite), "home", "hero", "layout"), "row");
  const edited = applied(run(edit(siteAt(1, V1), "home", "hero", "layout", "grid")));
  assert.equal(prop(asSide(edited), "home", "hero", "layout"), "grid");
  assert.ok(edited.summary.keptEdits.some((k) => k.kind === "node" && k.key === "hero"));
});

test("section the talent added is kept, section she removed stays removed", () => {
  let s = siteAt(1, V1);
  s = addNode(s, "home", null, plain("paragraph", { text: "My own note" }), 1);
  s = removeKey(s, "home", "faq");
  const r = applied(run(s));
  const keys = topKeys(asSide(r), "home");
  assert.ok(keys.includes("+paragraph"), keys.join());
  assert.ok(!keys.includes("faq"), keys.join());
  assert.ok(keys.includes("gallery"), "a section new in the release is still inserted");
});

test("version bumped to the release (theme_design_version)", () => {
  const r = applied(run(siteAt(1, V1)));
  assert.equal(r.themeDesignVersion, 2);
  assert.equal(r.fromVersion, 1);
});

test("idempotent: merging the output again is a no-op, a site on the target is untouched", () => {
  const first = applied(run(edit(siteAt(1, V1, { "space.row": "40px" }), "home", "hero", "layout", "grid")));
  const second = applied(
    upgradeSiteDesign({
      site: { ...input(asSide(first), 1), themeTokenOrigin: first.tokenOrigin },
      target: { version: 2, payload: V2 },
      basePayload: V1,
      hydration,
    }),
  );
  assert.deepEqual(second.shell, first.shell);
  assert.deepEqual(second.home, first.home);
  assert.deepEqual(second.tokens, first.tokens);
  const onTarget = upgradeSiteDesign({
    site: input(asSide(first), 2),
    target: { version: 2, payload: V2 },
    basePayload: V2,
    hydration,
  });
  assert.deepEqual(onTarget, { ok: true, upToDate: true, fromVersion: 2, toVersion: 2 });
});

test("a site newer than the release is never moved backward", () => {
  const r = upgradeSiteDesign({
    site: input(siteAt(2, V2), 3),
    target: { version: 2, payload: V2 },
    basePayload: null,
    hydration,
  });
  assert.equal(r.ok && r.upToDate, true);
});
