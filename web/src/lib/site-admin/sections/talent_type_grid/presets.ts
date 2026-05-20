import type { TalentTypeGridItem } from "./schema";

export const v11TalentTypeGridItems: TalentTypeGridItem[] = [
  {
    label: "Models",
    description: "Editorial, runway & commercial",
    icon: "◑",
    featured: true,
    imageUrl:
      "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&q=72&w=1200&h=1500",
    imageAlt:
      "Studio portrait of a model with long blonde hair and a sheer black top.",
  },
  {
    label: "Hosts & Promo",
    description: "Brand ambassadors & activations",
    icon: "✦",
    imageUrl:
      "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&q=72&w=1200&h=760",
    imageAlt: "Confetti falling over a crowded live event.",
  },
  {
    label: "Chefs & Culinary",
    description: "Private chefs & catering",
    icon: "✷",
    imageUrl:
      "https://images.unsplash.com/photo-1577219491135-ce391730fb2c?auto=format&fit=crop&q=72&w=1200&h=760",
    imageAlt: "Chef plating food in a professional kitchen.",
  },
  {
    label: "Performers",
    description: "Dancers, acts & entertainers",
    icon: "♪",
    imageUrl:
      "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&q=72&w=1200&h=760",
    imageAlt: "Singer performing into a microphone through stage smoke.",
  },
  {
    label: "Wellness & Beauty",
    description: "Hair, makeup & wellness",
    icon: "❀",
    imageUrl:
      "https://images.unsplash.com/photo-1487412947147-5cebf100ffc2?auto=format&fit=crop&q=72&w=1200&h=760",
    imageAlt: "Close-up beauty portrait showing dramatic eye makeup.",
  },
  {
    label: "Music & DJs",
    description: "DJs, bands & live music",
    icon: "♫",
    imageUrl:
      "https://images.unsplash.com/photo-1499364615650-ec38552f4f34?auto=format&fit=crop&q=72&w=1200&h=760",
    imageAlt: "Musicians performing on a dark stage with concert lights.",
  },
  {
    label: "Photo, Video & Creative",
    description: "Photographers & creatives",
    icon: "◉",
    imageUrl:
      "https://images.unsplash.com/photo-1478720568477-152d9b164e26?auto=format&fit=crop&q=72&w=1200&h=760",
    imageAlt: "Camera equipment and lighting set up for a creative shoot.",
  },
];

export const v11TalentTypeGridPreset = {
  eyebrow: "The roster",
  headline: "Talent, by discipline",
  subheadline: "",
  mode: "manual",
  items: v11TalentTypeGridItems,
  maxItems: 7,
  showCta: true,
  ctaLabel: "Explore",
  showImages: true,
  showDescriptions: true,
  showCardIcons: true,
  showRailControls: true,
  seeAllLabel: "See all",
  seeAllHref: { kind: "tenant-page", value: "/directory" },
  desktopLayout: "featured-pod-rail",
  mobileLayout: "horizontal-scroll",
  cardRatio: "16/9",
  textPosition: "overlay-bottom",
  imageOverlayStrength: "strong",
  cardTitleScale: "balanced",
  cardCopyScale: "comfortable",
  presentation: {
    background: "espresso",
    paddingTop: "editorial",
    paddingBottom: "editorial",
    dividerTop: "thin-line",
  },
} as const;
