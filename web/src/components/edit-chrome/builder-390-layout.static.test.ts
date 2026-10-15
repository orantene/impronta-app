import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";

import { buildEditChromeGutterStyleCss } from "./hero-shift-measure";

/** Pins the 390px (max-width 640px) builder layout. Static: reads the sources. */
const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

test("TUL-914: rail gutters apply only above 640px; phones get the full canvas", () => {
  const css = buildEditChromeGutterStyleCss(120, 120);
  assert.match(css, /@media \(min-width: 641px\) \{\s*body \{\s*padding-left: 120px !important/);
  assert.match(css, /@media \(max-width: 640px\) \{\s*body \{\s*padding-left: 0 !important;\s*padding-right: 0 !important/);
  assert.doesNotMatch(css, /min-width:\s*1024/);
});

test("TUL-914: the Design panel is a bottom sheet on phones and left panels never overflow", () => {
  assert.match(read("./design-panel.tsx"), /compactBottomSheet\b/);
  assert.match(read("./kit/floating-panel-shell.tsx"), /max-sm:!left-2 max-sm:!right-2 max-sm:!w-auto/);
});

test("TUL-914: top bar does not scroll sideways on phones and the talent name truncates", () => {
  const bar = read("./topbar.tsx");
  assert.match(bar, /overflow-y-hidden max-\[640px\]:overflow-x-hidden/);
  assert.match(bar, /max-\[640px\]:w-full max-\[640px\]:min-w-0/);
  assert.match(read("./talent-builder-identity.tsx"), /max-\[640px\]:max-w-\[72px\] max-\[640px\]:truncate/);
});

test("TUL-914: the floating text toolbar reserves no rail space on phones", () => {
  const src = read("./canvas-text-toolbar.tsx");
  assert.match(src, /const phone = viewportWidth <= 640/);
  assert.match(src, /phone \? VIEWPORT_EDGE_GUTTER : rightReservePx/);
});

test("TUL-1027: the Design sheet wraps tabs, labels and card titles instead of clipping at 390", () => {
  const drawer = read("./kit/drawer.tsx");
  assert.match(drawer, /max-sm:flex-wrap max-sm:gap-x-3 max-sm:gap-y-0 max-sm:overflow-x-visible/);
  const seg = read("./kit/segmented.tsx");
  assert.match(seg, /minmax\(80px, 1fr\)/);
  assert.match(seg, /overflowWrap: fullWidth \? "break-word" : undefined/);
  const card = read("./kit/card.tsx");
  assert.match(card, /min-w-0 flex-1 truncate uppercase max-sm:whitespace-normal/);
  assert.match(card, /shrink-0 truncate max-sm:hidden/);
  assert.match(read("./command-dock.tsx"), /min-w-0 max-w-full max-sm:\[overflow-wrap:anywhere\]/);
});

test("TUL-1028: the update notice is one compact row on phones and the domain pill ellipsizes", () => {
  const notice = read("../talent/site/theme-update/ThemeUpdateNotice.tsx");
  assert.match(notice, /flex-row items-center justify-between gap-2[^"]*max-sm:p-1\.5/);
  assert.doesNotMatch(notice, /mb-3 flex min-w-0 flex-col/);
  assert.match(notice, /line-clamp-2 text-\[13px\] text-admin-ink-muted max-sm:hidden/);
  assert.match(notice, /flex shrink-0 flex-nowrap gap-2 max-sm:gap-1/);
  assert.match(notice, /min-h-11/);
  const pill = read("../talent/site/maison-setup/MyWebsiteCard.tsx");
  assert.match(pill, /data-testid="maison-live-address"[\s\S]{0,200}overflow-hidden text-ellipsis whitespace-nowrap/);
});
