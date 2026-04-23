/**
 * Creator Circuit — imagery map.
 *
 * Centralized Unsplash references so pages stay thin. All URLs use the
 * unsplash CDN with auto-format + width sizing.
 */

const U = (id: string, w = 1400) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&q=80`;

export const IMAGERY = {
  heroMain: U("1617957689233-207e3cd3c610", 900),
  heroSecondary: U("1494790108377-be9c29b29330", 600),
  heroTertiary: U("1556761175-5973dc0f32e7", 500),

  // Content creation world
  contentFlatlay: U("1611162617213-7d7a39e9b1d7", 1200),
  contentFilming: U("1556761175-5973dc0f32e7", 1200),
  contentSetup: U("1598300042247-d088f8ab3a91", 1200),
  contentRingLight: U("1551817958-c5b51e7b4a33", 1200),

  // For Brands hero
  brandsHero: U("1600880292203-757bb62b4baf", 1600),
  brandsAction: U("1522071820081-009f0129c71c", 1200),

  // For Creators hero
  creatorsHero: U("1598514983318-2f64f8f4796c", 1600),
  creatorsAction: U("1495474472287-4d71bcdd2085", 1200),

  // About hero
  aboutHero: U("1556761175-5973dc0f32e7", 1600),

  // Contact
  contactHero: U("1542744173-8e7e53415bb0", 1200),

  // Gallery tiles for final CTA
  collageA: U("1522337360788-8b13dee7a37e", 800),
  collageB: U("1529139574466-a303027c1d8b", 800),
  collageC: U("1504674900247-0877df9cc836", 800),
  collageD: U("1506905925346-21bda4d32df4", 800),
} as const;
