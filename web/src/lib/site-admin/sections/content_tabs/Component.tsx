import { presentationDataAttrs, presentationInlineStyles } from "../shared/presentation";
import { renderInlineRich } from "../shared/rich-text";
import { Container, SectionHead } from "../shared/section-primitives";
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
      <Container width="standard">
        {(eyebrow || headline) && (
          <SectionHead
          align="center"
          eyebrow={eyebrow}
          headline={headline ? renderInlineRich(headline) : undefined}
        />
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
      </Container>
    </section>
  );
}
