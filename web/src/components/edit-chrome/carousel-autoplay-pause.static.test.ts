/**
 * carousel-autoplay-pause.static.test.ts — the pause must not go back to
 * being flag-gated.
 *
 * THE REGRESSION THIS EXISTS FOR
 * ──────────────────────────────
 * #1203 fixed the owner's "one slide pass i cant catch the second or third
 * one" by registering edit mode from `ClientBuilderCanvas` and
 * `ClientSectionChildren`. Both mounted only behind the since-deleted
 * `NEXT_PUBLIC_BUILDER_CLIENT_CANVAS` flag, which was DEFAULT OFF. On the
 * server-rendered editing path — the default at the time —
 * `registerCarouselEditMode()` was therefore never called, `editing` stayed
 * false, and the hero carousel kept autoplaying under the operator's pointer.
 * The unit tests passed the whole time, because the bridge itself was correct;
 * what was wrong was WHO called it.
 *
 * So this guard is deliberately about wiring, not behaviour: the behaviour is
 * covered by `carousel-edit-bridge.test.ts`. It asserts that the registration
 * hangs off `EditShell` (present on EVERY editing surface, including the ones
 * that mount no client canvas), that the two canvas-side registrations are
 * still there (a belt the refcount makes free — never delete a guard), and that
 * the two rotation timers still consult the edit flag before starting.
 *
 * A static read is the honest tool here. These are React components with no
 * DOM in this lane, and the property worth pinning is "the call site exists",
 * which is exactly what a source read can prove.
 *
 * Run: node_modules/.bin/tsx --test src/components/edit-chrome/carousel-autoplay-pause.static.test.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

function read(webRelativePath: string): string {
  return readFileSync(join(process.cwd(), webRelativePath), "utf8");
}

const EDIT_SHELL = "src/components/edit-chrome/edit-shell.tsx";
const BINDING = "src/components/edit-chrome/carousel-edit-mode-binding.tsx";
const CAROUSEL = "src/lib/site-admin/builder-node/carousel.tsx";
const SLIDESHOW = "src/lib/site-admin/builder-node/background-slideshow.tsx";

test("EditShell mounts the carousel edit-mode binding", () => {
  const src = read(EDIT_SHELL);
  assert.match(
    src,
    /import \{ CarouselEditModeBinding \} from "\.\/carousel-edit-mode-binding"/,
    "EditShell must import the binding",
  );
  assert.match(
    src,
    /<CarouselEditModeBinding\b/,
    "EditShell must RENDER the binding. Without it the pause only works on " +
      "surfaces that mount a client canvas, and a curated-slot page mounts none.",
  );
});

test("the binding is mounted unconditionally, not behind !previewing", () => {
  // Preview must not be expressed by UNMOUNTING the binding: unmounting also
  // drops the slide-follow and, worse, re-registers on the way back in with no
  // guarantee about ordering. Preview is a prop, and the bridge suppresses.
  const src = read(EDIT_SHELL);
  const mount = /(\{!previewing \? )?<CarouselEditModeBinding/.exec(src);
  assert.ok(mount, "no mount found");
  assert.equal(
    mount[1],
    undefined,
    "the binding must mount unconditionally and take `previewing` as a prop",
  );
  assert.match(src, /<CarouselEditModeBinding previewing=\{previewing\}/);
});

test("the binding registers edit mode and forwards preview to the bridge", () => {
  const src = read(BINDING);
  assert.match(src, /registerCarouselEditMode\(\)/);
  assert.match(src, /setCarouselEditPreviewing\(previewing\)/);
  assert.match(
    src,
    /useCarouselSlideFollow\(tree\)/,
    "selecting a node inside a slide must pin that slide on this path too",
  );
});

test("the flag-gated registrations are still in place", () => {
  // Refcounting makes these free alongside the EditShell one, and removing
  // them would silently narrow the fix if EditShell is ever restructured.
  for (const path of [
    "src/components/edit-chrome/client-builder-canvas.tsx",
    "src/components/edit-chrome/client-section-children.tsx",
  ]) {
    assert.match(
      read(path),
      /registerCarouselEditMode\(\)/,
      `${path} lost its edit-mode registration`,
    );
  }
});

test("both rotation timers refuse to start while editing", () => {
  for (const path of [CAROUSEL, SLIDESHOW]) {
    const src = read(path);
    const effect = /if \(editing[^)]*\) return;\s*\n\s*const id = window\.setInterval/.exec(
      src,
    );
    assert.ok(
      effect,
      `${path}: the setInterval must be preceded by an \`if (editing …) return;\` ` +
        `bail. A timer that starts and is cleared later still rotates a frame.`,
    );
    assert.match(
      src,
      /\}, \[editing,/,
      `${path}: \`editing\` must be in the effect deps, or entering edit mode ` +
        `mid-session leaves the already-running interval alive.`,
    );
  }
});

test("the carousel writes its own slide changes through to the pin while editing", () => {
  // Canvas arrows/dots and the inspector's slide list are two views of ONE
  // choice; if the canvas stops writing through, they drift apart and the
  // list highlights a slide that is not on screen.
  assert.match(read(CAROUSEL), /if \(editing\) setCarouselSlide\(nodeId, target\)/);
});
