"use client";

/**
 * AnimationGallery — the preset picker for the inspector's Animation tab.
 *
 * A grid of cards, one per preset the RENDERER implements. Each card holds a
 * miniature of the motion and plays it on hover / keyboard focus, so the
 * operator sees what a preset does before committing to it. Pure CSS: the
 * preview keyframes live in the scoped sheet below, there is no animation
 * library and no JS timer driving the previews.
 *
 * WHY A SCOPED SHEET AND NOT INLINE STYLES
 * ────────────────────────────────────────
 * Tailwind v4 gives an inline `style` attribute higher precedence than a hover
 * variant, so a hover-driven preview cannot be expressed inline at all. The
 * cards therefore get real class names and one `<style>` element.
 *
 * WHERE THE PREVIEW KEYFRAMES LIVE
 * ───────────────────────────────
 * Beside the preset table, in `lib/site-admin/builder-node/animation-presets`,
 * not here: `lib` may not import `components/edit-chrome`, and the parity guard
 * that pins card <-> keyframe <-> preview lives with the renderer. Adding a
 * preset is one edit there plus one `@keyframes bn-anim-*` in render.tsx, and
 * `animation-preset-parity.static.test.ts` fails if either half is missed.
 */

import { useId } from "react";

import {
  BUILDER_ANIMATION_PRESET_SPECS,
  BUILDER_ANIMATION_PREVIEW_CSS,
  type BuilderAnimationPreset,
} from "@/lib/site-admin/builder-node/animation-presets";
import { CHROME } from "../kit/tokens";
import { useInspectorT } from "./kit/use-inspector-t";

/**
 * Card chrome. Kept in the same sheet so the hover rules and the keyframes ship
 * together -- a card whose preview keyframe went missing would otherwise fail
 * silently as "a tile that does nothing on hover".
 */
const GALLERY_CHROME_CSS = `
.bnag-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}
.bnag-card{display:flex;flex-direction:column;align-items:center;gap:5px;padding:8px 4px 7px;border-radius:9px;border:1px solid ${CHROME.line};background:${CHROME.surface};color:${CHROME.muted};cursor:pointer;transition:border-color 120ms,background 120ms,color 120ms}
.bnag-card:hover{border-color:${CHROME.lineStrong};color:${CHROME.text}}
.bnag-card:focus-visible{outline:2px solid ${CHROME.accent};outline-offset:1px}
.bnag-card[aria-checked="true"]{border-color:${CHROME.accent};background:${CHROME.selectHalo};color:${CHROME.accentInk};font-weight:600}
.bnag-stage{position:relative;width:100%;height:34px;display:flex;align-items:center;justify-content:center;overflow:hidden;border-radius:6px;background:${CHROME.paper2}}
.bnag-shape{width:22px;height:13px;border-radius:3px;background:currentColor;opacity:0.75}
.bnag-label{font-size:10px;line-height:1.15;text-align:center}
.bnag-card:hover .bnag-shape,.bnag-card:focus-visible .bnag-shape{animation-duration:0.9s;animation-timing-function:cubic-bezier(0.34,1.56,0.64,1);animation-fill-mode:both}
.bnag-card[data-preset="none"] .bnag-shape{opacity:0.28}
.bnag-card[data-preset="none"] .bnag-stage::after{content:"";position:absolute;left:22%;right:22%;top:50%;height:1px;background:currentColor;opacity:0.45}
${BUILDER_ANIMATION_PRESET_SPECS.filter((s) => s.value !== "none")
  .map(
    (s) =>
      `.bnag-card[data-preset="${s.value}"]:hover .bnag-shape,.bnag-card[data-preset="${s.value}"]:focus-visible .bnag-shape{animation-name:bnag-${s.value}}`,
  )
  .join("\n")}
@media (prefers-reduced-motion:reduce){.bnag-card:hover .bnag-shape,.bnag-card:focus-visible .bnag-shape{animation:none}}
`;

export interface AnimationGalleryProps {
  value: BuilderAnimationPreset;
  onSelect: (next: BuilderAnimationPreset) => void;
}

export function AnimationGallery({ value, onSelect }: AnimationGalleryProps) {
  const { t } = useInspectorT();
  const sheetId = useId();
  return (
    <>
      <style
        data-animation-gallery-sheet={sheetId}
        // eslint-disable-next-line react/no-danger -- static, author-controlled
        // CSS built from the preset table above; no operator input reaches it.
        dangerouslySetInnerHTML={{
          __html: `${BUILDER_ANIMATION_PREVIEW_CSS}${GALLERY_CHROME_CSS}`,
        }}
      />
      <div className="bnag-grid" role="radiogroup" aria-label={t("Animation style")}>
        {BUILDER_ANIMATION_PRESET_SPECS.map((spec) => {
          const active = value === spec.value;
          return (
            <button
              key={spec.value}
              type="button"
              role="radio"
              aria-checked={active}
              className="bnag-card"
              data-preset={spec.value}
              title={`${t(spec.label)} - ${t(spec.description)}`}
              onClick={() => onSelect(spec.value)}
            >
              <span className="bnag-stage" aria-hidden>
                <span className="bnag-shape" />
              </span>
              <span className="bnag-label">{t(spec.label)}</span>
            </button>
          );
        })}
      </div>
    </>
  );
}
