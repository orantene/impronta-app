/**
 * ALEX TREVIÑO, Gridline's reference demo talent (TAL-93030). Fictional.
 * Strings, services, prices and job captions come from the pinned mockup's
 * content fixture (`design-references/gridline/content.json`), so the seed and
 * the rebuild's content step read one source. The seed only has to produce the
 * skeleton (user, profile, taxonomy, hours, photos, four offerings); "Rebuild
 * demos" writes the exact services, matrix cells, intake questions, FAQ, area
 * chips, job captions and the Gridline page copy.
 *
 * Photos are the nine mockup images (`design-references/gridline/img/<key>.jpg`,
 * passed with `--photo-dir`), the one demo that must match the mockup photo for
 * photo, so it does not use platform stock. Sources are the mockup's Unsplash
 * picks, recorded on each media asset.
 */
import content from "../../design-references/gridline/content.json";
import type { DemoService, DemoTalent } from "./demo-types";

const U = (id: string) => `https://unsplash.com/photos/${id}`;

/** Mockup photo key to Unsplash photo id (index.html `images`). */
export const ALEX_PHOTO_SOURCES: Readonly<Record<string, string>> = {
  "th16-gridline-alex": U("1621905252507-b35492cc74b4"),
  "th16-gridline-test": U("1758101755915-462eddc23f57"),
  "th16-gridline-lamps": U("1536664607464-9a9419341c4d"),
  "th16-gridline-board": U("1566417110090-6b15a06ec800"),
  "th16-gridline-wires": U("1601462904263-f2fa0c851cb9"),
  "th16-gridline-pendant": U("1553604588-20fc10d843a7"),
  "th16-gridline-breakers": U("1576446470246-499c738d1c8e"),
  "th16-gridline-meter": U("1553873002-785d775854c9"),
  "th16-gridline-work": U("1621905251189-08b45d6a269e"),
};

type Svc = (typeof content.services)[number];

const service = (s: Svc, pricingType: DemoService["pricingType"], booking: DemoService["booking"]): DemoService => ({
  name: s.name,
  description: s.description,
  category: s.category,
  pricingType,
  amountMxn: s.priceAmount,
  durationMin: s.durationMinutes ?? 60,
  booking,
  photo: s.imageKey,
  cancellationHours: 4,
});

export const ALEX: DemoTalent = {
  profileCode: "TAL-93030",
  email: "demo-alex-trevino@impronta.test",
  displayName: content.talent.displayName,
  siteSlug: "alex-trevino",
  city: content.talent.city,
  serviceCategorySlug: "skilled-trades",
  talentTypeSlug: "electrician",
  theme: "gridline",
  palette: "default",
  // The mockup's slots run 08:00 to 17:00; Monday to Saturday.
  hours: { timezone: "America/Monterrey", days: [1, 2, 3, 4, 5, 6], startMin: 8 * 60, endMin: 18 * 60, slotMinutes: 60 },
  tagline: content.talent.tagline,
  bio: content.talent.bio,
  services: [
    service(content.services[0]!, "flat_package", "instant"),
    service(content.services[1]!, "per_contact", "request"),
    service(content.services[2]!, "custom", "quote"),
    service(content.services[3]!, "custom", "quote"),
  ],
  photos: {
    headshot: "th16-gridline-alex",
    // Job cards: two-line captions, title then detail (the work-order convention).
    work: content.portfolio.items.map((i) => ({ key: i.imageKey, caption: `${i.title}\n${i.caption}` })),
    more: ["th16-gridline-test", "th16-gridline-wires"],
    alt: {
      ...Object.fromEntries(content.portfolio.items.map((i) => [i.imageKey, i.title])),
      "th16-gridline-alex": content.hero.imageAlt,
    },
  },
};
