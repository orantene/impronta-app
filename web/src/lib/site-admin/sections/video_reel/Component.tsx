import { presentationDataAttrs, presentationInlineStyles } from "../shared/presentation";
import { renderInlineRich } from "../shared/rich-text";
import { Container, SectionHead } from "../shared/section-primitives";
import type { SectionComponentProps } from "../types";
import type { VideoReelV1 } from "./schema";

/**
 * Phase E (Batch 3 halfway) — head-only migration. The video frame, chapter
 * list typography, time-formatting helper, and chapter-jump enhancement
 * script all stay bespoke. Only eyebrow + headline rhythm is unified.
 */

function fmt(t: number): string {
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function VideoReelComponent({ props }: SectionComponentProps<VideoReelV1>) {
  const { eyebrow, headline, videoUrl, posterUrl, chapters, ratio, controls, loop, muted, autoplay, presentation } = props;
  return (
    <section
      className="site-reel"
      data-ratio={ratio}
      {...presentationDataAttrs(presentation)}
      style={presentationInlineStyles(presentation)}
    >
      <Container width="standard">
        {(eyebrow || headline) && (
          <SectionHead
            align="center"
            eyebrow={eyebrow}
            headline={headline ? renderInlineRich(headline) : undefined}
          />
        )}
        <div className="site-reel__frame" style={{ aspectRatio: ratio }}>
          <video
            id="reel-video"
            className="site-reel__video"
            src={videoUrl}
            poster={posterUrl}
            controls={controls}
            loop={loop}
            muted={muted}
            autoPlay={autoplay}
            playsInline
            preload="metadata"
            aria-label={headline || "Video"}
          >
            <track kind="captions" />
          </video>
        </div>
        {chapters.length > 0 ? (
          <ol className="site-reel__chapters">
            {chapters.map((c, i) => (
              <li key={`${c.time}-${i}`}>
                <a href={`#t=${c.time}`} data-time={c.time} className="site-reel__chapter">
                  <time>{fmt(c.time)}</time>
                  <span>{c.label}</span>
                </a>
              </li>
            ))}
          </ol>
        ) : null}
      </Container>
      {chapters.length > 0 ? (
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var s=document.currentScript;var sec=s.parentElement;var v=sec.querySelector('video');if(!v)return;sec.querySelectorAll('[data-time]').forEach(function(a){a.addEventListener('click',function(e){e.preventDefault();v.currentTime=Number(a.dataset.time);v.play();});});})();`,
          }}
        />
      ) : null}
    </section>
  );
}
