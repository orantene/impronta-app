import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const dir = join(process.cwd(), "src/app/(workspace)/talent");
const loading = readFileSync(join(dir, "loading.tsx"), "utf8");
const layout = readFileSync(join(dir, "layout.tsx"), "utf8");
const inner = readFileSync(join(dir, "_talent-layout-inner.tsx"), "utf8");

// Guard for TUL-914: the loading skeleton must never paint ABOVE the app shell.
test("TUL-914: the route loading state fills the page slot only (no second top bar or nav)", () => {
  assert.match(loading, /page slot|PAGE SLOT/i);
  assert.doesNotMatch(loading, /<(header|nav|aside)\b/);
  assert.doesNotMatch(loading, /TalentShellSkeleton|TopBar|Sidebar/);
});

test("TUL-914: the shell has its own fallback, and the slot skeleton lives inside the shell's children", () => {
  assert.match(layout, /<Suspense fallback=\{<TalentShellSkeleton \/>\}>/);
  assert.match(layout, /<TalentLayoutInner>\{children\}<\/TalentLayoutInner>|<TalentLayoutInner>/);
  // The inner layout renders {children} inside the shell chrome, so loading.tsx (a child boundary) paints under the top bar.
  assert.match(inner, /\{children\}/);
});
