/**
 * Creator Circuit — icon set.
 *
 * Hand-rolled inline SVGs so the prototype stays dependency-free and sharp
 * across sizes. All icons share a 24-viewBox and inherit `currentColor`.
 */

type Props = { size?: number; strokeWidth?: number; className?: string };

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none" as const,
  stroke: "currentColor" as const,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
});

export const IconArrowRight = ({ size = 16, strokeWidth = 2, className }: Props) => (
  <svg {...base(size)} strokeWidth={strokeWidth} className={className}>
    <path d="M5 12h14" />
    <path d="m13 6 6 6-6 6" />
  </svg>
);

export const IconArrowUpRight = ({ size = 16, strokeWidth = 2, className }: Props) => (
  <svg {...base(size)} strokeWidth={strokeWidth} className={className}>
    <path d="M7 17 17 7" />
    <path d="M7 7h10v10" />
  </svg>
);

export const IconPin = ({ size = 14, strokeWidth = 2, className }: Props) => (
  <svg {...base(size)} strokeWidth={strokeWidth} className={className}>
    <path d="M20 10c0 7-8 12-8 12s-8-5-8-12a8 8 0 0 1 16 0Z" />
    <circle cx="12" cy="10" r="3" />
  </svg>
);

export const IconSearch = ({ size = 18, strokeWidth = 2, className }: Props) => (
  <svg {...base(size)} strokeWidth={strokeWidth} className={className}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
);

export const IconClose = ({ size = 18, strokeWidth = 2, className }: Props) => (
  <svg {...base(size)} strokeWidth={strokeWidth} className={className}>
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </svg>
);

export const IconPlay = ({ size = 14, strokeWidth = 2, className }: Props) => (
  <svg {...base(size)} strokeWidth={strokeWidth} className={className}>
    <polygon points="6 4 20 12 6 20" fill="currentColor" />
  </svg>
);

export const IconSparkle = ({ size = 24, strokeWidth = 2, className }: Props) => (
  <svg {...base(size)} strokeWidth={strokeWidth} className={className}>
    <path d="M12 3v4M12 17v4M3 12h4M17 12h4" />
    <path d="m6 6 2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" />
  </svg>
);

export const IconHashtag = ({ size = 24, strokeWidth = 2, className }: Props) => (
  <svg {...base(size)} strokeWidth={strokeWidth} className={className}>
    <path d="M5 9h14M5 15h14" />
    <path d="M10 3 8 21M16 3l-2 18" />
  </svg>
);

export const IconMegaphone = ({ size = 24, strokeWidth = 2, className }: Props) => (
  <svg {...base(size)} strokeWidth={strokeWidth} className={className}>
    <path d="M3 11v2a2 2 0 0 0 2 2h2l6 5V4l-6 5H5a2 2 0 0 0-2 2Z" />
    <path d="M16 8a5 5 0 0 1 0 8" />
  </svg>
);

export const IconRocket = ({ size = 24, strokeWidth = 2, className }: Props) => (
  <svg {...base(size)} strokeWidth={strokeWidth} className={className}>
    <path d="M5 15c-1 3-1 5-1 5s2 0 5-1" />
    <path d="M9 12s2-7 8-9c0 6-5 9-5 9-2 2-4 3-6 3 0-2 1-4 3-6Z" />
    <circle cx="15" cy="9" r="1.5" />
  </svg>
);

export const IconVideo = ({ size = 24, strokeWidth = 2, className }: Props) => (
  <svg {...base(size)} strokeWidth={strokeWidth} className={className}>
    <rect x="3" y="6" width="14" height="12" rx="2" />
    <path d="m17 10 5-3v10l-5-3" />
  </svg>
);

export const IconShopping = ({ size = 24, strokeWidth = 2, className }: Props) => (
  <svg {...base(size)} strokeWidth={strokeWidth} className={className}>
    <path d="M4 7h16l-1.5 12a2 2 0 0 1-2 1.8H7.5a2 2 0 0 1-2-1.8L4 7Z" />
    <path d="M9 7V5a3 3 0 0 1 6 0v2" />
  </svg>
);

export const IconHotel = ({ size = 24, strokeWidth = 2, className }: Props) => (
  <svg {...base(size)} strokeWidth={strokeWidth} className={className}>
    <path d="M3 21V6a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v15" />
    <path d="M3 21h18" />
    <path d="M8 9h2M14 9h2M8 13h2M14 13h2M8 17h2M14 17h2" />
  </svg>
);

