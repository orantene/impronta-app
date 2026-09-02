/**
 * builder-2027-native-data-wiring.static.test.ts — BUILDER 2027 · P2B.
 *
 * WHY A SOURCE-SHAPE TEST AND NOT ONLY A RENDER TEST
 * ──────────────────────────────────────────────────
 * The defect this file exists to prevent is not "the block renders wrong". It
 * is "the block renders a perfectly correct FALLBACK forever, because no caller
 * ever passes it anything". That is what Phase 2A actually shipped:
 * `renderNativeLiveBlock` was declared, documented, read at three sites in
 * `render.tsx`, and passed by ZERO callers. Every unit test was green, because
 * a fallback render is a correct render.
 *
 * A pure-function test can never see that. So this file asserts the WIRING: for
 * each surface that renders a page tree, the real file really does construct
 * the real renderer and really does hand it to the renderer option. It is
 * deliberately coupled to the call sites — that coupling IS the test. If a
 * refactor moves a call site, this file must be updated to name the new one,
 * which is the moment a human reads "is it still wired?".
 *
 * Runner: `tsx --test`, reached by `test:builder-node-bindings` (every
 * `*.test.ts` under this directory).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { isNativeLiveBlockKind } from "./native-live-block-kinds";

/** Repo `web/src` root, from this file's location. */
const SRC = join(__dirname, "..", "..", "..");

function read(relativeToSrc: string): string {
  return readFileSync(join(SRC, relativeToSrc), "utf8");
}

/**
 * Every SERVER surface that renders a builder page tree and must therefore give
 * the native blocks their live engine. Each entry names the file and the reason
 * it is on the list, so a future reader can tell a deliberate omission from a
 * forgotten one.
 */
const LIVE_ENGINE_SURFACES: ReadonlyArray<{ file: string; why: string }> = [
  {
    file: "app/(public)/p/[[...slug]]/page.tsx",
    why: "freeform CMS pages — the `/p/` route",
  },
  {
    file: "components/home/homepage-cms-sections.tsx",
    why: "the homepage / section-composed page path",
  },
  {
    file: "components/site-shell/PublishedShell.tsx",
    why: "the published shell — where the header widgets live",
  },
];

test("every server render surface injects the native live-block renderer", () => {
  for (const surface of LIVE_ENGINE_SURFACES) {
    const source = read(surface.file);
    assert.ok(
      source.includes("makeNativeLiveBlockRenderer"),
      `${surface.file} (${surface.why}) must BUILD a live-block renderer`,
    );
    assert.ok(
      source.includes("renderNativeLiveBlock:"),
      `${surface.file} (${surface.why}) must PASS it as the renderNativeLiveBlock option — ` +
        "building one and not passing it is the exact shape of the bug this guards",
    );
  }
});

test("homepage-cms-sections injects the live renderer on EVERY one of its render paths", () => {
  // This file has four separate `renderBuilderNodes` / `render*Roots` paths
  // (unbound gallery, freeform full page, curated-slot children, trailing
  // gallery). Three of four wired is a page where the directory is live in one
  // layout and static in another, which reads as a flaky feature rather than a
  // missing one.
  const source = read("components/home/homepage-cms-sections.tsx");
  const embedInjections = source.split("renderSectionEmbed:").length - 1;
  const liveInjections = source.split("renderNativeLiveBlock:").length - 1;
  assert.ok(embedInjections >= 4, `expected >= 4 render paths, saw ${embedInjections}`);
  assert.equal(
    liveInjections,
    embedInjections,
    "every path that injects a section-embed renderer must also inject the live-block renderer",
  );
});

test("PublishedShell wires the live renderer on BOTH shell paths", () => {
  // The slot path and the freeform-side path (`renderFreeformShellSide`) are
  // separate render trees. A header widget in an EJECTED landmark goes through
  // the second one only.
  const source = read("components/site-shell/PublishedShell.tsx");
  assert.equal(
    source.split("renderNativeLiveBlock:").length - 1,
    2,
    "the slot path and the freeform-side path each need their own injection",
  );
});

test("the shell resolves headerWidgets and actually puts it on dataSources", () => {
  const source = read("components/site-shell/PublishedShell.tsx");
  assert.ok(
    source.includes("resolveNativeHeaderWidgets("),
    "the shell must RESOLVE the visitor-scoped widget state",
  );
  assert.equal(
    source.split("{ headerWidgets }").length - 1,
    2,
    "…and spread it onto dataSources on both shell paths — resolving it and " +
      "dropping it on the floor is the same silent no-op",
  );
});

test("the shared data-source loader resolves directory profiles per node", () => {
  const source = read("components/home/homepage-cms-data-sources.ts");
  assert.ok(
    source.includes("fetchNativeDirectoryProfilesByNodeId("),
    "loadBuilderNodeDataSources is the single choke point for every page-tree " +
      "surface; if the directory fetch is not here it is nowhere",
  );
  // Deliberately the RETURNED SPREAD, not a bare mention of the name: the
  // identifier also appears in the destructure and in comments, so
  // `includes("directoryProfilesByNodeId")` stays true even when the resolved
  // value is dropped on the floor. Mutation-tested — deleting the spread must
  // turn this red.
  assert.ok(
    /\{\s*directoryProfilesByNodeId\s*\}/.test(source),
    "…and the resolved value must be SPREAD onto the returned dataSources " +
      "object — fetching it and not returning it is a silent no-op",
  );
});

test("the fallback grid's GET form is not a lie: the resolver reads ?q=", () => {
  // The native `directory` fallback renders a REAL `method="get"` form with a
  // `q` field. A resolver that ignores `q` makes that form submit, change the
  // URL, and return the identical cards — a control that looks like it works.
  const source = read("lib/site-admin/server/native-directory-source.ts");
  assert.ok(
    source.includes("getRequestSearchParams"),
    "the resolver must read the live query string for this request",
  );
  assert.ok(
    /searchParams\.get\("q"\)/.test(source),
    "…specifically the `q` parameter the fallback form actually submits",
  );
});

test("a native directory node's category chips are actually fetched", () => {
  // `directoryShortcuts` was gated only on a `dataBinding` walk. A native
  // `directory` node carries no dataBinding — it IS the binding — so the chips
  // were never fetched and the chip row silently never rendered.
  const source = read("components/home/homepage-cms-data-sources.ts");
  assert.ok(
    source.includes("needsNativeDirectoryChips"),
    "the shortcut fetch must be gated on native directory nodes too",
  );
});

test("the live renderer serves exactly the kinds render.tsx delegates", () => {
  // The 3-of-4-layers defect in written form: a kind that reads
  // `options.renderNativeLiveBlock` but that the injected renderer refuses to
  // serve is permanently on its fallback, with nothing red.
  const render = read("lib/site-admin/builder-node/render.tsx");
  const delegating = new Set<string>();
  // Walk case labels in order and remember the most recent one before each
  // `renderNativeLiveBlock?.(` read.
  const tokens = render.matchAll(
    /case\s+"([a-z_]+)"\s*:|options\.renderNativeLiveBlock\?\.\(/g,
  );
  let current: string | null = null;
  for (const match of tokens) {
    if (match[1]) current = match[1];
    else if (current) delegating.add(current);
  }

  assert.ok(
    delegating.size > 0,
    "render.tsx must still read options.renderNativeLiveBlock somewhere",
  );
  for (const kind of delegating) {
    assert.ok(
      isNativeLiveBlockKind(kind),
      `render.tsx delegates "${kind}" to the live engine, but the injected ` +
        "renderer does not serve it — that node can never go live",
    );
  }
});
