/**
 * Creator Circuit — demo creator roster.
 *
 * Hardcoded prototype data for the marketplace. Future systemization:
 *   - Creators live in `talent_profiles` + a creator-specific custom field
 *     group (follower count, engagement, platforms, niches).
 *   - Tenant-level "Creator vs. Model" preset would swap card/profile
 *     templates + field groups as a single switch.
 */

export type Platform =
  | "Instagram"
  | "TikTok"
  | "YouTube"
  | "Pinterest";

export type CreatorType = "UGC" | "Influencer" | "Hybrid";

export type CreatorHandle = {
  platform: Platform;
  handle: string;
  followers: number;
  engagement: number; // %
};

export type Creator = {
  slug: string;
  name: string;
  handle: string;
  role: string;
  type: CreatorType;
  niches: string[];
  city: string;
  region: string;
  languages: string[];
  platforms: CreatorHandle[];
  primaryPlatform: Platform;
  headlineFollowers: number;
  headlineEngagement: number;
  contentStyles: string[];
  deliverables: string[];
  bestFor: string[];
  audienceMarket: string[];
  startingFrom: string;
  bio: string;
  pitch: string;
  portrait: string;
  reelCover: string;
  samples: string[];
  collaborations: { brand: string; campaign: string }[];
  featured?: boolean;
};

/** Compact follower formatter: 128500 → "128.5K", 1400000 → "1.4M". */
export function formatFollowers(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}K`;
  return `${n}`;
}

/** Format engagement as "6.4%". */
export function formatEngagement(n: number): string {
  return `${n.toFixed(1)}%`;
}

/** Sum platform followers for the headline stat. */
function sumFollowers(platforms: CreatorHandle[]): number {
  return platforms.reduce((acc, p) => acc + p.followers, 0);
}

const UNSPLASH = (id: string, w = 900) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&q=80`;

