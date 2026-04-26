import { presentationDataAttrs, presentationInlineStyles } from "../shared/presentation";
import { renderInlineRich } from "../shared/rich-text";
import type { SectionComponentProps } from "../types";
import type { LogoCloudV1 } from "./schema";

export function LogoCloudComponent({ props }: SectionComponentProps<LogoCloudV1>) {
  const { eyebrow, headline, logos, columnsDesktop, variant, presentation } = props;
  return (
    <section
      className="site-logo-cloud"
      data-variant={variant}
      style={{ ["--lc-cols" as string]: String(columnsDesktop), ...presentationInlineStyles(presentation) }}
      {...presentationDataAttrs(presentation)}
    >
      <div className="site-logo-cloud__inner">
        {(eyebrow || headline) && (
          <header className="site-logo-cloud__head">
            {eyebrow ? <span className="site-eyebrow">{eyebrow}</span> : null}
            {headline ? <h2 className="site-logo-cloud__headline">{renderInlineRich(headline)}</h2> : null}
          </header>
        )}
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
      </div>
    </section>
  );
}
