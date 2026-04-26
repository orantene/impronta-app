import { presentationDataAttrs, presentationInlineStyles } from "../shared/presentation";
import { renderInlineRich } from "../shared/rich-text";
import type { SectionComponentProps } from "../types";
import type { ContentTabsV1 } from "./schema";

/**
 * CSS-only tabs using a radio-input + sibling-selector pattern. No JS,
 * works without hydration; the radios are visually hidden but keyboard
 * focusable for a11y.
 */
export function ContentTabsComponent({ props }: SectionComponentProps<ContentTabsV1>) {
  const { eyebrow, headline, tabs, variant, defaultTab, presentation } = props;
  const groupName = `tabs-${headline?.slice(0, 8) ?? "section"}-${tabs.length}`;
  return (
    <section
      className="site-tabs"
      data-variant={variant}
      {...presentationDataAttrs(presentation)}
      style={presentationInlineStyles(presentation)}
    >
      <div className="site-tabs__inner">
        {(eyebrow || headline) && (
          <header className="site-tabs__head">
            {eyebrow ? <span className="site-eyebrow">{eyebrow}</span> : null}
            {headline ? (
              <h2 className="site-tabs__headline">{renderInlineRich(headline)}</h2>
            ) : null}
          </header>
        )}
        <div className="site-tabs__group" role="tablist">
          {tabs.map((tab, i) => (
            <input
              key={`r-${i}`}
              type="radio"
              name={groupName}
              id={`${groupName}-${i}`}
              defaultChecked={i === defaultTab}
              className="site-tabs__radio"
              data-tab-index={i}
            />
          ))}
          <div className="site-tabs__labels">
            {tabs.map((tab, i) => (
              <label
                key={`l-${i}`}
                htmlFor={`${groupName}-${i}`}
                className="site-tabs__label"
                role="tab"
              >
                {tab.label}
              </label>
            ))}
          </div>
          <div className="site-tabs__panels">
            {tabs.map((tab, i) => (
              <div key={`p-${i}`} className="site-tabs__panel" data-tab-index={i} role="tabpanel">
                {tab.body.split("\n\n").map((p, k) => (
                  <p key={k}>{renderInlineRich(p)}</p>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