export const CREATORS: Creator[] = [
  {
    slug: "maya-oduya",
    name: "Maya Oduya",
    handle: "@mayaoduya",
    role: "Beauty Creator",
    type: "Hybrid",
    niches: ["Beauty", "Lifestyle"],
    city: "Brooklyn",
    region: "New York",
    languages: ["English"],
    platforms: [
      { platform: "Instagram", handle: "@mayaoduya", followers: 248000, engagement: 6.4 },
      { platform: "TikTok", handle: "@mayaoduya", followers: 612000, engagement: 9.2 },
      { platform: "YouTube", handle: "Maya Oduya", followers: 84000, engagement: 4.1 },
    ],
    primaryPlatform: "TikTok",
    headlineFollowers: 0,
    headlineEngagement: 9.2,
    contentStyles: ["Tutorial", "Product demo", "Get-ready-with-me", "Voiceover UGC"],
    deliverables: ["UGC videos", "Short-form edits", "Story sets", "Whitelist-ready"],
    bestFor: ["Skincare launches", "Beauty brands", "Color cosmetics"],
    audienceMarket: ["US", "UK", "Canada"],
    startingFrom: "From $1,250 / video",
    bio: "Maya is a beauty-first creator with a cult TikTok following for unsponsored-feeling reviews. Editors love her — so do brands looking for UGC that outperforms paid creative.",
    pitch: "Honest beauty reviews that convert. UGC that doesn't look like UGC.",
    portrait: UNSPLASH("1531123897727-8f129e1688ce", 900),
    reelCover: UNSPLASH("1522337360788-8b13dee7a37e", 900),
    samples: [
      UNSPLASH("1522337360788-8b13dee7a37e", 500),
      UNSPLASH("1512496015851-a90fb38ba796", 500),
      UNSPLASH("1596462502278-27bfdc403348", 500),
      UNSPLASH("1571019613454-1cb2f99b2d8b", 500),
      UNSPLASH("1526045431048-f857369baa09", 500),
      UNSPLASH("1503236823255-94609f598e71", 500),
    ],
    collaborations: [
      { brand: "Glossier", campaign: "Futuredew launch" },
      { brand: "Rhode", campaign: "Lip gloss UGC bundle" },
      { brand: "Summer Fridays", campaign: "Jet Lag Mask campaign" },
    ],
    featured: true,
  },
  {
    slug: "theo-nakamura",
    name: "Theo Nakamura",
    handle: "@theogram",
    role: "Tech Creator",
    type: "Influencer",
    niches: ["Tech", "Lifestyle"],
    city: "San Francisco",
    region: "California",
    languages: ["English", "Japanese"],
    platforms: [
      { platform: "YouTube", handle: "Theo Nakamura", followers: 1_240_000, engagement: 5.8 },
      { platform: "Instagram", handle: "@theogram", followers: 312000, engagement: 4.2 },
      { platform: "TikTok", handle: "@theogram", followers: 486000, engagement: 7.1 },
    ],
    primaryPlatform: "YouTube",
    headlineFollowers: 0,
    headlineEngagement: 5.8,
    contentStyles: ["Review style", "Unboxing", "Comparison", "Explainer"],
    deliverables: ["Long-form YouTube", "Shorts cutdowns", "Paid integrations", "Dedicated review"],
    bestFor: ["Product launches", "Consumer tech", "Apps & SaaS"],
    audienceMarket: ["US", "Japan", "Global"],
    startingFrom: "From $4,800 / integration",
    bio: "Theo reviews consumer tech with engineering-precise detail and a calm, trusted voice. His audience waits for his launch-day coverage.",
    pitch: "The review that actually gets watched end-to-end.",
    portrait: UNSPLASH("1507003211169-0a1dd7228f2d", 900),
    reelCover: UNSPLASH("1593642632559-0c6d3fc62b89", 900),
    samples: [
      UNSPLASH("1593642632559-0c6d3fc62b89", 500),
      UNSPLASH("1519389950473-47ba0277781c", 500),
      UNSPLASH("1498050108023-c5249f4df085", 500),
      UNSPLASH("1550745165-9bc0b252726f", 500),
    ],
    collaborations: [
      { brand: "Sony", campaign: "WH-1000XM5 launch" },
      { brand: "Notion", campaign: "Creator workflow series" },
      { brand: "Dyson", campaign: "Airwrap integration" },
    ],
    featured: true,
  },
  {
    slug: "lila-reyes",
    name: "Lila Reyes",
    handle: "@lilareyes",
    role: "Fashion Creator",
    type: "Influencer",
    niches: ["Fashion", "Lifestyle"],
    city: "Los Angeles",
    region: "California",
    languages: ["English", "Spanish"],
    platforms: [
      { platform: "Instagram", handle: "@lilareyes", followers: 528000, engagement: 5.1 },
      { platform: "TikTok", handle: "@lilareyes", followers: 842000, engagement: 7.8 },
      { platform: "Pinterest", handle: "lilareyes", followers: 124000, engagement: 3.2 },
    ],
    primaryPlatform: "Instagram",
    headlineFollowers: 0,
    headlineEngagement: 7.8,
    contentStyles: ["Lookbook", "Outfit of the day", "Try-on haul", "Editorial"],
    deliverables: ["Static editorial", "Reels", "Story sets", "Carousel sets"],
    bestFor: ["Fashion launches", "Capsule drops", "DTC brands"],
    audienceMarket: ["US", "Latin America"],
    startingFrom: "From $2,400 / reel",
    bio: "Lila's feed reads like an editorial magazine — controlled palettes, crisp styling, and a fluency in both English and Spanish markets.",
    pitch: "Editorial-grade fashion content with Latin America fluency.",
    portrait: UNSPLASH("1494790108377-be9c29b29330", 900),
    reelCover: UNSPLASH("1529139574466-a303027c1d8b", 900),
    samples: [
      UNSPLASH("1529139574466-a303027c1d8b", 500),
      UNSPLASH("1483985988355-763728e1935b", 500),
      UNSPLASH("1515372039744-b8f02a3ae446", 500),
      UNSPLASH("1509631179647-0177331693ae", 500),
      UNSPLASH("1496747611176-843222e1e57c", 500),
      UNSPLASH("1492707892479-7bc8d5a4ee93", 500),
    ],
    collaborations: [
      { brand: "Reformation", campaign: "Spring capsule" },
      { brand: "Staud", campaign: "Resort editorial" },
      { brand: "Aritzia", campaign: "Effortless series" },
    ],
    featured: true,
  },
  {
    slug: "ade-johnson",
    name: "Ade Johnson",
    handle: "@adejohnsonco",
    role: "UGC Creator",
    type: "UGC",
    niches: ["Wellness", "Beauty", "Food"],
    city: "Austin",
    region: "Texas",
    languages: ["English"],
    platforms: [
      { platform: "TikTok", handle: "@adejohnsonco", followers: 38000, engagement: 4.5 },
    ],
    primaryPlatform: "TikTok",
    headlineFollowers: 0,
    headlineEngagement: 4.5,
    contentStyles: ["Voiceover UGC", "Product demo", "Testimonial", "Hook + CTA"],
    deliverables: ["UGC-only videos", "Paid ad creative", "3-hook variants", "Still photography"],
    bestFor: ["Paid social", "Meta ad creative", "TikTok Ads Manager"],
    audienceMarket: ["US"],
    startingFrom: "From $850 / video",
    bio: "Ade is a UGC-only creator who delivers high-performing ad creative. Multiple variants per shoot, scroll-stopping hooks, shipped fast.",
    pitch: "UGC built for paid social — hook-forward, conversion-driven.",
    portrait: UNSPLASH("1500648767791-00dcc994a43e", 900),
    reelCover: UNSPLASH("1556228720-195a672e8a03", 900),
    samples: [
      UNSPLASH("1556228720-195a672e8a03", 500),
      UNSPLASH("1556228453-efd6c1ff04f6", 500),
      UNSPLASH("1611162617213-7d7a39e9b1d7", 500),
      UNSPLASH("1556228578-8c89e6adf883", 500),
    ],
    collaborations: [
      { brand: "Ritual", campaign: "Multivitamin UGC pack" },
      { brand: "Olipop", campaign: "Gut-health ad variants" },
      { brand: "Native", campaign: "Meta creative sprint" },
    ],
  },
  {
    slug: "priya-kapoor",
    name: "Priya Kapoor",
    handle: "@priyatravels",
    role: "Travel Creator",
    type: "Influencer",
    niches: ["Travel", "Lifestyle"],
    city: "London",
    region: "UK",
    languages: ["English", "Hindi"],
    platforms: [
      { platform: "Instagram", handle: "@priyatravels", followers: 896000, engagement: 4.8 },
      { platform: "YouTube", handle: "Priya Kapoor", followers: 412000, engagement: 6.0 },
    ],
    primaryPlatform: "Instagram",
    headlineFollowers: 0,
    headlineEngagement: 6.0,
    contentStyles: ["Travel vlog", "Destination feature", "Hotel review", "Editorial"],
    deliverables: ["Hotel takeovers", "Long-form YouTube", "Reels bundles", "Story series"],
    bestFor: ["Hospitality brands", "Destinations", "Luxury travel"],
    audienceMarket: ["UK", "India", "EU", "US"],
    startingFrom: "From $6,200 / stay",
    bio: "Priya produces editorial-grade travel content for hospitality brands — her audience books what she features, and properties see bookings lift within 72 hours.",
    pitch: "Luxury travel content that books rooms.",
    portrait: UNSPLASH("1438761681033-6461ffad8d80", 900),
    reelCover: UNSPLASH("1506905925346-21bda4d32df4", 900),
    samples: [
      UNSPLASH("1506905925346-21bda4d32df4", 500),
      UNSPLASH("1476514525535-07fb3b4ae5f1", 500),
      UNSPLASH("1519821172141-b5d8f3eeff94", 500),
      UNSPLASH("1507525428034-b723cf961d3e", 500),
      UNSPLASH("1507699622108-4be3abd695ad", 500),
      UNSPLASH("1501785888041-af3ef285b470", 500),
    ],
    collaborations: [
      { brand: "Aman Resorts", campaign: "Amanpuri takeover" },
      { brand: "Four Seasons", campaign: "Maldives stay" },
      { brand: "Visit Morocco", campaign: "Marrakech series" },
    ],
    featured: true,
  },
  {
    slug: "cam-wright",
    name: "Cam Wright",
    handle: "@camlifts",
    role: "Fitness Creator",
    type: "Influencer",
    niches: ["Fitness", "Wellness"],
    city: "Miami",
    region: "Florida",
    languages: ["English"],
    platforms: [
      { platform: "Instagram", handle: "@camlifts", followers: 342000, engagement: 5.2 },
      { platform: "TikTok", handle: "@camlifts", followers: 712000, engagement: 8.4 },
    ],
    primaryPlatform: "TikTok",
    headlineFollowers: 0,
    headlineEngagement: 8.4,
    contentStyles: ["Workout demo", "Tutorial", "Transformation", "Before / after"],
    deliverables: ["Workout series", "Product integrations", "Paid ad creative", "Story sets"],
    bestFor: ["Supplement brands", "Activewear", "Fitness apps"],
    audienceMarket: ["US", "Global"],
    startingFrom: "From $1,800 / post",
    bio: "Cam teaches strength training to beginners. His feed is a rare mix of educational value and conversion-ready product integrations.",
    pitch: "Fitness content that actually teaches — and sells.",
    portrait: UNSPLASH("1534528741775-53994a69daeb", 900),
    reelCover: UNSPLASH("1579758629938-03607ccdbaba", 900),
    samples: [
      UNSPLASH("1579758629938-03607ccdbaba", 500),
      UNSPLASH("1517836357463-d25dfeac3438", 500),
      UNSPLASH("1571019614242-c5c5dee9f50b", 500),
      UNSPLASH("1540497077202-7c8a3999166f", 500),
    ],
    collaborations: [
      { brand: "Gymshark", campaign: "Lifting series Q3" },
      { brand: "Athletic Greens", campaign: "Morning routine integration" },
    ],
  },
  {
    slug: "sana-kim",
    name: "Sana Kim",
    handle: "@sanakimhome",
    role: "Home Creator",
    type: "Hybrid",
    niches: ["Home", "Lifestyle", "Parenting"],
    city: "Portland",
    region: "Oregon",
    languages: ["English", "Korean"],
    platforms: [
      { platform: "Instagram", handle: "@sanakimhome", followers: 186000, engagement: 6.1 },
      { platform: "Pinterest", handle: "sanakimhome", followers: 324000, engagement: 2.8 },
      { platform: "TikTok", handle: "@sanakimhome", followers: 98000, engagement: 7.2 },
    ],
    primaryPlatform: "Instagram",
    headlineFollowers: 0,
    headlineEngagement: 7.2,
    contentStyles: ["Flatlay", "Styling", "Routine", "Voiceover"],
    deliverables: ["Still photography", "Pinterest pins", "Reels", "UGC bundle"],
    bestFor: ["Home goods", "Parenting brands", "DTC launches"],
    audienceMarket: ["US", "Korea"],
    startingFrom: "From $1,400 / post",
    bio: "Sana's home feed is a masterclass in styled simplicity. Her Pinterest distribution is genuinely rare — a SEO moat inside a social platform.",
    pitch: "Home content with Pinterest distribution muscle.",
    portrait: UNSPLASH("1544005313-94ddf0286df2", 900),
    reelCover: UNSPLASH("1493663284031-b7e3aefcae8e", 900),
    samples: [
      UNSPLASH("1493663284031-b7e3aefcae8e", 500),
      UNSPLASH("1540518614846-7eded433c457", 500),
      UNSPLASH("1513694203232-719a280e022f", 500),
      UNSPLASH("1505691938895-1758d7feb511", 500),
      UNSPLASH("1522444690501-9b1d4e9a98cd", 500),
    ],
    collaborations: [
      { brand: "Parachute", campaign: "Bedding launch" },
      { brand: "Brooklinen", campaign: "Nursery series" },
    ],
  },
  {
    slug: "noa-harel",
    name: "Noa Harel",
    handle: "@noaeatsfood",
    role: "Food Creator",
    type: "Influencer",
    niches: ["Food", "Lifestyle"],
    city: "Tel Aviv",
    region: "Israel",
    languages: ["English", "Hebrew"],
    platforms: [
      { platform: "Instagram", handle: "@noaeatsfood", followers: 462000, engagement: 5.9 },
      { platform: "TikTok", handle: "@noaeatsfood", followers: 1_100_000, engagement: 9.8 },
    ],
    primaryPlatform: "TikTok",
    headlineFollowers: 0,
    headlineEngagement: 9.8,
    contentStyles: ["Recipe video", "Restaurant review", "Pantry raid", "Voiceover"],
    deliverables: ["Recipe reels", "Brand-integrated recipes", "Still photography", "Story sets"],
    bestFor: ["Pantry brands", "Kitchen appliances", "CPG launches"],
    audienceMarket: ["US", "EU", "Middle East"],
    startingFrom: "From $2,800 / recipe"  ,
    bio: "Noa makes food feel urgent. Her recipe reels convert consistently — brands in her pantry see measurable search lift within 48 hours.",
    pitch: "Recipe content that drives real search lift.",
    portrait: UNSPLASH("1489424731084-a5d8b219a5bb", 900),
    reelCover: UNSPLASH("1504674900247-0877df9cc836", 900),
    samples: [
      UNSPLASH("1504674900247-0877df9cc836", 500),
      UNSPLASH("1547592180-85f173990554", 500),
      UNSPLASH("1495474472287-4d71bcdd2085", 500),
      UNSPLASH("1484723091739-30a097e8f929", 500),
    ],
    collaborations: [
      { brand: "Maldon", campaign: "Sea salt series" },
      { brand: "Le Creuset", campaign: "Dutch oven feature" },
    ],
    featured: true,
  },
  {
    slug: "jules-okafor",
    name: "Jules Okafor",
    handle: "@juleswrites",
    role: "Lifestyle Creator",
    type: "Hybrid",
    niches: ["Lifestyle", "Wellness", "Beauty"],
    city: "Chicago",
    region: "Illinois",
    languages: ["English"],
    platforms: [
      { platform: "Instagram", handle: "@juleswrites", followers: 142000, engagement: 6.8 },
      { platform: "TikTok", handle: "@juleswrites", followers: 218000, engagement: 8.1 },
    ],
    primaryPlatform: "Instagram",
    headlineFollowers: 0,
    headlineEngagement: 8.1,
    contentStyles: ["Day in the life", "Morning routine", "Review", "Voiceover UGC"],
    deliverables: ["Mid-tier influencer drops", "UGC variants", "Reels series"],
    bestFor: ["Wellness brands", "Mid-tier launches", "Paid + organic"],
    audienceMarket: ["US", "Canada"],
    startingFrom: "From $1,100 / post",
    bio: "Jules bridges UGC performance with influencer reach — brands use her for dual-play drops that seed organic and feed paid.",
    pitch: "The dual-play creator: UGC + influencer in one shoot.",
    portrait: UNSPLASH("1492562080023-ab3db95bfbce", 900),
    reelCover: UNSPLASH("1541462608143-67571c6738dd", 900),
    samples: [
      UNSPLASH("1541462608143-67571c6738dd", 500),
      UNSPLASH("1542838132-92c53300491e", 500),
      UNSPLASH("1515377905703-c4788e51af15", 500),
      UNSPLASH("1498050108023-c5249f4df085", 500),
    ],
    collaborations: [
      { brand: "Rituel de Fille", campaign: "Natural beauty launch" },
      { brand: "Seed", campaign: "Probiotics drop" },
    ],
  },
  {
    slug: "dani-ortiz",
    name: "Dani Ortiz",
    handle: "@daniortiz",
    role: "Beauty Creator",
    type: "UGC",
    niches: ["Beauty"],
    city: "Mexico City",
    region: "Mexico",
    languages: ["English", "Spanish"],
    platforms: [
      { platform: "TikTok", handle: "@daniortiz", followers: 24000, engagement: 5.2 },
    ],
    primaryPlatform: "TikTok",
    headlineFollowers: 0,
    headlineEngagement: 5.2,
    contentStyles: ["Voiceover UGC", "Review", "Tutorial", "Product demo"],
    deliverables: ["UGC-only videos", "3-hook variants", "Bilingual cuts"],
    bestFor: ["Latin American launches", "Bilingual paid social", "Beauty UGC"],
    audienceMarket: ["Mexico", "US Latinx"],
    startingFrom: "From $950 / video",
    bio: "Dani is one of our most-requested bilingual UGC creators. Beauty brands use her for simultaneous US + LATAM campaign launches.",
    pitch: "Bilingual UGC that unlocks LATAM distribution.",
    portrait: UNSPLASH("1534751516642-a1af1ef26a56", 900),
    reelCover: UNSPLASH("1522335789203-aaba5c2b8e91", 900),
    samples: [
      UNSPLASH("1522335789203-aaba5c2b8e91", 500),
      UNSPLASH("1586022668715-d90fbc42a8a6", 500),
      UNSPLASH("1487412947147-5cebf100ffc2", 500),
      UNSPLASH("1531746020798-e6953c6e8e04", 500),
    ],
    collaborations: [
      { brand: "Fenty Beauty", campaign: "Bilingual UGC pack" },
      { brand: "NYX", campaign: "LATAM launch" },
    ],
  },
  {
    slug: "ben-arroyo",
    name: "Ben Arroyo",
    handle: "@benarroyo",
    role: "Content Creator",
    type: "Influencer",
    niches: ["Tech", "Lifestyle"],
    city: "Austin",
    region: "Texas",
    languages: ["English", "Spanish"],
    platforms: [
      { platform: "YouTube", handle: "Ben Arroyo", followers: 624000, engagement: 6.8 },
      { platform: "Instagram", handle: "@benarroyo", followers: 186000, engagement: 4.4 },
    ],
    primaryPlatform: "YouTube",
    headlineFollowers: 0,
    headlineEngagement: 6.8,
    contentStyles: ["Review style", "Explainer", "Day in the life", "Vlog"],
    deliverables: ["Long-form YouTube", "Dedicated video", "Integrations"],
    bestFor: ["Productivity apps", "SaaS launches", "Consumer tech"],
    audienceMarket: ["US", "LATAM"],
    startingFrom: "From $3,800 / integration",
    bio: "Ben makes complex tools feel accessible. His audience trusts his recommendations — and his CTR reflects it.",
    pitch: "Productivity + tech content with real conversion.",
    portrait: UNSPLASH("1463453091185-61582044d556", 900),
    reelCover: UNSPLASH("1501504905252-473c47e087f8", 900),
    samples: [
      UNSPLASH("1501504905252-473c47e087f8", 500),
      UNSPLASH("1498050108023-c5249f4df085", 500),
      UNSPLASH("1517245386807-bb43f82c33c4", 500),
      UNSPLASH("1550439062-609e1531270e", 500),
    ],
    collaborations: [
      { brand: "Linear", campaign: "Workflow deep dive" },
      { brand: "Raycast", campaign: "Productivity series" },
    ],
  },
  {
    slug: "iris-chen",
    name: "Iris Chen",
    handle: "@irischen",
    role: "Fashion Creator",
    type: "Hybrid",
    niches: ["Fashion", "Beauty"],
    city: "New York",
    region: "New York",
    languages: ["English", "Mandarin"],
    platforms: [
      { platform: "Instagram", handle: "@irischen", followers: 742000, engagement: 4.9 },
      { platform: "TikTok", handle: "@irischen", followers: 1_400_000, engagement: 8.6 },
      { platform: "Pinterest", handle: "irischen", followers: 88000, engagement: 3.0 },
    ],
    primaryPlatform: "Instagram",
    headlineFollowers: 0,
    headlineEngagement: 8.6,
    contentStyles: ["Editorial", "Try-on haul", "GRWM", "Lookbook"],
    deliverables: ["Reels", "Editorial stills", "Story sets", "UGC bundle"],
    bestFor: ["Luxury fashion", "Capsule drops", "Asia-Pacific expansion"],
    audienceMarket: ["US", "Asia-Pacific"],
    startingFrom: "From $5,400 / reel",
    bio: "Iris is one of Creator Circuit's most in-demand fashion creators — her editorial eye and APAC reach make her a go-to for luxury drops.",
    pitch: "Luxury fashion with APAC audience fluency.",
    portrait: UNSPLASH("1488426862026-3ee34a7d66df", 900),
    reelCover: UNSPLASH("1485968579580-b6d095142e6e", 900),
    samples: [
      UNSPLASH("1485968579580-b6d095142e6e", 500),
      UNSPLASH("1521572163474-6864f9cf17ab", 500),
      UNSPLASH("1496747611176-843222e1e57c", 500),
      UNSPLASH("1515886657613-9f3515b0c78f", 500),
      UNSPLASH("1509631179647-0177331693ae", 500),
      UNSPLASH("1492707892479-7bc8d5a4ee93", 500),
    ],
    collaborations: [
      { brand: "The Row", campaign: "Resort '26 editorial" },
      { brand: "Lemaire", campaign: "SS campaign" },
      { brand: "Prada Beauty", campaign: "Lipstick launch" },
    ],
    featured: true,
  },
];

// Backfill headlineFollowers from sum of platforms
for (const c of CREATORS) {
  c.headlineFollowers = sumFollowers(c.platforms);
}

export const CREATOR_BY_SLUG: Record<string, Creator> = Object.fromEntries(
  CREATORS.map((c) => [c.slug, c]),
);
