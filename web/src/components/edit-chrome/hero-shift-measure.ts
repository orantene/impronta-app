/**
 * hero-shift-measure — TUL-397 / TUL-79 scrollLeft probe.
 *
 * Run-6 saw a ~107px left shift on the STUDIO builder (qa-fresh-studio-2),
 * not the talent builder. Ken-Burns scale(1.08) arithmetic matches 107 at
 * 1340, but `.site-hero` already uses `overflow: clip` on main, so that
 * alone does not prove the scroller. This helper records scrollLeft on the
 * candidates a canvas "+" / scrollIntoView can move.
 */

export interface HeroShiftSnapshot {
  heroScrollLeft: number;
  canvasRootScrollLeft: number;
  bodyScrollLeft: number;
  documentElementScrollLeft: number;
}

export interface HeroShiftMeasureInput {
  hero: HTMLElement;
  canvasRoot: HTMLElement;
  /** Element inside the hero that focus / scrollIntoView targets (e.g. CTA). */
  focusTarget: HTMLElement;
}

/** Read scrollLeft from the scroller candidates involved in the studio shift. */
export function readHeroShiftSnapshot(
  input: Pick<HeroShiftMeasureInput, "hero" | "canvasRoot">,
): HeroShiftSnapshot {
  const doc = input.hero.ownerDocument;
  return {
    heroScrollLeft: input.hero.scrollLeft,
    canvasRootScrollLeft: input.canvasRoot.scrollLeft,
    bodyScrollLeft: doc.body.scrollLeft,
    documentElementScrollLeft: doc.documentElement.scrollLeft,
  };
}

/**
 * Focus the target and ask it to scroll into view, then re-measure.
 * Returns before/after so a studio repro can name the scroller that moved.
 */
export function measureHeroShiftAfterScrollIntoView(
  input: HeroShiftMeasureInput,
): { before: HeroShiftSnapshot; after: HeroShiftSnapshot } {
  const before = readHeroShiftSnapshot(input);
  input.focusTarget.focus({ preventScroll: false });
  if (typeof input.focusTarget.scrollIntoView === "function") {
    input.focusTarget.scrollIntoView({
      block: "nearest",
      inline: "nearest",
    });
  }
  const after = readHeroShiftSnapshot(input);
  return { before, after };
}

/** True when any measured scroller moved horizontally. */
export function heroShiftDetected(
  before: HeroShiftSnapshot,
  after: HeroShiftSnapshot,
): boolean {
  return (
    after.heroScrollLeft !== before.heroScrollLeft ||
    after.canvasRootScrollLeft !== before.canvasRootScrollLeft ||
    after.bodyScrollLeft !== before.bodyScrollLeft ||
    after.documentElementScrollLeft !== before.documentElementScrollLeft
  );
}

/**
 * Desktop-canvas chrome gutters (command dock + inspector rail) that must
 * stay reserved at tablet/phone editor viewports. BodyPaddingController used
 * to gate these behind `@media (min-width: 1024px)`, which left the rails
 * over the live storefront at 768 and 390 (run-6 desktop tier).
 */
export function resolveDesktopCanvasRailGutters(input: {
  previewing: boolean;
  panelLeft: number;
  panelRight: number;
  commandDockSafeLeftPx: number;
  inspectorRailSafeRightPx: number;
}): { left: number; right: number } {
  if (input.previewing) return { left: 0, right: 0 };
  return {
    left: Math.max(input.panelLeft, input.commandDockSafeLeftPx),
    right: Math.max(input.panelRight, input.inspectorRailSafeRightPx),
  };
}

/**
 * Remaining canvas width beside reserved rails. At 768/390 with the default
 * 120px rails this must stay > 0 so the hero is beside chrome, not under it.
 */
export function desktopCanvasContentWidthPx(input: {
  viewportWidth: number;
  leftGutter: number;
  rightGutter: number;
}): number {
  if (!(input.viewportWidth > 0)) return 0;
  return Math.max(0, input.viewportWidth - input.leftGutter - input.rightGutter);
}

/**
 * CSS injected by BodyPaddingController.
 *
 * Body padding alone is not enough: agency transparent headers are
 * `position:fixed; left:0; right:0` (ignore padding), and `.site-prim-fullbleed`
 * uses `100vw` breakout. Also pin the canvas root to `overflow-x: clip` so a
 * studio `scrollIntoView` cannot be the unnamed ~107px scroller.
 */
export function buildEditChromeGutterStyleCss(
  leftPx: number,
  rightPx: number,
): string {
  const left = Math.max(0, leftPx);
  const right = Math.max(0, rightPx);
  return [
    `body {`,
    `  padding-left: ${left}px !important;`,
    `  padding-right: ${right}px !important;`,
    `  --edit-chrome-gutter-left: ${left}px;`,
    `  --edit-chrome-gutter-right: ${right}px;`,
    `  transition: padding-left 200ms ease, padding-right 200ms ease;`,
    `}`,
    /* Fixed storefront headers ignore body padding — inset them to the gutters. */
    `[data-cms-section][data-section-type-key="site_header"] .site-header[data-tone="transparent"],`,
    `header[data-public-header][data-tone="transparent"] {`,
    `  left: ${left}px !important;`,
    `  right: ${right}px !important;`,
    `  width: auto !important;`,
    `}`,
    /* 100vw breakouts would slide under the rails despite body padding. */
    `.site-prim-fullbleed {`,
    `  width: 100% !important;`,
    `  max-width: 100% !important;`,
    `  margin-inline: 0 !important;`,
    `}`,
    /* Studio hero-shift candidate: canvas root must not scroll horizontally. */
    `[data-in-editor-canvas-region] { overflow-x: clip !important; }`,
  ].join("\n");
}
