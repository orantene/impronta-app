/**
 * Creator Circuit — campaign use cases + testimonials.
 */

export type UseCase = {
  key: string;
  title: string;
  copy: string;
  iconKey:
    | "video"
    | "rocket"
    | "megaphone"
    | "hashtag"
    | "hotel"
    | "shopping"
    | "heart";
  tint: "violet" | "coral" | "lime" | "sky" | "default";
};

export const USE_CASES: UseCase[] = [
  {
    key: "ugc",
    title: "UGC content libraries",
    copy: "Source 6–20 high-performing ad variants in under 10 days — built for Meta and TikTok Ads Manager.",
    iconKey: "video",
    tint: "violet",
  },
  {
    key: "launch",
    title: "Product launches",
    copy: "Orchestrate 10–40 creators around a single drop with synchronized delivery windows.",
    iconKey: "rocket",
    tint: "coral",
  },
  {
    key: "paid-social",
    title: "Paid social creative",
    copy: "Performance-focused creative tests — hook variants, A/B angles, iterative refresh cycles.",
    iconKey: "megaphone",
    tint: "default",
  },
  {
    key: "influencer",
    title: "Influencer campaigns",
    copy: "Traditional influencer drops with a curated roster — no DM pitch fatigue, no ghosted outreach.",
    iconKey: "hashtag",
    tint: "lime",
  },
  {
    key: "hospitality",
    title: "Hospitality partnerships",
    copy: "Destination takeovers, hotel stays, restaurant features — creators who actually travel well.",
    iconKey: "hotel",
    tint: "sky",
  },
  {
    key: "ecommerce",
    title: "E-commerce content",
    copy: "Shoppable reels, PDP-ready stills, on-model content for product pages and landing flows.",
    iconKey: "shopping",
    tint: "default",
  },
];

export type Testimonial = {
  quote: string;
  name: string;
  role: string;
  company: string;
  avatar: string;
};

const UNSPLASH = (id: string, w = 160) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&h=${w}&q=80`;

export const TESTIMONIALS: Testimonial[] = [
  {
    quote:
      "Creator Circuit sent us a shortlist in 48 hours that was tighter than anything our agency pulled in six weeks. Three of them are now in our permanent roster.",
    name: "Lauren Beck",
    role: "Head of Brand",
    company: "Ritual",
    avatar: UNSPLASH("1580489944761-15a19d654956"),
  },
  {
    quote:
      "The UGC pack came back with actual performance logic — hook variants, CTA placements, cut-downs. We tripled our CTR on Meta against baseline.",
    name: "Marcus Odom",
    role: "Growth Lead",
    company: "Olipop",
    avatar: UNSPLASH("1507003211169-0a1dd7228f2d"),
  },
  {
    quote:
      "Booking Iris Chen through Creator Circuit for our Asia-Pacific launch was the single highest ROI media decision we made this year.",
    name: "Yumi Tanaka",
    role: "VP Marketing",
    company: "Lemaire",
    avatar: UNSPLASH("1438761681033-6461ffad8d80"),
  },
];

export const BRAND_LOGOS = [
  "Glossier",
  "Ritual",
  "Olipop",
  "Reformation",
  "Notion",
  "Aman",
  "Gymshark",
  "Lemaire",
];
