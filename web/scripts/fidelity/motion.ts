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
 * goldens. The P4 Lane B rebuilds wire real `style.hover` blocks (a scale +
 * box-shadow + colour shift with a base transition), so the `hover` frame now
 * captures a genuine state change rather than a frame identical to rest. The
 * `hover` selector hits the FIRST `.site-builder-node--button` on the page — for
 * `saas` that is the sticky-nav "Start free" CTA, which declares a hover style.
 */
export const FIDELITY_MOTION_FRAMES: readonly FidelityMotionFrame[] = [
  // saas sticky nav + backdrop-filter glass rendered OVER scrolled content.
  { design: "saas", state: "scrolled", width: 1440, height: 1100 },
  // saas nav CTA hovered — proves the hover/transition system settles to its
  // hovered end state (scale + glow) under animations:"disabled".
  { design: "saas", state: "hover", width: 1440, height: 1100 },
  // editorial scroll-driven entrance animation settled at its end state.
  { design: "editorial", state: "reveal", width: 1440, height: 1100 },
  // editorial hero CTA hovered — its 2nd proven motion behaviour alongside the
  // reveal (lifts Motion from "only one behaviour" toward faithful).
  { design: "editorial", state: "hover", width: 1440, height: 1100 },
  // agency hero CTA hovered — proves the declared hover (scale + glow); first
  // captured motion for agency (was built-but-uncaptured → scored static).
  { design: "agency", state: "hover", width: 1440, height: 1100 },
  // agency "selected work" scroll-reveal settled — agency's 2nd proven behaviour.
  { design: "agency", state: "reveal", width: 1440, height: 1100 },
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
