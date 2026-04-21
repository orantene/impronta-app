import { MarketingContainer, MarketingEyebrow, MarketingSection } from "./container";
import { MarketingCta } from "./cta-link";

type PrimaryCta = {
  label: string;
  href: string;
  intent: string;
};

type Props = {
  eyebrow: string;
  title: React.ReactNode;
  subtitle: string;
  primary?: PrimaryCta;
  secondary?: PrimaryCta;
  sourcePage: string;
};

export function SimplePageHero({
  eyebrow,
  title,
  subtitle,
  primary,
  secondary,
  sourcePage,
}: Props) {
  return (
    <MarketingSection spacing="tight" className="relative pt-16 sm:pt-20">
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-70"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 20%, rgba(46,107,82,0.14), transparent 45%), radial-gradient(circle at 80% 30%, rgba(15,23,20,0.05), transparent 50%)",
        }}
      />
      <MarketingContainer size="wide" className="relative">
        <div className="mx-auto max-w-3xl text-center">
          <MarketingEyebrow>{eyebrow}</MarketingEyebrow>
          <h1
            className="plt-display mt-6 text-[2.5rem] font-medium leading-[1.02] tracking-[-0.02em] sm:text-[3.25rem] md:text-[3.75rem]"
            style={{ color: "var(--plt-ink)" }}
          >
            {title}
          </h1>
          <p
            className="mx-auto mt-6 max-w-2xl text-[1.0625rem] leading-[1.6] sm:text-[1.125rem]"
            style={{ color: "var(--plt-muted)" }}
          >
            {subtitle}
          </p>
          {primary || secondary ? (
            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              {primary ? (
                <MarketingCta
                  href={primary.href}
                  variant="primary"
                  size="lg"
                  eventSource={sourcePage}
                  eventIntent={primary.intent}
                >
                  {primary.label}
                </MarketingCta>
              ) : null}
              {secondary ? (
                <MarketingCta
                  href={secondary.href}
                  variant="secondary"
                  size="lg"
                  eventSource={sourcePage}
                  eventIntent={secondary.intent}
                >
                  {secondary.label}
                </MarketingCta>
              ) : null}
            </div>
          ) : null}
        </div>
      </MarketingContainer>
    </MarketingSection>
  );
}
