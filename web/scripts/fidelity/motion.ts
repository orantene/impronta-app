/**
 * Motion-state captures for the fidelity harness.
 *
 * A static single-frame PNG cannot show three things the rubric needs to score:
 *  - `scrolled` — proves `position:sticky` headers stay pinned AND that
 *    `backdrop-filter` glass renders OVER real scrolled content (the SaaS glass
 *    axis, previously unscoreable from a pre-scroll frame).
 *  - `hover`    — proves the hover/transition system produces a real state change.
 *  - `reveal`   — proves a scroll-driven entrance animation reaches its settled
 *    end state when the element is scrolled into view (vs. stuck invisible).
 *
 * These run with `reducedMotion: "no-preference"` (so the renderer's
 * reduced-motion guard does NOT strip the animation) and are screenshotted with
 * Playwright `animations: "disabled"`, which fast-forwards time-based animations
 * and transitions to completion — yielding the settled state deterministically.
 * Scroll position and `:hover` are position/pseudo-class driven, so they are
 * deterministic too. A small `maxDiffPixels` tolerance still covers sub-pixel AA
 * drift across machines (documented in fidelity-rubric.md).
 */

export type FidelityMotionState = "scrolled" | "hover" | "reveal";

export interface FidelityMotionFrame {
  /** Registered design id (see designs.ts). */
  design: string;
  state: FidelityMotionState;
  width: number;
  height: number;
}

/**
 * Motion frames captured in addition to the static 1440/768/390 frames. Kept at
 * desktop width — sticky/glass/reveal read most truthfully there, and it bounds
 * the golden count. `trivial` is the determinism baseline and is static-only.
 *
 * HONEST-SCORING NOTE: only states a design ACTUALLY exercises are captured as
 * goldens. The current `saas`/`editorial` trees configure sticky+glass and a
 * scroll-reveal, but no button declares `stateStyles.hover`, so a `hover` frame
 * would baseline a frame identical to rest — a false "motion is covered" signal.
 * The `hover` state machinery is built and proven (see the throwaway smoke
 * design in the lane report), and `applyMotionState` supports it; a `hover`
 * golden is added the moment a registered design wires up hover styling (Lane B's
 * rebuilds will). Until then it is intentionally omitted, not silently baselined.
 */
export const FIDELITY_MOTION_FRAMES: readonly FidelityMotionFrame[] = [
  // saas sticky nav + backdrop-filter glass rendered OVER scrolled content.
  { design: "saas", state: "scrolled", width: 1440, height: 1100 },
  // editorial scroll-driven entrance animation settled at its end state.
  { design: "editorial", state: "reveal", width: 1440, height: 1100 },
];

/** First CTA on the page — hovered to prove the hover/transition system. */
export const FIDELITY_HOVER_SELECTOR = ".site-builder-node--button";

/** Minimal structural Page surface — works for both `playwright` and `@playwright/test` pages. */
export interface MotionPage {
  evaluate<R>(fn: () => R | Promise<R>): Promise<R>;
  evaluate<R, A>(fn: (arg: A) => R | Promise<R>, arg: A): Promise<R>;
  hover(selector: string): Promise<void>;
}

/**
 * Drive the page into the requested motion state. Idempotent and timing-free:
 * it only sets scroll position / hover, then settles a couple of animation
 * frames. The screenshot caller passes `animations: "disabled"` to fast-forward
 * the resulting transition/animation to its end state.
 */
export async function applyMotionState(
  page: MotionPage,
  state: FidelityMotionState,
): Promise<void> {
  switch (state) {
    case "scrolled":
      await page.evaluate(() => {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        window.scrollTo(0, Math.max(0, Math.round(max * 0.5)));
      });
      break;
    case "hover":
      // CSS `:hover` only fires from a real pointer, so use Playwright's input
      // (a synthetic MouseEvent does NOT match `:hover`). Reset scroll first so
      // the first CTA is near the top of the captured viewport.
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.hover(FIDELITY_HOVER_SELECTOR);
      break;
    case "reveal":
      await page.evaluate(() => {
        const target = document.querySelector<HTMLElement>(
          '.site-builder-node[style*="animation-timeline"], .site-builder-node[style*="animation"]',
        );
        if (!target) throw new Error("motion[reveal]: no animated node found");
        target.scrollIntoView({ block: "center", behavior: "instant" as ScrollBehavior });
      });
      break;
  }
  // Settle two animation frames so layout/scroll-timeline progress is applied
  // before the screenshot fast-forwards the animation to completion.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
}
