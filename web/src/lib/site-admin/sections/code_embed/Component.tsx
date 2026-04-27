import { presentationDataAttrs, presentationInlineStyles } from "../shared/presentation";
import { renderInlineRich } from "../shared/rich-text";
import { Container, SectionHead } from "../shared/section-primitives";
import type { SectionComponentProps } from "../types";
import type { CodeEmbedV1 } from "./schema";

/**
 * Sandboxed iframe embed. Schema validation already restricts to an
 * allow-list of HTTPS hosts; the iframe carries `sandbox` flags so even
 * a compromised host can't run privileged JS or break out of the frame.
 *
 * Phase E (Batch 1) — uses Container + SectionHead. Distinctive interior:
 * the aspect-ratio frame + sandbox iframe + caption stays untouched.
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
      <Container width="standard">
        <SectionHead
          align="start"
          eyebrow={eyebrow}
          headline={headline ? renderInlineRich(headline) : undefined}
        />
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
      </Container>
    </section>
  );
}
