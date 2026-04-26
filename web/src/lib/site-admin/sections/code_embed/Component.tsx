import { presentationDataAttrs, presentationInlineStyles } from "../shared/presentation";
import { renderInlineRich } from "../shared/rich-text";
import type { SectionComponentProps } from "../types";
import type { CodeEmbedV1 } from "./schema";

/**
 * Sandboxed iframe embed. Schema validation already restricts to an
 * allow-list of HTTPS hosts; the iframe carries `sandbox` flags so even
 * a compromised host can't run privileged JS or break out of the frame.
 */
export function CodeEmbedComponent({ props }: SectionComponentProps<CodeEmbedV1>) {
  const { eyebrow, headline, caption, url, ratio, title, presentation } = props;
  return (
    <section
      className="site-embed"
      data-ratio={ratio}
      {...presentationDataAttrs(presentation)}
      style={presentationInlineStyles(presentation)}
    >
      <div className="site-embed__inner">
        {(eyebrow || headline) && (
          <header className="site-embed__head">
            {eyebrow ? <span className="site-eyebrow">{eyebrow}</span> : null}
            {headline ? (
              <h2 className="site-embed__headline">{renderInlineRich(headline)}</h2>
            ) : null}
          </header>
        )}
        <div className="site-embed__frame" style={{ aspectRatio: ratio }}>
          <iframe
            src={url}
            title={title}
            loading="lazy"
            allow="autoplay; encrypted-media; picture-in-picture; clipboard-write; web-share"
            sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-forms"
            referrerPolicy="no-referrer-when-downgrade"
            className="site-embed__iframe"
          />
        </div>
        {caption ? <p className="site-embed__caption">{caption}</p> : null}
      </div>
    </section>
  );
}
