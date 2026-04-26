/**
 * Sensible default props per section type. Used when the admin creates
 * a section from the library gallery — they get a working instance
 * (real-looking copy + valid enum values) instead of a blank form.
 *
 * Values must parse clean against each section's v1 Zod schema. If a
 * section's schema changes shape, update the default here alongside.
 */
import type { SectionTypeKey } from "../registry";

export interface LibraryDefault {
  /** Admin-visible instance name; shown in /sections list + composer dropdowns. */
  name: string;
  /** Minimum-valid payload for the type's current schema version. */
  props: Record<string, unknown>;
}

const defaults: Record<SectionTypeKey, LibraryDefault> = {
  hero: {
    name: "Hero — new",
    props: {
      headline: "A house of curated talent.",
      subheadline: "Quiet, unhurried, always in the same key.",
    },
  },
  trust_strip: {
    name: "Trust band — new",
    props: {
      eyebrow: "Why book us",
      headline: "Three reasons teams choose our collective.",
      items: [
        { label: "Destination-ready", detail: "Every artist travels." },
        { label: "Editorial-trained", detail: "Published experience." },
        { label: "Single-point logistics", detail: "One concierge, full trip." },
      ],
      variant: "icon-row",
      background: "neutral",
    },
  },
  cta_banner: {
    name: "Final CTA — new",
    props: {
      eyebrow: "Ready when you are",
      headline: "Tell us about your celebration.",
      copy: "Share a few details and your concierge will return a curated team.",
      reassurance: "Quiet, unhurried, always in the same key.",
      primaryCta: { label: "Start a request", href: "/contact" },
      variant: "centered-overlay",
      imageSide: "right",
      bandTone: "ivory",
      insetCard: true,
      overlayOpacity: 45,
    },
  },
  category_grid: {
    name: "Services grid — new",
    props: {
      eyebrow: "Services",
      headline: "A house of beauty, image, and live experience.",
      copy: "",
      items: [
        { label: "Bridal Makeup", tagline: "Long-wear, luminous" },
        { label: "Editorial Hair", tagline: "Soft structure" },
        { label: "Photography", tagline: "Documentary & portrait" },
        { label: "Floral Direction", tagline: "Seasonal & sculptural" },
      ],
      variant: "portrait-masonry",
      columnsDesktop: 4,
    },
  },
  destinations_mosaic: {
    name: "Destinations — new",
    props: {
      eyebrow: "Destinations",
      headline: "Where the collective travels.",
      copy: "",
      items: [
        { label: "Tulum", region: "Quintana Roo", tagline: "Beachfront ceremonies" },
        { label: "Los Cabos", region: "Baja California Sur" },
        { label: "San Miguel", region: "Guanajuato" },
      ],
      footnote: "",
      variant: "portrait-mosaic",
    },
  },
  testimonials_trio: {
    name: "Testimonials — new",
    props: {
      eyebrow: "Couples & planners",
      headline: "Words from the people we work for.",
      items: [
        {
          quote: "Quiet, unhurried, exquisite. They captured every moment.",
          author: "Priya & Dev",
          context: "Three-day celebration",
          location: "Amalfi Coast",
        },
      ],
      variant: "trio-card",
      defaultAccent: "auto",
    },
  },
  process_steps: {
    name: "Process — new",
    props: {
      eyebrow: "How booking works",
      headline: "Three quiet steps to your team.",
      steps: [
        { label: "Share your story", detail: "Tell us date, location, and mood." },
        { label: "Meet your concierge", detail: "We curate a short list." },
        { label: "Book your team", detail: "One contract, full coverage." },
      ],
      variant: "numbered-column",
      numberStyle: "serif-italic",
    },
  },
  image_copy_alternating: {
    name: "Services deep-dive — new",
    props: {
      eyebrow: "Signature services",
      headline: "What we do, in detail.",
      items: [
        {
          title: "Bridal makeup",
          italicTagline: "Luminous, long-wear.",
          body:
            "From first look to last dance, a skin-first approach that reads beautifully on camera and across a long day.",
          side: "image-right",
        },
        {
          title: "Editorial hair",
          italicTagline: "Soft structure.",
          body:
            "Styles that move, hold, and feel like you — built from a trial session and a reference board.",
          side: "image-left",
        },
      ],
      variant: "editorial-alternating",
    },
  },
  values_trio: {
    name: "Values — new",
    props: {
      eyebrow: "What we believe",
      headline: "Three principles our members agree on.",
      items: [
        {
          numberLabel: "01",
          title: "Presence over performance",
          detail: "We work quietly so your day stays yours.",
        },
        {
          numberLabel: "02",
          title: "Craft over convenience",
          detail: "Every hand on your day is trained for it.",
        },
        {
          numberLabel: "03",
          title: "Clarity over surprise",
          detail: "One concierge, transparent pricing, no last-minute swaps.",
        },
      ],
      variant: "numbered-cards",
    },
  },
  press_strip: {
    name: "Press strip — new",
    props: {
      eyebrow: "As seen in",
      items: [
        { name: "Vogue" },
        { name: "Brides" },
        { name: "Harper's Bazaar" },
        { name: "Condé Nast Traveler" },
      ],
      variant: "text-italic-serif",
    },
  },
  gallery_strip: {
    name: "Gallery — new",
    props: {
      eyebrow: "Moments",
      headline: "Recent work.",
      items: [
        {
          src: "https://images.unsplash.com/photo-1519741497674-611481863552",
          alt: "Ceremony at sunset",
          aspect: "wide",
        },
        {
          src: "https://images.unsplash.com/photo-1519225421980-715cb0215aed",
          alt: "Bridal portrait",
          aspect: "tall",
        },
        {
          src: "https://images.unsplash.com/photo-1464366400600-7168b8af9bc3",
          alt: "Floral details",
          aspect: "square",
        },
      ],
      caption: "",
      variant: "mosaic",
    },
  },
  featured_talent: {
    name: "Featured professionals — new",
    props: {
      eyebrow: "The collective",
      headline: "A short list, always on call.",
      copy: "",
      sourceMode: "auto_featured_flag",
      limit: 6,
      columnsDesktop: 3,
      variant: "grid",
    },
  },
  marquee: {
    name: "Marquee — new",
    props: {
      items: [
        { text: "Featured in Vogue" },
        { text: "Editorial-trained" },
        { text: "Destination ready" },
        { text: "Booked through 2026" },
      ],
      speed: "medium",
      direction: "left",
      separator: "diamond",
      variant: "text",
    },
  },
  stats: {
    name: "Stats — new",
    props: {
      eyebrow: "By the numbers",
      headline: "A decade of quiet, considered work.",
      items: [
        { value: "12", label: "Years" },
        { value: "180+", label: "Cities served" },
        { value: "72", label: "NPS" },
      ],
      variant: "row",
      align: "center",
    },
  },
  faq_accordion: {
    name: "FAQ — new",
    props: {
      eyebrow: "Common questions",
      headline: "Things people ask before they book.",
      intro: "Answers to the most common questions. Anything else? Reach out.",
      items: [
        {
          question: "What's included in a booking?",
          answer:
            "All sessions include scouting, scheduling, and a single revision round.",
        },
        {
          question: "How quickly can you respond?",
          answer:
            "Inquiries are answered within 24 business hours.",
        },
        {
          question: "Do you travel?",
          answer:
            "Yes — domestic and international. Travel costs are billed at cost.",
        },
      ],
      variant: "bordered",
      defaultOpen: -1,
    },
  },
  split_screen: {
    name: "Split — new",
    props: {
      eyebrow: "Our approach",
      headline: "Quiet, unhurried, in the same key.",
      body:
        "We build short, deliberate teams around your story — never overstaffed, never anonymous. Each booking is led by a single concierge from inquiry to wrap.",
      primaryCta: { label: "See our work", href: "/work" },
      imageUrl: "https://images.unsplash.com/photo-1519741497674-611481863552",
      imageAlt: "Editorial portrait",
      side: "image-left",
      variant: "50-50",
      verticalAlign: "center",
      stickyMedia: false,
    },
  },
  timeline: {
    name: "Timeline — new",
    props: {
      eyebrow: "Our story",
      headline: "How the studio came together.",
      items: [
        { date: "2018", title: "Founded", body: "Three founders, one shared studio." },
        { date: "2021", title: "First international booking", body: "Tulum wedding for a NY couple." },
        { date: "2024", title: "180 cities served" },
      ],
      variant: "left-rail",
      numberStyle: "dot",
    },
  },
  pricing_grid: {
    name: "Pricing — new",
    props: {
      eyebrow: "Investment",
      headline: "Three ways to work with us.",
      plans: [
        { name: "Essential", price: "$2,400", cadence: "starting at", description: "Half-day coverage.", features: ["Trial session", "4-hour day-of", "Single revision"], ctaLabel: "Inquire", ctaHref: "/contact", highlighted: false },
        { name: "Signature", price: "$4,800", cadence: "starting at", description: "Full-day coverage with extras.", features: ["Trial session", "8-hour day-of", "Travel included", "Two revision rounds"], ctaLabel: "Inquire", ctaHref: "/contact", highlighted: true, badge: "Most popular" },
        { name: "Destination", price: "Custom", cadence: "scoped per trip", features: ["Trial + planning call", "Multi-day", "International logistics"], ctaLabel: "Talk to us", ctaHref: "/contact", highlighted: false },
      ],
      variant: "cards",
    },
  },
  team_grid: {
    name: "Team — new",
    props: {
      eyebrow: "The studio",
      headline: "Who you'll be working with.",
      members: [
        { name: "Alex Rivera", role: "Founder + creative director" },
        { name: "Maya Chen", role: "Head of production" },
        { name: "Jordan Park", role: "Lead photographer" },
      ],
      variant: "portrait",
      columnsDesktop: 3,
    },
  },
  contact_form: {
    name: "Contact form — new",
    props: {
      eyebrow: "Get in touch",
      headline: "Tell us about your project.",
      intro: "We answer within 24 business hours.",
      fields: [
        { name: "name", label: "Name", type: "text", required: true, placeholder: "Your name" },
        { name: "email", label: "Email", type: "email", required: true, placeholder: "you@studio.com" },
        { name: "message", label: "Message", type: "textarea", required: true, placeholder: "Tell us about your project" },
      ],
      submitLabel: "Send",
      action: "https://formspree.io/f/your-id",
      method: "POST",
      honeypot: "website",
      successMessage: "Thanks — we'll be in touch.",
      variant: "card",
    },
  },
  anchor_nav: {
    name: "Anchor nav — new",
    props: {
      links: [
        { label: "About", href: "#about" },
        { label: "Services", href: "#services" },
        { label: "Work", href: "#work" },
        { label: "Contact", href: "#contact" },
      ],
      variant: "pills",
      sticky: false,
      align: "center",
    },
  },
  before_after: {
    name: "Before/After — new",
    props: {
      beforeUrl: "https://images.unsplash.com/photo-1519741497674-611481863552",
      afterUrl: "https://images.unsplash.com/photo-1519225421980-715cb0215aed",
      beforeAlt: "Before",
      afterAlt: "After",
      beforeLabel: "Before",
      afterLabel: "After",
      initialPosition: 50,
      ratio: "16/9",
    },
  },
  content_tabs: {
    name: "Tabs — new",
    props: {
      eyebrow: "Find what you need",
      headline: "Explore the studio.",
      tabs: [
        { label: "Approach", body: "How we work, in one paragraph." },
        { label: "Process", body: "Three-step flow from inquiry to wrap." },
        { label: "FAQ", body: "Common questions, short answers." },
      ],
      variant: "underline",
      defaultTab: 0,
    },
  },
  code_embed: {
    name: "Embed — new",
    props: {
      headline: "Watch the reel",
      url: "https://www.youtube.com/embed/dQw4w9WgXcQ",
      ratio: "16/9",
      title: "Studio reel",
    },
  },
};

export function getLibraryDefault(
  key: SectionTypeKey,
): LibraryDefault {
  return defaults[key];
}
