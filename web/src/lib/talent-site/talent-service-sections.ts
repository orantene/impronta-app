import type { TalentPersonalSectionTypeKey } from "@/lib/site-admin/sections/talent-personal-section-keys";

/** Curated sections for Max custom service-website composer. */
export const TALENT_SERVICE_SECTION_OPTIONS: {
  key: TalentPersonalSectionTypeKey;
  label: string;
}[] = [
  { key: "hero", label: "Hero" },
  { key: "hero_split", label: "Hero split" },
  { key: "editorial_split_hero", label: "Editorial hero" },
  { key: "image_copy_alternating", label: "About" },
  { key: "values_trio", label: "Services" },
  { key: "gallery_strip", label: "Gallery" },
  { key: "masonry", label: "Masonry gallery" },
  { key: "video_reel", label: "Video / showreel" },
  { key: "testimonials_trio", label: "Testimonials" },
  { key: "press_strip", label: "Press / credits" },
  { key: "cta_banner", label: "Contact CTA" },
  { key: "booking_widget", label: "Booking" },
  { key: "faq_accordion", label: "FAQ" },
  { key: "stats", label: "Stats" },
  { key: "logo_cloud", label: "Social / logos" },
];
