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

test("TUL-914: at 390 the top bar row fits the viewport (site chip shrinks, Publish is compact, divider hidden)", () => {
  const bar = read("./topbar.tsx");
  assert.match(bar, /max-\[640px\]:w-full max-\[640px\]:min-w-0/);
  assert.match(bar, /data-page-picker>/);
  assert.match(bar, /relative shrink-0 max-\[640px\]:min-w-0 max-\[640px\]:max-w-\[104px\] max-\[640px\]:shrink" data-page-picker/);
  assert.match(bar, /max-\[640px\]:min-w-0 max-\[640px\]:truncate/);
  assert.match(bar, /shrink-0 max-\[640px\]:hidden"\s*style=\{\{\s*width: 1,/);
  // Publish: padding moved out of the inline style so the phone class can shrink it; 44px tap height is TB_CONTROL_H.
  assert.match(bar, /pl-\[20px\] pr-\[18px\][^"]*max-\[640px\]:px-\[10px\]/);
  assert.doesNotMatch(bar, /padding: "0 18px 0 20px"/);
  assert.match(read("./talent-builder-identity.tsx"), /max-\[640px\]:max-w-\[72px\] max-\[640px\]:truncate/);
});

test("TUL-914: at 390 the right command rail folds behind an edge handle instead of covering the canvas", () => {
  const rail = read("./inspector-command-rail.tsx");
  assert.match(rail, /data-mobile-inspector-rail-tab/);
  assert.match(rail, /hidden max-sm:flex[^"]* fixed/);
  assert.match(rail, /max-sm:!right-0[^"]*max-sm:!translate-x-\[var\(--ec-mobile-rail-x\)\]/);
  assert.match(rail, /"--ec-mobile-rail-x": mobileExpanded \? "0px" : "120%"/);
  assert.match(rail, /MOBILE_RAIL_EXPAND_EVENT/);
  assert.match(rail, /Collapse section editor tabs/);
  const es = read("./editor-i18n-es-canvas.ts");
  assert.match(es, /"Open section editor tabs":/);
  assert.match(es, /"Collapse section editor tabs":/);
});

test("TUL-1151: at 390 the rail handle and unfolded rail sit below the preview header, clear of its ES / EN switch", () => {
  const rail = read("./inspector-command-rail.tsx");
  assert.match(rail, /data-mobile-inspector-rail-tab[\s\S]*?className="hidden max-sm:flex max-sm:!top-\[38vh\] fixed/);
  assert.match(rail, /className="fixed flex flex-col max-sm:!right-0 max-sm:!top-\[38vh\] /);
});

test("TUL-1151: the phone rail and its handle hide while a site dialog (the mobile menu with its ES / EN row) locks the page", () => {
  const rail = read("./inspector-command-rail.tsx");
  const hide = "max-sm:[body[data-scroll-locked]_&]:!hidden";
  assert.equal(rail.split(hide).length - 1, 2);
});

test("TUL-1173: the unfolded phone rail is height-capped below the 38vh line and scrolls on short viewports", () => {
  const rail = read("./inspector-command-rail.tsx");
  assert.match(rail, /max-sm:!top-\[38vh\] max-sm:max-h-\[calc\(100dvh-38vh-8px\)\] max-sm:overflow-y-auto /);
  assert.match(rail, /max-sm:overflow-y-auto max-sm:overscroll-contain /);
});

test("TUL-914: picking a rail tab on a phone also slides the inspector dock in, so the panel is visible", () => {
  const dock = read("./command-dock.tsx");
  assert.match(dock, /export const MOBILE_INSPECTOR_OPEN_EVENT = "ec-mobile-inspector-open"/);
  const rail = read("./inspector-command-rail.tsx");
  assert.match(rail, /toggleInspectorTab\(key\);[\s\S]{0,120}dispatchEvent\(new CustomEvent\(MOBILE_INSPECTOR_OPEN_EVENT\)\)/);
  const inspector = read("./inspector-dock.tsx");
  assert.match(inspector, /useMobileInspectorOpen\(expandMobileInspector\);/);
  assert.match(read("./use-mobile-inspector-open.ts"), /addEventListener\(MOBILE_INSPECTOR_OPEN_EVENT, onOpen\)/);
});
