/**
 * client-canvas-flag-removed.static.test.ts — builder-2027 P1 (1A).
 *
 * WHAT WAS DELETED, AND WHY THIS GUARD EXISTS
 * ───────────────────────────────────────────
 * `NEXT_PUBLIC_BUILDER_CLIENT_CANVAS` gated a SECOND editor render path: with
 * the flag off the storefront body server-rendered the canvas and every edit
 * paid a `router.refresh()`. The flag has been `1` in Vercel Production since it
 * shipped, so that server-rendered editor branch had never executed in a
 * production binary — it was dead weight that every reader of this subsystem
 * still had to reason about, and that every new call site had to remember to
 * gate on.
 *
 * `NEXT_PUBLIC_*` is inlined at BUILD time. A half-deleted flag is therefore
 * invisible at runtime and silently resurrects the dead branch the moment
 * someone re-adds the env var. So the removal has to be pinned by source text.
 *
 * WHAT THIS ASSERTS (the wiring, not a pure function)
 * ───────────────────────────────────────────────────
 *   1. The flag module is gone from disk.
 *   2. No source file imports it or reads the env var.
 *   3. The four former gates now read edit mode alone — pinned by the SHAPE of
 *      the surviving condition, not by a copy of the whole line, so a normal
 *      refactor of the surrounding code does not redden main (see
 *      incident_static_guard_pinned_source_text).
 *
 * A static read is the honest tool: these are server components and a 6k-line
 * provider that cannot execute under node:test, and "the dead branch is not in
 * the source" is exactly a source-text property.
 *
 * Run: node_modules/.bin/tsx --test src/components/edit-chrome/client-canvas-flag-removed.static.test.ts
 */

import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import test from "node:test";

const WEB_ROOT = process.cwd();
const SRC = join(WEB_ROOT, "src");

function read(webRelativePath: string): string {
  return readFileSync(join(WEB_ROOT, webRelativePath), "utf8");
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, out);
    } else if (/\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

test("the client-canvas flag module is deleted", () => {
  assert.equal(
    existsSync(resolve(SRC, "lib/site-admin/edit-mode/client-canvas-flag.ts")),
    false,
    "client-canvas-flag.ts must stay deleted. The client canvas is the only " +
      "editor render path; re-introducing the flag re-introduces a second, " +
      "untested one.",
  );
});

test("no source file imports the flag or reads the env var", () => {
  const offenders: string[] = [];
  for (const file of walk(SRC)) {
    const src = readFileSync(file, "utf8");
    // This guard file names both tokens on purpose; skip itself.
    if (file.endsWith("client-canvas-flag-removed.static.test.ts")) continue;
    if (src.includes("isBuilderClientCanvasEnabled")) {
      offenders.push(`${file} (imports/calls isBuilderClientCanvasEnabled)`);
    }
    if (src.includes("process.env.NEXT_PUBLIC_BUILDER_CLIENT_CANVAS")) {
      offenders.push(`${file} (reads NEXT_PUBLIC_BUILDER_CLIENT_CANVAS)`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `the client-canvas flag is gone; these still reach for it:\n${offenders.join("\n")}`,
  );
});

test("the homepage canvas gate is edit mode alone", () => {
  const src = read("src/components/home/homepage-cms-sections.tsx");
  // The full-page freeform canvas branch.
  assert.match(
    src,
    /if \(editMode\) \{\n\s+const sectionEmbedIslands/,
    "the full-page ClientBuilderCanvas branch must be gated on editMode alone",
  );
  // The curated-slot ClientSectionChildren branch.
  assert.match(
    src,
    /if \(editMode && builderNodeId\) \{/,
    "the ClientSectionChildren branch must be gated on editMode + a node id",
  );
});

test("the cms-page canvas gate is edit mode + the editor capability", () => {
  const src = read("src/app/(public)/p/[[...slug]]/page.tsx");
  assert.match(
    src,
    /let mountBodyCanvas = editModeActive && draftReaderActive;/,
    "the /p/ body canvas must mount on edit mode + draft-reader proof",
  );
  assert.match(
    src,
    /if \(!mountBodyCanvas && editModeActive\) \{/,
    "the capability re-proof must run whenever edit mode is on and the draft " +
      "read did not already prove the editor",
  );
  // Inside THIS branch the capability query used to run twice (once for the
  // canvas gate, once for the untranslated-cue gate) because the second one had
  // to cover the flag-off server-rendered body. With one canvas path the two
  // predicates are the same, so the cue reuses the canvas answer.
  assert.match(
    src,
    /const editorViewing = mountBodyCanvas;/,
    "editorViewing must reuse the canvas gate's answer rather than paying a " +
      "second `userHasCapability` round-trip for the identical predicate",
  );
});

test("EditProvider publishes the live tree on every surface", () => {
  const src = read("src/components/edit-chrome/edit-context.tsx");
  assert.match(
    src,
    /publishBuilderCanvasTree\(builderTree\);/,
    "EditProvider must publish the live tree to the canvas bridge",
  );
  assert.ok(
    !/surface\.kind === "homepage"[\s\S]{0,120}publishBuilderCanvasTree/.test(src),
    "the homepage must not be carved out of the canvas-tree publish: with the " +
      "flag gone the homepage body subscribes to this bridge like every other " +
      "surface, so skipping it would leave the homepage canvas blank.",
  );
});
