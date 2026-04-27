import { presentationDataAttrs, presentationInlineStyles } from "../shared/presentation";
import { renderInlineRich } from "../shared/rich-text";
import { Container, SectionHead } from "../shared/section-primitives";
import type { SectionComponentProps } from "../types";
import type { LogoCloudV1 } from "./schema";

/**
 * Phase E (Batch 1) — uses Container + SectionHead. Distinctive interior:
 * the columns-desktop CSS var + the lazy-loaded logo grid stay untouched.
 */
export function LogoCloudComponent({ props }: SectionComponentProps<LogoCloudV1>) {
  const { eyebrow, headline, logos, columnsDesktop, variant, presentation } = props;
  return (
    <section
      className="site-logo-cloud"
      data-variant={variant}
      style={{ ["--lc-cols" as string]: String(columnsDesktop), ...presentationInlineStyles(presentation) }}
      {...presentationDataAttrs(presentation)}
    >
      <Container width="standard">
        <SectionHead
          align="center"
          eyebrow={eyebrow}
          headline={headline ? renderInlineRich(headline) : undefined}
        />
        <ul className="site-logo-cloud__grid">
          {logos.map((logo, i) => {
            const inner = (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="site-logo-cloud__img" src={logo.imageUrl} alt={logo.alt} loading="lazy" />
            );
            return (
              <li className="site-logo-cloud__item" key={`${logo.imageUrl}-${i}`}>
                {logo.href ? <a href={logo.href}>{inner}</a> : inner}
              </li>
            );
          })}
        </ul>
      </Container>
    </section>
  );
}
