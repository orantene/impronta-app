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
  /**
   * Artifact-name + golden suffix. Defaults to `state`. Set this when a design
   * captures TWO frames of the same state so their PNGs don't collide — e.g.
   * editorial captures both a CTA `hover` (`editorial-1440-hover`) and a
   * series-card `hover` (`editorial-1440-cardlift`).
   */
  key?: string;
  /**
   * Overrides the element the motion state acts on:
   *  - `hover`  — the element to drive `:hover` onto (default: the first CTA,
   *    `FIDELITY_HOVER_SELECTOR`). Card-lift frames point this at a repeated card
   *    via an ends-with `data-builder-node-id` selector, e.g.
   *    `[data-builder-node-id$="__agency-work-card"]` (first match wins).
   *  - `reveal` — the animated node to scroll into view (default: the first node
   *    carrying an inline `animation`/`animation-timeline`).
   */
  targetSelector?: string;
}

/** Artifact + golden suffix for a frame: its explicit `key`, else its `state`. */
export function fidelityMotionFrameKey(frame: FidelityMotionFrame): string {
  return frame.key ?? frame.state;
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
  // editorial hero CTA hovered (first button) — proves the declared CTA hover
  // (ink fill + scale + shadow) settles to its hovered end state.
  { design: "editorial", state: "hover", width: 1440, height: 1100 },
  // editorial series-card hover-lift — its 2nd hover behaviour. `key:"cardlift"`
  // so it doesn't collide with the CTA `hover` PNG; targets a repeated series
  // card (not the first button) so the captured frame shows the card raised.
  {
    design: "editorial",
    state: "hover",
    key: "cardlift",
    width: 1440,
    height: 1100,
    targetSelector: '[data-builder-node-id$="__editorial-series-card"]',
  },
  // agency selected-work card lift — the contact-sheet card the scorecard calls
  // out as agency's signature motion. Targets a repeated work card (NOT the hero
  // CTA the default selector would hit) so the frame proves the translate lift.
  {
    design: "agency",
    state: "hover",
    width: 1440,
    height: 1100,
    targetSelector: '[data-builder-node-id$="__agency-work-card"]',
  },
  // agency "selected work" scroll-reveal settled — agency's 2nd proven behaviour.
  { design: "agency", state: "reveal", width: 1440, height: 1100 },
  // ── P5 Lane C — two new archetypes (append-only) ─────────────────────────────
  // store sticky add-to-cart bar + backdrop-filter glass rendered OVER scrolled
  // content (the e-commerce signature: the buy bar pins as you scroll the page).
  { design: "store", state: "scrolled", width: 1440, height: 1100 },
  // store "you may also like" product-card hover-lift — targets a repeated
  // related-product card (NOT the first button) so the frame proves the lift.
  {
    design: "store",
    state: "hover",
    width: 1440,
    height: 1100,
    targetSelector: '[data-builder-node-id$="__store-related-card"]',
  },
  // festival lineup scroll-reveal settled at its end state (rise into place).
  { design: "festival", state: "reveal", width: 1440, height: 1100 },
  // festival lineup-card hover-lift — targets a repeated performer card so the
  // frame proves the translate lift (not the hero "Get passes" CTA).
  {
    design: "festival",
    state: "hover",
    width: 1440,
    height: 1100,
    targetSelector: '[data-builder-node-id$="__festival-lineup-card"]',
  },
];

/** First CTA on the page — hovered to prove the hover/transition system. */
export const FIDELITY_HOVER_SELECTOR = ".site-builder-node--button";

/** Minimal structural Page surface — works for both `playwright` and `@playwright/test` pages. */
export interface MotionPage {
  evaluate<R>(fn: () => R | Promise<R>): Promise<R>;
  evaluate<R, A>(fn: (arg: A) => R | Promise<R>, arg: A): Promise<R>;
  hover(selector: string): Promise<void>;
}

/** Options for {@link applyMotionState}. */
export interface ApplyMotionStateOptions {
  /**
   * Overrides the default target (see {@link FidelityMotionFrame.targetSelector}).
   * For `hover`, the element to hover; for `reveal`, the animated node to scroll
   * into view. Omitted for the default first-CTA hover / first-animated-node
   * reveal.
   */
  targetSelector?: string;
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
  options: ApplyMotionStateOptions = {},
): Promise<void> {
  switch (state) {
    case "scrolled":
      await page.evaluate(() => {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        window.scrollTo(0, Math.max(0, Math.round(max * 0.5)));
      });
      break;
    case "hover": {
      // CSS `:hover` only fires from a real pointer, so use Playwright's input
      // (a synthetic MouseEvent does NOT match `:hover`).
      const selector = options.targetSelector ?? FIDELITY_HOVER_SELECTOR;
      if (options.targetSelector) {
        // A specific, deeper target (e.g. a repeated work/series card): center it
        // so the captured viewport is deterministic. Playwright's hover() would
        // otherwise auto-scroll the card to a layout-dependent offset → flaky
        // golden. `scrollIntoView({block:"center"})` is layout-derived and stable.
        await page.evaluate((sel) => {
          const el = document.querySelector<HTMLElement>(sel);
          if (!el) throw new Error(`motion[hover]: no element matches "${sel}"`);
          el.scrollIntoView({ block: "center", behavior: "instant" as ScrollBehavior });
        }, selector);
      } else {
        // Default first-CTA: reset to the top, where it sits in view. Preserves
        // the existing saas / editorial-CTA hover goldens exactly.
        await page.evaluate(() => window.scrollTo(0, 0));
      }
      await page.hover(selector);
      break;
    }
    case "reveal": {
      const selector = options.targetSelector ?? null;
      await page.evaluate((sel) => {
        const target = sel
          ? document.querySelector<HTMLElement>(sel)
          : document.querySelector<HTMLElement>(
              '.site-builder-node[style*="animation-timeline"], .site-builder-node[style*="animation"]',
            );
        if (!target) throw new Error("motion[reveal]: no animated node found");
        target.scrollIntoView({ block: "center", behavior: "instant" as ScrollBehavior });
      }, selector);
      break;
    }
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
