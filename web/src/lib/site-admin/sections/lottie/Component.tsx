import { presentationDataAttrs, presentationInlineStyles } from "../shared/presentation";
import { renderInlineRich } from "../shared/rich-text";
import type { SectionComponentProps } from "../types";
import type { LottieV1 } from "./schema";

/**
 * Phase 5 — Lottie embed via the @lottiefiles/lottie-player web-component.
 *
 * The web-component is loaded once from unpkg via a `<script type="module">`
 * tag the renderer injects. This avoids adding a runtime dep to the bundle
 * (the script is fetched lazily, only on pages that actually use Lottie).
 *
 * The custom element hydrates client-side. SSR renders a sized
 * placeholder so the layout doesn't shift.
 */
export function LottieComponent({ props }: SectionComponentProps<LottieV1>) {
  const {
    eyebrow,
    headline,
    caption,
    src,
    trigger,
    loop,
    speed,
    ratio,
    maxWidth,
    presentation,
  } = props;

  return (
    <section
      className="site-lottie"
      {...presentationDataAttrs(presentation)}
      style={presentationInlineStyles(presentation)}
    >
      <div className="site-lottie__inner">
        {(eyebrow || headline) && (
          <header className="site-lottie__head">
            {eyebrow ? <span className="site-eyebrow">{eyebrow}</span> : null}
            {headline ? (
              <h2 className="site-lottie__headline">{renderInlineRich(headline)}</h2>
            ) : null}
          </header>
        )}
        <div
          className="site-lottie__frame"
          style={{ aspectRatio: ratio, maxWidth: `${maxWidth}px` }}
        >
          {/* @lottiefiles/lottie-player web-component. The host element
              is `lottie-player` — TypeScript doesn't know about it, so we
              cast to a generic JSX element. The script tag below loads
              the implementation once per page (browser caches across
              sections). */}
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {(() => {
            // Custom element renderer — using createElement keeps TS happy
            // without us declaring the global JSX shape for `lottie-player`.
            return (
              <lottie-player
                src={src}
                speed={String(speed)}
                {...(loop ? { loop: "" } : {})}
                {...(trigger === "autoplay" ? { autoplay: "" } : {})}
                {...(trigger === "hover" ? { hover: "" } : {})}
                {...(trigger === "click" ? { click: "" } : {})}
                style={{ width: "100%", height: "100%" }}
              />
            );
          })()}
        </div>
        {caption ? <p className="site-lottie__caption">{caption}</p> : null}
      </div>
      {/* eslint-disable-next-line @next/next/no-sync-scripts -- type=module is async per HTML spec */}
      <script
        type="module"
        src="https://unpkg.com/@lottiefiles/lottie-player@2.0.8/dist/lottie-player.js"
      />
    </section>
  );
}
