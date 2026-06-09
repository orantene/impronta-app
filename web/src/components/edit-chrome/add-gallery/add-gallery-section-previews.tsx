"use client";

import type { ReactNode } from "react";

const STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.25,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function Wire({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 160 72"
      className="h-full w-full"
      aria-hidden
      {...STROKE}
    >
      {children}
    </svg>
  );
}

function HeroCenteredPreview() {
  return (
    <Wire>
      <rect x="8" y="8" width="144" height="56" rx="4" opacity="0.35" />
      <path d="M40 24h80" strokeWidth="2" />
      <path d="M48 34h64" opacity="0.6" />
      <rect x="52" y="44" width="24" height="8" rx="4" />
      <rect x="80" y="44" width="24" height="8" rx="4" opacity="0.5" />
    </Wire>
  );
}

function HeroSplitPreview() {
  return (
    <Wire>
      <rect x="8" y="8" width="68" height="56" rx="4" opacity="0.2" />
      <rect x="84" y="8" width="68" height="56" rx="4" opacity="0.45" />
      <path d="M16 22h44" strokeWidth="2" />
      <path d="M16 32h36" opacity="0.6" />
      <rect x="16" y="44" width="20" height="8" rx="4" />
    </Wire>
  );
}

function HeroSearchPreview() {
  return (
    <Wire>
      <path d="M36 18h88" strokeWidth="2" />
      <path d="M44 28h72" opacity="0.6" />
      <rect x="28" y="38" width="104" height="14" rx="7" opacity="0.5" />
      <path d="M118 45h8" strokeWidth="2" />
      <circle cx="122" cy="45" r="3" />
    </Wire>
  );
}

function HeroMinimalPreview() {
  return (
    <Wire>
      <path d="M48 26h64" strokeWidth="2" />
      <path d="M56 38h48" opacity="0.6" />
      <rect x="64" y="48" width="32" height="8" rx="4" />
    </Wire>
  );
}

function AboutPreview() {
  return (
    <Wire>
      <path d="M20 20h72" strokeWidth="2" />
      <path d="M20 30h96" opacity="0.55" />
      <path d="M20 38h88" opacity="0.55" />
      <path d="M20 46h80" opacity="0.55" />
    </Wire>
  );
}

function AboutSplitPreview() {
  return (
    <Wire>
      <path d="M14 22h52" strokeWidth="2" />
      <path d="M14 32h44" opacity="0.55" />
      <path d="M14 40h48" opacity="0.55" />
      <rect x="88" y="16" width="58" height="40" rx="4" opacity="0.45" />
    </Wire>
  );
}

function StatsPreview() {
  return (
    <Wire>
      <path d="M20 18h80" strokeWidth="2" />
      <rect x="14" y="30" width="28" height="28" rx="4" opacity="0.35" />
      <rect x="50" y="30" width="28" height="28" rx="4" opacity="0.35" />
      <rect x="86" y="30" width="28" height="28" rx="4" opacity="0.35" />
      <path d="M20 40h16" strokeWidth="2" />
      <path d="M56 40h16" strokeWidth="2" />
      <path d="M92 40h16" strokeWidth="2" />
    </Wire>
  );
}

function ServicesGridPreview() {
  return (
    <Wire>
      <path d="M20 16h72" strokeWidth="2" />
      <rect x="12" y="28" width="40" height="32" rx="4" opacity="0.4" />
      <rect x="60" y="28" width="40" height="32" rx="4" opacity="0.4" />
      <rect x="108" y="28" width="40" height="32" rx="4" opacity="0.4" />
    </Wire>
  );
}

function ServicesListPreview() {
  return (
    <Wire>
      <path d="M20 18h64" strokeWidth="2" />
      <circle cx="18" cy="32" r="2" fill="currentColor" stroke="none" />
      <path d="M26 32h90" opacity="0.55" />
      <circle cx="18" cy="42" r="2" fill="currentColor" stroke="none" />
      <path d="M26 42h84" opacity="0.55" />
      <circle cx="18" cy="52" r="2" fill="currentColor" stroke="none" />
      <path d="M26 52h78" opacity="0.55" />
    </Wire>
  );
}

function GalleryGridPreview() {
  return (
    <Wire>
      <rect x="10" y="14" width="42" height="28" rx="3" opacity="0.45" />
      <rect x="58" y="14" width="42" height="28" rx="3" opacity="0.45" />
      <rect x="106" y="14" width="42" height="28" rx="3" opacity="0.45" />
      <rect x="10" y="48" width="68" height="18" rx="3" opacity="0.3" />
      <rect x="84" y="48" width="64" height="18" rx="3" opacity="0.3" />
    </Wire>
  );
}

function GalleryStripPreview() {
  return (
    <Wire>
      <rect x="8" y="22" width="36" height="28" rx="3" opacity="0.5" />
      <rect x="50" y="18" width="28" height="36" rx="3" opacity="0.5" />
      <rect x="84" y="24" width="36" height="24" rx="3" opacity="0.5" />
      <rect x="126" y="20" width="26" height="32" rx="3" opacity="0.5" />
    </Wire>
  );
}

function TalentDisciplinePreview() {
  return (
    <Wire>
      <path d="M20 12h56" strokeWidth="2" />
      <rect x="10" y="20" width="48" height="44" rx="4" opacity="0.45" />
      <rect x="62" y="20" width="42" height="20" rx="3" opacity="0.35" />
      <rect x="108" y="20" width="42" height="20" rx="3" opacity="0.35" />
      <rect x="62" y="44" width="42" height="20" rx="3" opacity="0.35" />
      <rect x="108" y="44" width="42" height="20" rx="3" opacity="0.35" />
    </Wire>
  );
}

