import { presentationDataAttrs, presentationInlineStyles } from "../shared/presentation";
import { renderInlineRich } from "../shared/rich-text";
import type { SectionComponentProps } from "../types";
import type { DonationFormV1 } from "./schema";

const FMT: Record<string, string> = {
  USD: "$",
  EUR: "€",
  GBP: "£",
  AUD: "A$",
  CAD: "C$",
  MXN: "MX$",
};

export function DonationFormComponent({ props }: SectionComponentProps<DonationFormV1>) {
  const { eyebrow, headline, intro, amounts, currency, defaultAmountIndex, allowCustom, checkoutUrl, ctaLabel, trustNote, presentation } = props;
  const symbol = FMT[currency] ?? `${currency} `;
  return (
    <section
      className="site-donate"
      {...presentationDataAttrs(presentation)}
      style={presentationInlineStyles(presentation)}
    >
      <div className="site-donate__inner">
        {(eyebrow || headline || intro) && (
          <header className="site-donate__head">
            {eyebrow ? <span className="site-eyebrow">{eyebrow}</span> : null}
            {headline ? <h2 className="site-donate__headline">{renderInlineRich(headline)}</h2> : null}
            {intro ? <p className="site-donate__intro">{intro}</p> : null}
          </header>
        )}
        <form className="site-donate__form" action={checkoutUrl} method="GET">
          <div className="site-donate__chips" role="radiogroup" aria-label="Donation amount">
            {amounts.map((amt, i) => (
              <label key={`amt-${i}`} className="site-donate__chip">
                <input
                  type="radio"
                  name="amount"
                  value={String(amt)}
                  defaultChecked={i === defaultAmountIndex}
                />
                <span>
                  {symbol}
                  {amt.toLocaleString()}
                </span>
              </label>
            ))}
          </div>
          {allowCustom ? (
            <div className="site-donate__custom">
              <label htmlFor="donate-custom" className="site-donate__custom-label">
                Or enter a custom amount
              </label>
              <div className="site-donate__custom-input">
                <span aria-hidden>{symbol}</span>
                <input id="donate-custom" type="number" name="custom_amount" min="1" step="1" placeholder="0" />
              </div>
            </div>
          ) : null}
          <button type="submit" className="site-btn site-btn--primary site-donate__submit">
            {ctaLabel}
          </button>
          {trustNote ? <p className="site-donate__trust">{trustNote}</p> : null}
        </form>
      </div>
    </section>
  );
}
