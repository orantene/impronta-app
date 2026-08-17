"use client";

import type { ReactNode, SVGProps } from "react";

const ICON_INK = "#111111";

const STROKE: SVGProps<SVGSVGElement> = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

function Svg({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden {...STROKE}>
      {children}
    </svg>
  );
}

const ICONS: Record<string, ReactNode> = {
  text: (
    <Svg>
      <path d="M4 7V4h16v3" />
      <path d="M9 20h6" />
      <path d="M12 4v16" />
    </Svg>
  ),
  title: (
    <Svg>
      <path d="M5 5.5h14" strokeWidth={2.4} />
      <path d="M12 5.5v14.5" strokeWidth={2.4} />
      <path d="M10.5 5.5v1.8M13.5 5.5v1.8" strokeWidth={1.6} />
    </Svg>
  ),
  subtitle: (
    <Svg>
      <path d="M5.5 6.5h7" strokeWidth={2.2} />
      <path d="M9 6.5v11" strokeWidth={2.2} />
      <path d="M14.5 9h5.5" strokeWidth={1.8} />
      <path d="M17.25 9v9.5" strokeWidth={1.8} />
    </Svg>
  ),
  intro: (
    <Svg>
      <path d="M7.5 8.5h9" strokeWidth={1.8} />
      <path d="M8.5 12h7" strokeWidth={1.8} />
      <path d="M9.5 15.5h5" strokeWidth={1.8} />
    </Svg>
  ),
  paragraph: (
    <Svg>
      <path d="M4 7.5h16" strokeWidth={1.9} />
      <path d="M4 11.5h16" strokeWidth={1.9} />
      <path d="M4 15.5h11" strokeWidth={1.9} />
    </Svg>
  ),
  "rich-text": (
    <Svg>
      <path d="M4 7h11" strokeWidth={1.8} />
      <path d="M4 11h16" strokeWidth={1.8} />
      <path d="M4 15h9" strokeWidth={1.8} />
      <path d="M16.5 14.5h4.5" strokeWidth={2.4} />
      <path d="M18.75 12.5v4.5" strokeWidth={2.4} />
    </Svg>
  ),
  caption: (
    <Svg>
      <rect x="5" y="6" width="14" height="7" rx="1.5" strokeWidth={1.6} />
      <path d="M7.5 16.5h9" strokeWidth={1.6} />
    </Svg>
  ),
  badge: (
    <Svg>
      <rect x="3.5" y="9" width="17" height="7" rx="3.5" strokeWidth={1.8} />
      <circle cx="12" cy="12.5" r="1.2" fill="currentColor" stroke="none" />
    </Svg>
  ),
  quote: (
    <Svg>
      <path
        d="M8.5 8.5c0-2.2 1.6-3.5 3.4-3.5v2.2c-1.1 0-1.8.7-1.8 1.8H8.5z"
        strokeWidth={1.8}
      />
      <path
        d="M14.5 8.5c0-2.2 1.6-3.5 3.4-3.5v2.2c-1.1 0-1.8.7-1.8 1.8H14.5z"
        strokeWidth={1.8}
      />
      <path d="M7 17.5h4.5M14 17.5h4.5" strokeWidth={1.8} />
    </Svg>
  ),
  list: (
    <Svg>
      <circle cx="6.5" cy="8" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="6.5" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="6.5" cy="16" r="1.4" fill="currentColor" stroke="none" />
      <path d="M10.5 8h10" strokeWidth={1.8} />
      <path d="M10.5 12h10" strokeWidth={1.8} />
      <path d="M10.5 16h10" strokeWidth={1.8} />
    </Svg>
  ),
  buttons: (
    <Svg>
      <rect x="3" y="9" width="18" height="6" rx="3" />
      <path d="M8 12h8" />
    </Svg>
  ),
  button: (
    <Svg>
      <rect x="3" y="8" width="18" height="8" rx="4" />
      <path d="M8 12h8" />
    </Svg>
  ),
  "button-group": (
    <Svg>
      <rect x="2" y="9" width="9" height="6" rx="2" />
      <rect x="13" y="9" width="9" height="6" rx="2" />
    </Svg>
  ),
  "text-link": (
    <Svg>
      <path d="M10 13a3 3 0 0 0 4.2 0l1.8-1.8a3 3 0 0 0-4.2-4.2L10 8" />
      <path d="M14 11a3 3 0 0 0-4.2 0L8 12.8a3 3 0 0 0 4.2 4.2L14 16" />
    </Svg>
  ),
  "icon-button": (
    <Svg>
      <rect x="5" y="5" width="14" height="14" rx="4" />
      <path d="M12 8v8M8 12h8" />
    </Svg>
  ),
  whatsapp: (
    <Svg>
      <path d="M12 3a9 9 0 0 0-7.8 13.5L3 21l4.6-1.2A9 9 0 1 0 12 3z" />
      <path d="M9 10h.01M12 10h.01M15 10h.01" />
    </Svg>
  ),
  inquiry: (
    <Svg>
      <path d="M5 6h14v10H9l-4 4z" />
      <path d="M9 10h6" />
    </Svg>
  ),
  booking: (
    <Svg>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M8 3v4M16 3v4M4 10h16" />
      <path d="M9 14l2 2 4-4" />
    </Svg>
  ),
  download: (
    <Svg>
      <path d="M12 4v10" />
      <path d="M8 10l4 4 4-4" />
      <path d="M5 18h14" />
    </Svg>
  ),
  media: (
    <Svg>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="9" cy="10" r="1.5" fill="currentColor" stroke="none" />
      <path d="m3 16 5-5 4 4 3-3 6 6" />
    </Svg>
  ),
  image: (
    <Svg>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="9" cy="10" r="1.5" fill="currentColor" stroke="none" />
      <path d="m3 16 5-5 4 4 3-3 6 6" />
    </Svg>
  ),
  cover: (
    <Svg>
      <rect x="2" y="7" width="20" height="10" rx="2" />
      <path d="m2 14 6-4 4 3 4-5 6 6" />
    </Svg>
  ),
  logo: (
    <Svg>
      <circle cx="12" cy="12" r="7" />
      <path d="M9 12h6" strokeWidth={2.5} />
    </Svg>
  ),
  icon: (
    <Svg>
      <path d="M12 3l2.4 4.8L20 9l-4 3.9.9 5.6L12 16.8 7.1 18.5 8 12.9 4 9l5.6-1.2z" />
    </Svg>
  ),
  video: (
    <Svg>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="M10 9.5v5l5-2.5z" fill="currentColor" stroke="none" />
    </Svg>
  ),
  gallery: (
    <Svg>
      <rect x="3" y="6" width="10" height="8" rx="1" />
      <rect x="11" y="4" width="10" height="8" rx="1" />
      <rect x="7" y="12" width="10" height="8" rx="1" />
    </Svg>
  ),
  "image-grid": (
    <Svg>
      <rect x="3" y="3" width="8" height="8" rx="1" />
      <rect x="13" y="3" width="8" height="8" rx="1" />
      <rect x="3" y="13" width="8" height="8" rx="1" />
      <rect x="13" y="13" width="8" height="8" rx="1" />
    </Svg>
  ),
  carousel: (
    <Svg>
      <rect x="5" y="7" width="14" height="10" rx="2" />
      <path d="M3 12h2M19 12h2" />
    </Svg>
  ),
  layout: (
    <Svg>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 9h18" />
      <path d="M12 9v11" />
    </Svg>
  ),
  section: (
    <Svg>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 9h18" />
    </Svg>
  ),
  container: (
    <Svg>
      <rect x="4" y="4" width="16" height="16" rx="2" strokeDasharray="3 2" />
    </Svg>
  ),
  columns: (
    <Svg>
      <rect x="3" y="5" width="8" height="14" rx="1" />
      <rect x="13" y="5" width="8" height="14" rx="1" />
    </Svg>
  ),
  grid: (
    <Svg>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </Svg>
  ),
  stack: (
    <Svg>
      <rect x="5" y="4" width="14" height="4" rx="1" />
      <rect x="5" y="10" width="14" height="4" rx="1" />
      <rect x="5" y="16" width="14" height="4" rx="1" />
    </Svg>
  ),
  row: (
    <Svg>
      <rect x="3" y="9" width="5" height="6" rx="1" />
      <rect x="9.5" y="9" width="5" height="6" rx="1" />
      <rect x="16" y="9" width="5" height="6" rx="1" />
    </Svg>
  ),
  card: (
    <Svg>
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <path d="M8 10h8" />
      <path d="M8 14h6" />
    </Svg>
  ),
  "card-group": (
    <Svg>
      <rect x="2" y="7" width="8" height="10" rx="1.5" />
      <rect x="8" y="5" width="8" height="10" rx="1.5" />
      <rect x="14" y="7" width="8" height="10" rx="1.5" />
    </Svg>
  ),
  spacer: (
    <Svg>
      <path d="M12 5v3M12 16v3" />
      <path d="M8 8h8M8 16h8" />
    </Svg>
  ),
  divider: (
    <Svg>
      <path d="M4 12h16" />
    </Svg>
  ),
  cards: (
    <Svg>
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <path d="M8 10h8" />
    </Svg>
  ),
  "image-card": (
    <Svg>
      <rect x="4" y="5" width="16" height="8" rx="1" />
      <path d="M8 16h8" />
    </Svg>
  ),
  "text-card": (
    <Svg>
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <path d="M8 10h8" />
      <path d="M8 14h6" />
    </Svg>
  ),
  "icon-card": (
    <Svg>
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <circle cx="12" cy="10" r="2" />
      <path d="M8 16h8" />
    </Svg>
  ),
  "profile-card": (
    <Svg>
      <circle cx="12" cy="9" r="3" />
      <path d="M7 18c0-2.8 2.2-5 5-5s5 2.2 5 5" />
    </Svg>
  ),
  "service-card": (
    <Svg>
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <path d="M8 10h8" strokeWidth={2} />
      <path d="M8 14h6" />
    </Svg>
  ),
  "testimonial-card": (
    <Svg>
      <path d="M8 9h.01M12 9h.01M16 9h.01" />
      <path d="M7 13h10" />
      <path d="M10 17h4" />
    </Svg>
  ),
  "pricing-card": (
    <Svg>
      <rect x="5" y="4" width="14" height="16" rx="2" />
      <path d="M9 9h6" strokeWidth={2} />
      <path d="M10 14h4" />
    </Svg>
  ),
  "cta-card": (
    <Svg>
      <rect x="4" y="6" width="16" height="12" rx="2" />
      <rect x="8" y="14" width="8" height="4" rx="2" />
    </Svg>
  ),
  interactive: (
    <Svg>
      <rect x="4" y="5" width="16" height="5" rx="1" />
      <rect x="4" y="12" width="16" height="7" rx="1" />
    </Svg>
  ),
  accordion: (
    <Svg>
      <path d="M5 8h14M5 12h14M5 16h14" />
      <path d="M17 8v8" />
    </Svg>
  ),
  tabs: (
    <Svg>
      <path d="M4 7h6M14 7h6" />
      <rect x="4" y="10" width="16" height="10" rx="2" />
    </Svg>
  ),
  forms: (
    <Svg>
      <rect x="4" y="5" width="16" height="4" rx="1" />
      <rect x="4" y="11" width="16" height="4" rx="1" />
      <rect x="4" y="17" width="10" height="4" rx="1" />
    </Svg>
  ),
  "contact-form": (
    <Svg>
      <rect x="4" y="5" width="16" height="4" rx="1" />
      <rect x="4" y="11" width="16" height="4" rx="1" />
      <rect x="4" y="17" width="8" height="4" rx="1" />
    </Svg>
  ),
  "submit-button": (
    <Svg>
      <rect x="6" y="9" width="12" height="6" rx="3" />
      <path d="M10 12h4" />
    </Svg>
  ),
  marketing: (
    <Svg>
      <path d="M4 12h16" />
      <path d="M8 8v8M16 8v8" />
    </Svg>
  ),
  "cta-banner": (
    <Svg>
      <rect x="2" y="8" width="20" height="8" rx="2" />
      <path d="M6 12h8" />
    </Svg>
  ),
  stats: (
    <Svg>
      <path d="M6 16V10M12 16V6M18 16v-4" strokeWidth={2.5} />
    </Svg>
  ),
  testimonial: (
    <Svg>
      <path d="M8 10c0-1.5.8-2.5 2-2.5v1.5c-.6 0-1 .4-1 1H8z" />
      <path d="M14 10c0-1.5.8-2.5 2-2.5v1.5c-.6 0-1 .4-1 1H14z" />
    </Svg>
  ),
  faq: (
    <Svg>
      <circle cx="12" cy="12" r="8" />
      <path d="M10 10a2 2 0 1 1 3.2 1.6c-.8.5-1.2 1-1.2 2" />
      <circle cx="12" cy="17" r="0.8" fill="currentColor" stroke="none" />
    </Svg>
  ),
  "logo-strip": (
    <Svg>
      <circle cx="6" cy="12" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="18" cy="12" r="2" />
    </Svg>
  ),
  utility: (
    <Svg>
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4" />
      <circle cx="12" cy="12" r="3" />
    </Svg>
  ),
  breadcrumb: (
    <Svg>
      <path d="M6 12h2M10 12h2M14 12h2" />
      <path d="M8 10l2 2-2 2M12 10l2 2-2 2" />
    </Svg>
  ),
  social: (
    <Svg>
      <circle cx="8" cy="12" r="3" />
      <circle cx="16" cy="12" r="3" />
      <path d="M11 12h2" />
    </Svg>
  ),
  youtube: (
    <Svg>
      <rect x="3" y="7" width="18" height="10" rx="2" />
      <path d="M10 10.5v3l4-1.5z" fill="currentColor" stroke="none" />
    </Svg>
  ),
  embed: (
    <Svg>
      <rect x="4" y="6" width="16" height="12" rx="2" />
      <path d="M8 10h8M8 14h5" />
    </Svg>
  ),
  "external-link": (
    <Svg>
      <path d="M14 5h5v5" />
      <path d="M10 14 19 5" />
      <path d="M19 10v9H5V5h9" />
    </Svg>
  ),
  hero: (
    <Svg>
      <path d="M4 18V6l8-2 8 2v12" />
      <path d="M9 12h6" />
    </Svg>
  ),
  "hero-centered": (
    <Svg>
      <path d="M6 10h12" strokeWidth={2.5} />
      <path d="M8 14h8" />
      <rect x="9" y="17" width="6" height="3" rx="1.5" />
    </Svg>
  ),
  "hero-split": (
    <Svg>
      <rect x="3" y="6" width="8" height="12" rx="1" />
      <path d="M14 9h7" strokeWidth={2} />
      <path d="M14 13h5" />
    </Svg>
  ),
  "hero-search": (
    <Svg>
      <path d="M6 8h12" strokeWidth={2} />
      <rect x="5" y="13" width="14" height="5" rx="2.5" />
      <circle cx="17" cy="15.5" r="1.5" />
    </Svg>
  ),
  "hero-minimal": (
    <Svg>
      <path d="M7 10h10" strokeWidth={2.5} />
      <rect x="9" y="15" width="6" height="3" rx="1.5" />
    </Svg>
  ),
  "hero-video": (
    <Svg>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="M10 9.5v5l5-2.5z" fill="currentColor" stroke="none" />
    </Svg>
  ),
  about: (
    <Svg>
      <path d="M5 8h14" strokeWidth={2} />
      <path d="M5 12h12" />
      <path d="M5 16h10" />
    </Svg>
  ),
  "about-split": (
    <Svg>
      <path d="M4 9h8" strokeWidth={2} />
      <rect x="14" y="6" width="6" height="12" rx="1" />
    </Svg>
  ),
  "about-stats": (
    <Svg>
      <path d="M4 8h10" strokeWidth={2} />
      <rect x="4" y="13" width="4" height="6" rx="1" />
      <rect x="10" y="13" width="4" height="6" rx="1" />
      <rect x="16" y="13" width="4" height="6" rx="1" />
    </Svg>
  ),
  services: (
    <Svg>
      <rect x="3" y="6" width="6" height="12" rx="1" />
      <rect x="9" y="6" width="6" height="12" rx="1" />
      <rect x="15" y="6" width="6" height="12" rx="1" />
    </Svg>
  ),
  "services-list": (
    <Svg>
      <circle cx="6" cy="8" r="1" fill="currentColor" stroke="none" />
      <circle cx="6" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="6" cy="16" r="1" fill="currentColor" stroke="none" />
      <path d="M10 8h10M10 12h10M10 16h10" />
    </Svg>
  ),
  "gallery-strip": (
    <Svg>
      <rect x="2" y="8" width="6" height="8" rx="1" />
      <rect x="9" y="6" width="5" height="10" rx="1" />
      <rect x="15" y="8" width="7" height="8" rx="1" />
    </Svg>
  ),
  talent: (
    <Svg>
      <circle cx="12" cy="8" r="3" />
      <path d="M6 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
    </Svg>
  ),
  "talent-grid": (
    <Svg>
      <circle cx="7" cy="9" r="2" />
      <circle cx="12" cy="9" r="2" />
      <circle cx="17" cy="9" r="2" />
      <path d="M5 15h4M10 15h4M15 15h4" />
    </Svg>
  ),
  "talent-card": (
    <Svg>
      <circle cx="12" cy="9" r="3" />
      <rect x="8" y="14" width="8" height="3" rx="1" />
    </Svg>
  ),
  "featured-talent": (
    <Svg>
      <circle cx="8" cy="10" r="2.5" />
      <circle cx="16" cy="10" r="2.5" />
      <path d="M5 17h6M13 17h6" />
    </Svg>
  ),
  roster: (
    <Svg>
      <rect x="3" y="6" width="18" height="4" rx="2" />
      <rect x="3" y="13" width="5" height="6" rx="1" />
      <rect x="9.5" y="13" width="5" height="6" rx="1" />
      <rect x="16" y="13" width="5" height="6" rx="1" />
    </Svg>
  ),
  testimonials: (
    <Svg>
      <rect x="3" y="7" width="6" height="10" rx="1" />
      <rect x="9" y="7" width="6" height="10" rx="1" />
      <rect x="15" y="7" width="6" height="10" rx="1" />
    </Svg>
  ),
  cta: (
    <Svg>
      <rect x="3" y="9" width="18" height="6" rx="2" />
      <path d="M8 12h8" />
    </Svg>
  ),
  "cta-split": (
    <Svg>
      <path d="M4 11h8" strokeWidth={2} />
      <rect x="14" y="8" width="6" height="8" rx="1" />
    </Svg>
  ),
  contact: (
    <Svg>
      <rect x="4" y="6" width="16" height="12" rx="2" />
      <path d="M8 10h8M8 14h6" />
    </Svg>
  ),
  pricing: (
    <Svg>
      <rect x="4" y="5" width="5" height="14" rx="1" />
      <rect x="9.5" y="5" width="5" height="14" rx="1" />
      <rect x="15" y="5" width="5" height="14" rx="1" />
    </Svg>
  ),
  footer: (
    <Svg>
      <path d="M4 18h16" />
      <path d="M6 14h4M14 14h4" />
    </Svg>
  ),
  agency: (
    <Svg>
      <path d="M4 20V8l8-4 8 4v12" />
      <path d="M9 20v-6h6v6" />
    </Svg>
  ),
  "agency-logo": (
    <Svg>
      <rect x="6" y="6" width="12" height="12" rx="2" />
      <circle cx="12" cy="12" r="3" />
    </Svg>
  ),
  directory: (
    <Svg>
      <circle cx="11" cy="11" r="6" />
      <path d="m20 20-3.5-3.5" />
      <path d="M8 11h6" />
    </Svg>
  ),
  "directory-grid": (
    <Svg>
      <rect x="3" y="5" width="7" height="7" rx="1" />
      <rect x="14" y="5" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </Svg>
  ),
  dynamic: (
    <Svg>
      <ellipse cx="12" cy="6" rx="7" ry="3" />
      <path d="M5 6v8c0 1.7 3.1 3 7 3s7-1.3 7-3V6" />
      <path d="M5 10c0 1.7 3.1 3 7 3s7-1.3 7-3" />
    </Svg>
  ),
  "dynamic-text": (
    <Svg>
      <path d="M6 8h12M6 12h8" />
      <path d="M16 6l2 2-2 2" />
    </Svg>
  ),
  repeater: (
    <Svg>
      <rect x="4" y="6" width="6" height="6" rx="1" />
      <path d="M14 9h6M14 12h4" />
      <path d="M12 9h2" />
    </Svg>
  ),
  "collection-grid": (
    <Svg>
      <rect x="3" y="4" width="7" height="7" rx="1" />
      <rect x="14" y="4" width="7" height="7" rx="1" />
      <path d="M3 16h18" />
    </Svg>
  ),
  search: (
    <Svg>
      <circle cx="11" cy="11" r="6" />
      <path d="m20 20-3.5-3.5" />
    </Svg>
  ),
  globe: (
    <Svg>
      <circle cx="12" cy="12" r="8" />
      <path d="M4 12h16" />
      <path d="M12 4a13 13 0 0 1 0 16a13 13 0 0 1 0-16z" />
    </Svg>
  ),
  bookmark: (
    <Svg>
      <path d="M7 4h10v16l-5-3.5L7 20z" />
    </Svg>
  ),
  account: (
    <Svg>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5 19c1.6-3.2 4.1-4.8 7-4.8s5.4 1.6 7 4.8" />
    </Svg>
  ),
  default: (
    <Svg>
      <rect x="5" y="5" width="14" height="14" rx="2" />
      <path d="M9 12h6" />
    </Svg>
  ),
};

const ICON_PX = {
  sm: 18,
  md: 26,
  lg: 34,
  xl: 42,
} as const;

export function AddGalleryIcon({
  name,
  size = "md",
  tone = "ink",
}: {
  name: string;
  size?: keyof typeof ICON_PX;
  /** Purple for category rail accents; ink (black) for gallery cards. */
  tone?: "ink" | "accent";
}) {
  const px = ICON_PX[size];
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center"
      style={{
        width: px,
        height: px,
        color: tone === "accent" ? "#7c3aed" : ICON_INK,
      }}
    >
      {ICONS[name] ?? ICONS.default}
    </span>
  );
}