export const IconHeart = ({ size = 24, strokeWidth = 2, className }: Props) => (
  <svg {...base(size)} strokeWidth={strokeWidth} className={className}>
    <path d="M12 21s-7-4.5-9-9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c-2 4.5-9 9-9 9Z" />
  </svg>
);

export const IconStar = ({ size = 24, strokeWidth = 2, className }: Props) => (
  <svg {...base(size)} strokeWidth={strokeWidth} className={className}>
    <polygon points="12 2 15 9 22 10 17 15 18 22 12 19 6 22 7 15 2 10 9 9" />
  </svg>
);

export const IconFashion = ({ size = 24, strokeWidth = 2, className }: Props) => (
  <svg {...base(size)} strokeWidth={strokeWidth} className={className}>
    <path d="m8 3 4 3 4-3 4 4-3 3v11H7V10L4 7l4-4Z" />
  </svg>
);

export const IconPlane = ({ size = 24, strokeWidth = 2, className }: Props) => (
  <svg {...base(size)} strokeWidth={strokeWidth} className={className}>
    <path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V18l-2 1.5V21l3.5-1 3.5 1v-1.5L13 18v-4.5l8 2.5Z" />
  </svg>
);

export const IconUtensils = ({ size = 24, strokeWidth = 2, className }: Props) => (
  <svg {...base(size)} strokeWidth={strokeWidth} className={className}>
    <path d="M4 3v8a2 2 0 0 0 2 2h0a2 2 0 0 0 2-2V3M6 13v8" />
    <path d="M14 3h2a4 4 0 0 1 4 4v4a2 2 0 0 1-2 2h-2V3Z" />
    <path d="M16 13v8" />
  </svg>
);

export const IconLeaf = ({ size = 24, strokeWidth = 2, className }: Props) => (
  <svg {...base(size)} strokeWidth={strokeWidth} className={className}>
    <path d="M4 20c6-8 10-10 17-13-1 8-4 14-12 15-3 .5-5-2-5-2Z" />
    <path d="M4 20c2-4 5-6 10-8" />
  </svg>
);

export const IconChip = ({ size = 24, strokeWidth = 2, className }: Props) => (
  <svg {...base(size)} strokeWidth={strokeWidth} className={className}>
    <rect x="6" y="6" width="12" height="12" rx="2" />
    <path d="M3 10h3M3 14h3M18 10h3M18 14h3M10 3v3M14 3v3M10 18v3M14 18v3" />
  </svg>
);

export const IconHome = ({ size = 24, strokeWidth = 2, className }: Props) => (
  <svg {...base(size)} strokeWidth={strokeWidth} className={className}>
    <path d="M3 11l9-8 9 8v9a2 2 0 0 1-2 2h-4v-6h-6v6H5a2 2 0 0 1-2-2v-9Z" />
  </svg>
);

export const IconStroller = ({ size = 24, strokeWidth = 2, className }: Props) => (
  <svg {...base(size)} strokeWidth={strokeWidth} className={className}>
    <path d="M4 4h3l10 10H7a3 3 0 0 1 0-6h11" />
    <circle cx="8" cy="19" r="2" />
    <circle cx="18" cy="19" r="2" />
  </svg>
);

export const IconWeight = ({ size = 24, strokeWidth = 2, className }: Props) => (
  <svg {...base(size)} strokeWidth={strokeWidth} className={className}>
    <path d="M4 12H2M22 12h-2M7 9H5v6h2M19 9h-2v6h2" />
    <rect x="7" y="7" width="10" height="10" rx="1" />
  </svg>
);

export const IconInstagram = ({ size = 18, strokeWidth = 1.8, className }: Props) => (
  <svg {...base(size)} strokeWidth={strokeWidth} className={className}>
    <rect x="3" y="3" width="18" height="18" rx="5" />
    <circle cx="12" cy="12" r="4" />
    <circle cx="17.5" cy="6.5" r="0.8" fill="currentColor" />
  </svg>
);

