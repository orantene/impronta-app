import { DESTINATIONS } from "./_data/destinations";
import { IMAGERY, galleryMontage } from "./_data/imagery";
import { FEATURED_PROFESSIONALS } from "./_data/professionals";
import { SERVICES } from "./_data/services";
import { TESTIMONIALS } from "./_data/testimonials";
import { SectionCategories } from "./_components/SectionCategories";
import { SectionDestinations } from "./_components/SectionDestinations";
import { SectionFeatured } from "./_components/SectionFeatured";
import { SectionFinalCTA } from "./_components/SectionFinalCTA";
import { SectionGallery } from "./_components/SectionGallery";
import { SectionHero } from "./_components/SectionHero";
import { SectionHowItWorks } from "./_components/SectionHowItWorks";
import { SectionTestimonials } from "./_components/SectionTestimonials";
import { SectionTrust } from "./_components/SectionTrust";

/**
 * Muse Bridal Collective — Homepage.
 *
 * Thin composition — each child is a CMS-candidate section. When promoted
 * to the real theme system this file becomes a `sections[]` render loop
 * driven by a tenant's `homepage_page_json` record.
 */

/* Italic serif accent — reused across headlines. Will become a CMS
 * annotation in the rich-text editor: `{italic-accent}...{/italic-accent}`. */
function Accent({ children }: { children: React.ReactNode }) {
  return (
    <em
      style={{
        fontFamily: "var(--muse-font-display)",
        fontStyle: "italic",
        fontWeight: 300,
        color: "var(--muse-blush)",
      }}
    >
      {children}
    </em>
  );
}

export default function MuseBridalHomepage() {
  return (
    <>
      <SectionHero
        eyebrow="Curated wedding collective"
        headline={
          <>
            Curated wedding talent for
            <br />
            <Accent>timeless celebrations.</Accent>
          </>
        }
        subhead="Beauty, florals, photography, and live music — assembled as one intentional team for weddings, destination celebrations, and private events."
        image={IMAGERY.heroHome}
        primary={{ label: "Book Your Team", href: "/prototypes/muse-bridal/contact" }}
        secondary={{
          label: "Explore the Collective",
          href: "/prototypes/muse-bridal/collective",
        }}
      />

      <SectionTrust
        items={[
          {
            label: "Destination-ready",
            detail:
              "Every member travels fluently — from Tulum and Los Cabos to the Mediterranean.",
          },
          {
            label: "One curated team",
            detail:
              "Book an entire wedding-day team who already work in the same visual key.",
          },
          {
            label: "Quiet concierge",
            detail:
              "A dedicated planner coordinates every vendor so your inbox stays calm.",
          },
          {
            label: "Editorial standard",
            detail:
              "Portfolios featured by Vogue, Brides, Martha Stewart, and Hola! México.",
          },
        ]}
      />

      <SectionCategories
        eyebrow="Services"
        title={
          <>
            A house of beauty, image, and <Accent>live experience.</Accent>
          </>
        }
        copy="Every category is represented by artists who share the same unhurried standard — so your entire day feels composed, not stitched together."
        items={SERVICES}
      />

      <SectionFeatured
        eyebrow="Featured collective"
        title={
          <>
            Members we&apos;re most proud to <Accent>introduce.</Accent>
          </>
        }
        copy="A handful of artists we send our closest couples to — each with destination experience, multilingual teams, and an eye for the quietly editorial."
        items={FEATURED_PROFESSIONALS.slice(0, 6)}
      />

      <SectionHowItWorks
        eyebrow="How booking works"
        title={
          <>
            Four calm steps from <Accent>first idea</Accent> to the aisle.
          </>
        }
        steps={[
          {
            label: "Explore the collective",
            detail:
              "Browse our curated professionals by service, destination, and visual style.",
          },
          {
            label: "Share your event",
            detail:
              "Tell us the date, place, and tone. One form, one concierge, no call centres.",
          },
          {
            label: "Receive a curated match",
            detail:
              "We hand-select members whose style and availability fit your day — with live quotes.",
          },
          {
            label: "Confirm your team",
            detail:
              "Sign a single booking, and your concierge coordinates every vendor from there.",
          },
        ]}
      />

      <SectionDestinations items={DESTINATIONS} />

      <SectionGallery
        eyebrow="Moments"
        title={
          <>
            Quietly extraordinary <Accent>celebrations.</Accent>
          </>
        }
        caption="A year in our archive — beach ceremonies, jungle receptions, city salons."
        items={galleryMontage.map((src) => ({ src }))}
      />

      <SectionTestimonials items={TESTIMONIALS} />

      <SectionFinalCTA
        eyebrow="Ready when you are"
        title={
          <>
            Tell us about your <Accent>celebration.</Accent>
          </>
        }
        copy="Share a few details — date, destination, services you&apos;re imagining — and your concierge will return a curated team within two working days."
        primary={{ label: "Start Your Inquiry", href: "/prototypes/muse-bridal/contact" }}
        secondary={{
          label: "Browse the Collective",
          href: "/prototypes/muse-bridal/collective",
        }}
        image={IMAGERY.heroContact}
        reassurance="Quiet, unhurried, and always in the same visual key."
      />
    </>
  );
}
