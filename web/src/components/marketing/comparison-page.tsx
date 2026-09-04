import Link from "next/link";
import { MarketingContainer, MarketingSection } from "@/components/marketing/container";
import { MarketingCta } from "@/components/marketing/cta-link";
import { withLocaleHref } from "@/i18n/pathnames";
import type { Comparison } from "@/lib/marketing/compare";
import { comparisonContent } from "@/lib/marketing/compare";

/**
 * The comparison page body.
 *
 * Deliberately plain. Someone reading this is comparing prices, not admiring
 * a layout, and the fastest possible answer is the persuasive one. The table
 * is the page; everything else is context around it.
 *
 * The "where they are stronger" block is NOT tucked at the bottom in small
 * text. It sits at full weight between the table and the CTA, because a
 * comparison that never concedes anything reads as an advert and gets
 * discounted entirely.
 */
export function ComparisonPage({ comparison, locale }: { comparison: Comparison; locale: string }) {
  const c = comparisonContent(comparison, locale);
  const es = locale === "es";
  const L = (href: string) => withLocaleHref(href, locale);

  return (
    <>
      <MarketingSection spacing="tight">
        <MarketingContainer size="wide">
          <div className="mx-auto max-w-3xl">
            <h1
              className="plt-display"
              style={{
                fontSize: "clamp(2rem, 5.4vw, 3.2rem)",
                lineHeight: 1.05,
                color: "var(--plt-ink)",
              }}
            >
              {c.title}
            </h1>
            <p
              className="plt-display-serif mt-4 italic"
              style={{ fontSize: "1.18rem", lineHeight: 1.5, color: "var(--plt-forest)" }}
            >
              {c.subtitle}
            </p>
            <div
              className="plt-body mt-6 flex flex-col gap-4"
              style={{ fontSize: "1.0625rem", lineHeight: 1.7, color: "var(--plt-ink-soft)" }}
            >
              {c.intro.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          </div>
        </MarketingContainer>
      </MarketingSection>

      <MarketingSection spacing="tight">
        <MarketingContainer size="wide">
          <div className="mx-auto max-w-4xl">
            <h2
              className="plt-display"
              style={{ fontSize: "clamp(1.5rem, 3.4vw, 2rem)", color: "var(--plt-ink)" }}
            >
              {c.tableHeading}
            </h2>

            <div
              className="mt-6 overflow-x-auto rounded-[14px]"
              style={{ border: "1px solid var(--plt-hairline)" }}
            >
              <table className="w-full border-collapse" style={{ minWidth: "560px" }}>
                <thead>
                  <tr style={{ background: "var(--plt-bg-raised)" }}>
                    <th className="plt-eyebrow p-3 text-left" style={{ color: "var(--plt-muted)" }} />
                    <th
                      className="plt-eyebrow p-3 text-left"
                      style={{ color: "var(--plt-forest)" }}
                    >
                      Tulala
                    </th>
                    <th className="plt-eyebrow p-3 text-left" style={{ color: "var(--plt-muted)" }}>
                      {comparison.competitor}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {c.rows.map((row) => (
                    <tr key={row.label} style={{ borderTop: "1px solid var(--plt-hairline)" }}>
                      <td
                        className="p-3 align-top"
                        style={{ color: "var(--plt-ink)", fontWeight: 600, fontSize: "0.9rem" }}
                      >
                        {row.label}
                      </td>
                      <td
                        className="p-3 align-top"
                        style={{ color: "var(--plt-ink-soft)", fontSize: "0.9rem", lineHeight: 1.55 }}
                      >
                        {row.tulala}
                      </td>
                      <td
                        className="p-3 align-top"
                        style={{ color: "var(--plt-muted)", fontSize: "0.9rem", lineHeight: 1.55 }}
                      >
                        {row.them}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Provenance sits directly under the table, where a sceptical
                reader looks for it. */}
            <p className="mt-3" style={{ fontSize: "0.8125rem", color: "var(--plt-muted)" }}>
              {es ? "Precios de " : "Pricing for "}
              {comparison.competitor}
              {es ? " revisados el " : " checked on "}
              {comparison.pricingCheckedOn}
              {es
                ? ". Los precios cambian, así que verifícalos aquí: "
                : ". Prices change, so verify them here: "}
              {comparison.sources.map((src, i) => (
                <span key={src.url}>
                  {i > 0 ? ", " : ""}
                  <a
                    href={src.url}
                    rel="nofollow noopener"
                    target="_blank"
                    style={{ color: "var(--plt-forest)" }}
                  >
                    {src.label}
                  </a>
                </span>
              ))}
              {es ? ". Los nuestros están en " : ". Ours are on our "}
              <Link href={L("/pricing")} style={{ color: "var(--plt-forest)" }}>
                {es ? "nuestra página de precios" : "pricing page"}
              </Link>
              .
            </p>

            {/* Published, not buried. When we could not read a figure from the
                competitor's own page, the reader is told so in the same place
                they are told when it was checked. A page whose job is being
                checkable cannot overstate its own sourcing. */}
            {comparison.sourceCaveat ? (
              <p
                className="mt-2"
                style={{ fontSize: "0.8125rem", color: "var(--plt-muted)", fontStyle: "italic" }}
              >
                {es ? comparison.sourceCaveat.es : comparison.sourceCaveat.en}
              </p>
            ) : null}
          </div>
        </MarketingContainer>
      </MarketingSection>

      <MarketingSection spacing="tight">
        <MarketingContainer size="wide">
          <div className="mx-auto max-w-3xl">
            <h2
              className="plt-display"
              style={{ fontSize: "clamp(1.5rem, 3.4vw, 2rem)", color: "var(--plt-ink)" }}
            >
              {c.honestHeading}
            </h2>
            <div
              className="plt-body mt-4 flex flex-col gap-4"
              style={{ fontSize: "1rem", lineHeight: 1.7, color: "var(--plt-ink-soft)" }}
            >
              {c.honest.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>

            <h2
              className="plt-display mt-12"
              style={{ fontSize: "clamp(1.5rem, 3.4vw, 2rem)", color: "var(--plt-ink)" }}
            >
              {c.fitHeading}
            </h2>
            <ul className="mt-5 flex flex-col">
              {c.fit.map((line) => (
                <li
                  key={line}
                  className="plt-body py-3"
                  style={{
                    borderTop: "1px solid var(--plt-hairline)",
                    color: "var(--plt-ink-soft)",
                    fontSize: "1rem",
                    lineHeight: 1.65,
                    listStyle: "none",
                  }}
                >
                  {line}
                </li>
              ))}
            </ul>

            <div
              className="mt-12 rounded-[18px] p-7"
              style={{
                background: "var(--plt-bg-raised)",
                border: "1px solid var(--plt-hairline)",
              }}
            >
              <h3 className="plt-display" style={{ fontSize: "1.3rem", color: "var(--plt-ink)" }}>
                {c.ctaHeading}
              </h3>
              <p
                className="plt-body mt-2"
                style={{ fontSize: "1rem", lineHeight: 1.65, color: "var(--plt-ink-soft)" }}
              >
                {c.ctaBody}
              </p>
              <div className="mt-6">
                <MarketingCta href={L("/get-started")} variant="primary">
                  {es ? "Empieza gratis" : "Start free"}
                </MarketingCta>
              </div>
            </div>
          </div>
        </MarketingContainer>
      </MarketingSection>
    </>
  );
}