function TalentGridPreview() {
  return (
    <Wire>
      <path d="M20 14h72" strokeWidth="2" />
      <circle cx="26" cy="34" r="8" opacity="0.5" />
      <rect x="18" y="46" width="24" height="4" rx="2" opacity="0.4" />
      <circle cx="58" cy="34" r="8" opacity="0.5" />
      <rect x="50" y="46" width="24" height="4" rx="2" opacity="0.4" />
      <circle cx="90" cy="34" r="8" opacity="0.5" />
      <rect x="82" y="46" width="24" height="4" rx="2" opacity="0.4" />
      <circle cx="122" cy="34" r="8" opacity="0.5" />
      <rect x="114" y="46" width="24" height="4" rx="2" opacity="0.4" />
    </Wire>
  );
}

function RosterPreview() {
  return (
    <Wire>
      <rect x="10" y="14" width="140" height="12" rx="6" opacity="0.35" />
      <rect x="10" y="32" width="32" height="32" rx="4" opacity="0.4" />
      <rect x="48" y="32" width="32" height="32" rx="4" opacity="0.4" />
      <rect x="86" y="32" width="32" height="32" rx="4" opacity="0.4" />
      <rect x="124" y="32" width="26" height="32" rx="4" opacity="0.4" />
    </Wire>
  );
}

function TestimonialsPreview() {
  return (
    <Wire>
      <rect x="10" y="18" width="42" height="40" rx="4" opacity="0.4" />
      <rect x="58" y="18" width="42" height="40" rx="4" opacity="0.4" />
      <rect x="106" y="18" width="42" height="40" rx="4" opacity="0.4" />
      <path d="M18 28h24" opacity="0.55" />
      <path d="M66 28h24" opacity="0.55" />
      <path d="M114 28h24" opacity="0.55" />
    </Wire>
  );
}

function CtaBannerPreview() {
  return (
    <Wire>
      <rect x="8" y="20" width="144" height="32" rx="6" opacity="0.35" />
      <path d="M24 30h72" strokeWidth="2" />
      <path d="M24 40h56" opacity="0.55" />
      <rect x="104" y="34" width="32" height="10" rx="5" />
    </Wire>
  );
}

function CtaSplitPreview() {
  return (
    <Wire>
      <path d="M16 28h56" strokeWidth="2" />
      <path d="M16 38h48" opacity="0.55" />
      <rect x="96" y="26" width="48" height="20" rx="4" opacity="0.35" />
      <rect x="108" y="32" width="24" height="8" rx="4" />
    </Wire>
  );
}

function FaqPreview() {
  return (
    <Wire>
      <path d="M20 16h72" strokeWidth="2" />
      <rect x="12" y="28" width="136" height="10" rx="3" opacity="0.4" />
      <rect x="12" y="42" width="136" height="10" rx="3" opacity="0.4" />
      <rect x="12" y="56" width="136" height="10" rx="3" opacity="0.4" />
    </Wire>
  );
}

function ContactFormPreview() {
  return (
    <Wire>
      <path d="M20 16h64" strokeWidth="2" />
      <rect x="14" y="26" width="132" height="10" rx="3" opacity="0.35" />
      <rect x="14" y="40" width="132" height="10" rx="3" opacity="0.35" />
      <rect x="14" y="54" width="132" height="14" rx="3" opacity="0.35" />
    </Wire>
  );
}

function GenericSectionPreview() {
  return (
    <Wire>
      <rect x="8" y="12" width="144" height="48" rx="4" opacity="0.25" />
      <path d="M24 28h64" strokeWidth="2" />
      <path d="M24 38h96" opacity="0.55" />
    </Wire>
  );
}

const PREVIEW_BY_ITEM_ID: Record<string, () => ReactNode> = {
  "sec-hero-centered": HeroCenteredPreview,
  "sec-hero-split": HeroSplitPreview,
  "sec-hero-search": HeroSearchPreview,
  "sec-hero-minimal": HeroMinimalPreview,
  "sec-about-simple": AboutPreview,
  "sec-about-split": AboutSplitPreview,
  "sec-about-stats": StatsPreview,
  "sec-services-grid": ServicesGridPreview,
  "sec-services-list": ServicesListPreview,
  "sec-gallery-grid": GalleryGridPreview,
  "sec-gallery-strip": GalleryStripPreview,
  "sec-featured-talent-grid": TalentGridPreview,
  "sec-talent-discipline": TalentDisciplinePreview,
  "sec-roster-grid": RosterPreview,
  "sec-testimonials-trio": TestimonialsPreview,
  "sec-cta-banner": CtaBannerPreview,
  "sec-cta-split": CtaSplitPreview,
  "sec-faq-accordion": FaqPreview,
  "sec-contact-form": ContactFormPreview,
};

export function AddGallerySectionPreview({ itemId }: { itemId: string }) {
  const Preview = PREVIEW_BY_ITEM_ID[itemId] ?? GenericSectionPreview;
  return (
    <div
      className="flex h-full w-full items-center justify-center px-[10px] py-[8px]"
      style={{ color: "#7c3aed" }}
    >
      <Preview />
    </div>
  );
}
