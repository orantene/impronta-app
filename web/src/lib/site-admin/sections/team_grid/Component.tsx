import { presentationDataAttrs, presentationInlineStyles } from "../shared/presentation";
import { renderInlineRich } from "../shared/rich-text";
import type { SectionComponentProps } from "../types";
import type { TeamGridV1 } from "./schema";

export function TeamGridComponent({ props }: SectionComponentProps<TeamGridV1>) {
  const { eyebrow, headline, intro, members, variant, columnsDesktop, presentation } = props;
  return (
    <section
      className="site-team"
      data-variant={variant}
      style={{
        ["--team-cols" as string]: String(columnsDesktop),
        ...presentationInlineStyles(presentation),
      }}
      {...presentationDataAttrs(presentation)}
    >
      <div className="site-team__inner">
        {(eyebrow || headline || intro) && (
          <header className="site-team__head">
            {eyebrow ? <span className="site-eyebrow">{eyebrow}</span> : null}
            {headline ? (
              <h2 className="site-team__headline">{renderInlineRich(headline)}</h2>
            ) : null}
            {intro ? <p className="site-team__intro">{intro}</p> : null}
          </header>
        )}
        <ul className="site-team__grid">
          {members.map((m, i) => {
            const inner = (
              <>
                {m.imageUrl ? (
                  <div className="site-team__media">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={m.imageUrl}
                      alt={m.imageAlt ?? ""}
                      aria-hidden={m.imageAlt ? undefined : true}
                      loading="lazy"
                    />
                  </div>
                ) : (
                  <div className="site-team__media site-team__media--placeholder" aria-hidden />
                )}
                <div className="site-team__copy">
                  <h3 className="site-team__name">{m.name}</h3>
                  {m.role ? <p className="site-team__role">{m.role}</p> : null}
                  {m.bio ? <p className="site-team__bio">{m.bio}</p> : null}
                </div>
              </>
            );
            return (
              <li className="site-team__item" key={`${m.name}-${i}`}>
                {m.href ? (
                  <a className="site-team__link" href={m.href}>
                    {inner}
                  </a>
                ) : (
                  inner
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
