import { Eyebrow } from "../_components/Eyebrow";
import { Reveal } from "../_components/Reveal";
import { SectionHero } from "../_components/SectionHero";
import { IconCalendar, IconPin, IconSparkle } from "../_components/icons";
import { IMAGERY } from "../_data/imagery";
import { InquiryForm } from "./InquiryForm";

/**
 * Contact / Inquiry page.
 *
 * Template → `inquiry-editorial` variant. The InquiryForm client component
 * owns state; this shell composes the hero + contact rail + form.
 */

export default async function ContactPage({
  searchParams,
}: {
  searchParams?: Promise<{ pro?: string; intent?: string; service?: string }>;
}) {
  const sp = (await searchParams) ?? {};

  return (
    <>
      <SectionHero
        eyebrow="Contact"
        headline={
          <>
            Tell us about your{" "}
            <em
              style={{
                fontFamily: "var(--muse-font-display)",
                fontStyle: "italic",
                fontWeight: 300,
                color: "var(--muse-blush)",
              }}
            >
              celebration.
            </em>
          </>
        }
        subhead="One form. One concierge. We'll return a curated team, live quotes, and honest scheduling within two working days."
        image={IMAGERY.heroContact}
        compact
        overlay={0.55}
      />

      <section className="muse-section">
        <div className="muse-shell">
          <div
            style={{
              display: "grid",
              gap: 48,
              gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.4fr)",
              alignItems: "start",
            }}
          >
            {/* Side rail */}
            <Reveal style={{ display: "flex", flexDirection: "column", gap: 28, position: "sticky", top: 120 }}>
              <Eyebrow>Studio rhythm</Eyebrow>
              <p
                style={{
                  fontFamily: "var(--muse-font-display)",
                  fontSize: 28,
                  lineHeight: 1.3,
                  color: "var(--muse-espresso-deep)",
                }}
              >
                Every enquiry is read by a senior concierge — never a form bot,
                never a junior team member.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 18, marginTop: 12 }}>
                <RailItem label="Reply window" value="Within 2 working days" icon="calendar" />
                <RailItem label="Based" value="Tulum · Mexico City · Los Cabos" icon="pin" />
                <RailItem label="Peak season" value="Nov – April — book 6+ months ahead" icon="sparkle" />
              </div>
              <div
                style={{
                  marginTop: 20,
                  padding: "24px 24px 28px",
                  background: "var(--muse-champagne-soft)",
                  borderRadius: "var(--muse-radius)",
                  border: "1px solid var(--muse-line-soft)",
                }}
              >
                <Eyebrow>Prefer to talk?</Eyebrow>
                <p
                  style={{
                    marginTop: 12,
                    fontSize: 14,
                    color: "var(--muse-espresso)",
                  }}
                >
                  We offer a 30-minute discovery call by invitation — send your
                  enquiry first and we&apos;ll reply with a few time options.
                </p>
                <a
                  href="mailto:concierge@musebridal.com"
                  className="muse-btn muse-btn--ghost"
                  style={{ marginTop: 16, display: "inline-flex" }}
                >
                  concierge@musebridal.com
                </a>
              </div>
            </Reveal>

            {/* Form */}
            <Reveal delay={1}>
              <InquiryForm defaults={sp} />
            </Reveal>
          </div>
        </div>
      </section>
    </>
  );
}

function RailItem({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: "calendar" | "pin" | "sparkle";
}) {
  const Icon = icon === "calendar" ? IconCalendar : icon === "pin" ? IconPin : IconSparkle;
  return (
    <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
      <span style={{ color: "var(--muse-blush)", marginTop: 2 }}>
        <Icon size={22} />
      </span>
      <div>
        <div
          style={{
            fontSize: 11,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: "var(--muse-muted)",
            marginBottom: 4,
          }}
        >
          {label}
        </div>
        <div style={{ fontSize: 15.5, color: "var(--muse-espresso-deep)" }}>{value}</div>
      </div>
    </div>
  );
}
