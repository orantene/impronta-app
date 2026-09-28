/**
 * AUD-035: editor canvas always shows content at its final state.
 *
 * The public renderer's scroll lanes (`data-bn-anim-once`, `data-bn-reveal`)
 * arm by appending a head stylesheet that holds un-revealed nodes at
 * `opacity:0` until an IntersectionObserver marks them `data-bn-revealed`.
 * Inside the page builder canvas the observer does not reliably fire (the
 * canvas is swapped and re-rendered in place, nested in the editor chrome),
 * so section headings such as "Services & focus" sat at or near opacity 0.
 *
 * This sheet is mounted ONLY by the talent page builder screen, so the public
 * site keeps its animations. Declarations are deliberately NOT `!important`:
 * a higher-specificity normal rule beats the armed pose, while a keyframe
 * animation (the Motion inspector's replay) still wins over it in the cascade.
 */
export const EDITOR_CANVAS_SCOPE = "[data-talent-page-builder-screen]";

export const EDITOR_CANVAS_REVEAL_CSS =
  `${EDITOR_CANVAS_SCOPE} .site-builder-node[data-bn-anim-once]:not([data-bn-revealed]),` +
  `${EDITOR_CANVAS_SCOPE} .site-builder-node[data-bn-reveal]:not([data-bn-revealed])` +
  `{opacity:1;transform:none}`;
