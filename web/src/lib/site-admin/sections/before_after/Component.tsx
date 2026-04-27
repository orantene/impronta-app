import { presentationDataAttrs, presentationInlineStyles } from "../shared/presentation";
import { renderInlineRich } from "../shared/rich-text";
import { SectionHead } from "../shared/section-primitives";
import type { SectionComponentProps } from "../types";
import type { BeforeAfterV1 } from "./schema";

/**
 * Pure-CSS / pure-HTML before/after slider. Uses a native <input type="range">
 * styled to look like a vertical divider handle; the slider's value drives a
 * CSS custom property that controls the clip-path of the "after" image.
 *
 * No JS required — works with prefers-reduced-motion, no hydration cost.
 *
 * Phase E (Batch 3 halfway) — head-only migration. The bespoke `__inner`
 * width (min(960px, 100%)) is INTENTIONALLY preserved (narrower than the
 * standard Container). The frame, range-input, clip-path overlays, labels,
 * and enhancement script all stay bespoke. Only the head typography rhythm
 * is unified.
 */
export function BeforeAfterComponent({ props }: SectionComponentProps<BeforeAfterV1>) {
  const {
    eyebrow,
    headline,
    beforeUrl,
    afterUrl,
    beforeAlt,
    afterAlt,
    beforeLabel,
    afterLabel,
    initialPosition,
    ratio,
    presentation,
  } = props;
  return (
    <section
      className="site-ba"
      data-ratio={ratio}
      {...presentationDataAttrs(presentation)}
      style={presentationInlineStyles(presentation)}
    >
      <div className="site-ba__inner">
        {(eyebrow || headline) && (
          <SectionHead
            align="center"
            eyebrow={eyebrow}
            headline={headline ? renderInlineRich(headline) : undefined}
          />
        )}
        <div
          className="site-ba__frame"
          style={{ ["--ba-pos" as string]: `${initialPosition}%` }}
        >
          {/* Before image fills the frame. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="site-ba__img site-ba__img--before" src={beforeUrl} alt={beforeAlt ?? ""} aria-hidden={beforeAlt ? undefined : true} loading="lazy" />
          {/* After image is clip-pathed to reveal only its right side. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="site-ba__img site-ba__img--after" src={afterUrl} alt={afterAlt ?? ""} aria-hidden={afterAlt ? undefined : true} loading="lazy" />
          <span className="site-ba__label site-ba__label--before" aria-hidden>
            {beforeLabel}
          </span>
          <span className="site-ba__label site-ba__label--after" aria-hidden>
            {afterLabel}
          </span>
          <input
            type="range"
            min={0}
            max={100}
            defaultValue={initialPosition}
            aria-label="Reveal slider"
            className="site-ba__range"
            // Inline onInput keeps the section JS-free at SSR; the input
            // event is wired by the browser to update the local CSS var.
            // We use a tiny attribute-based listener via the data-attr
            // selector below; for true zero-JS we'd need a CSS-only trick
            // (which loses the smooth update). This 6-line script runs
            // only when this section is in the DOM.
            onInput={undefined}
          />
        </div>
      </div>
      {/* tiny enhancement script — wires range value into CSS var */}
      <script
        dangerouslySetInnerHTML={{
          __html: `
            (function(){
              var roots = document.currentScript.parentElement.querySelectorAll('.site-ba__frame');
              roots.forEach(function(root){
                var r = root.querySelector('.site-ba__range');
                if(!r) return;
                r.addEventListener('input', function(){ root.style.setProperty('--ba-pos', r.value + '%'); });
              });
            })();
          `,
        }}
      />
    </section>
  );
}