export const IconTikTok = ({ size = 18, strokeWidth = 1.8, className }: Props) => (
  <svg {...base(size)} strokeWidth={strokeWidth} className={className}>
    <path d="M14 3v11a4 4 0 1 1-4-4" />
    <path d="M14 3a5 5 0 0 0 5 5" />
  </svg>
);

export const IconYouTube = ({ size = 18, strokeWidth = 1.8, className }: Props) => (
  <svg {...base(size)} strokeWidth={strokeWidth} className={className}>
    <rect x="2" y="5" width="20" height="14" rx="3" />
    <polygon points="10 8 16 12 10 16" fill="currentColor" stroke="none" />
  </svg>
);

export const IconPinterest = ({ size = 18, strokeWidth = 1.8, className }: Props) => (
  <svg {...base(size)} strokeWidth={strokeWidth} className={className}>
    <circle cx="12" cy="12" r="9" />
    <path d="M10 22c.5-2 1-4 1-5 .5 1.5 2 2 3 2 3 0 5-3 5-6a6 6 0 0 0-12 0c0 2 1 3 2 3.5" />
  </svg>
);

export const IconCheck = ({ size = 18, strokeWidth = 2, className }: Props) => (
  <svg {...base(size)} strokeWidth={strokeWidth} className={className}>
    <path d="m5 12 5 5L20 7" />
  </svg>
);

export const IconGrid = ({ size = 24, strokeWidth = 2, className }: Props) => (
  <svg {...base(size)} strokeWidth={strokeWidth} className={className}>
    <rect x="3" y="3" width="7" height="7" />
    <rect x="14" y="3" width="7" height="7" />
    <rect x="3" y="14" width="7" height="7" />
    <rect x="14" y="14" width="7" height="7" />
  </svg>
);

export const IconTrendingUp = ({ size = 18, strokeWidth = 2, className }: Props) => (
  <svg {...base(size)} strokeWidth={strokeWidth} className={className}>
    <path d="m3 17 6-6 4 4 8-8" />
    <path d="M14 7h7v7" />
  </svg>
);

export const IconUsers = ({ size = 18, strokeWidth = 2, className }: Props) => (
  <svg {...base(size)} strokeWidth={strokeWidth} className={className}>
    <circle cx="9" cy="8" r="4" />
    <path d="M2 21c0-4 3-7 7-7s7 3 7 7" />
    <circle cx="17" cy="7" r="3" />
    <path d="M22 20c0-3-2-5-5-5" />
  </svg>
);

type PlatformIconKey = "Instagram" | "TikTok" | "YouTube" | "Pinterest";
export const platformIcon = (platform: PlatformIconKey, size = 16) => {
  const map: Record<PlatformIconKey, React.ReactNode> = {
    Instagram: <IconInstagram size={size} />,
    TikTok: <IconTikTok size={size} />,
    YouTube: <IconYouTube size={size} />,
    Pinterest: <IconPinterest size={size} />,
  };
  return map[platform];
};

type NicheIconKey =
  | "sparkle"
  | "fashion"
  | "plane"
  | "utensils"
  | "leaf"
  | "chip"
  | "home"
  | "stroller"
  | "weight"
  | "star";
export const nicheIcon = (key: NicheIconKey, size = 22) => {
  const map: Record<NicheIconKey, React.ReactNode> = {
    sparkle: <IconSparkle size={size} />,
    fashion: <IconFashion size={size} />,
    plane: <IconPlane size={size} />,
    utensils: <IconUtensils size={size} />,
    leaf: <IconLeaf size={size} />,
    chip: <IconChip size={size} />,
    home: <IconHome size={size} />,
    stroller: <IconStroller size={size} />,
    weight: <IconWeight size={size} />,
    star: <IconStar size={size} />,
  };
  return map[key];
};

type UseCaseIconKey =
  | "video"
  | "rocket"
  | "megaphone"
  | "hashtag"
  | "hotel"
  | "shopping"
  | "heart";
export const useCaseIcon = (key: UseCaseIconKey, size = 22) => {
  const map: Record<UseCaseIconKey, React.ReactNode> = {
    video: <IconVideo size={size} />,
    rocket: <IconRocket size={size} />,
    megaphone: <IconMegaphone size={size} />,
    hashtag: <IconHashtag size={size} />,
    hotel: <IconHotel size={size} />,
    shopping: <IconShopping size={size} />,
    heart: <IconHeart size={size} />,
  };
  return map[key];
};
