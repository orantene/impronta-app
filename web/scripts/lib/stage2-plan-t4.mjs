/**
 * T4: US salon. USD, America/New_York, English first. Its own workspace, staff, two roster stylists with booking hours and public
 * services priced in USD (four exact prices and one "from" price). Its Stripe Connect TEST account is the separate --stripe step (push 3); no payout row is seeded here.
 */
import { email, membershipOp, s2Id, userOps, workspaceOps } from "./stage2-ops.mjs";
import { talentOps, talentServiceOp } from "./stage2-ops-talent.mjs";

export const T4_SLUG = "s2-salon";
export const T4_WS = s2Id("workspace:t4");
export const T4_TZ = "America/New_York";

const SERVICES = [
  { key: "t4-haircut", talent: "t4-maya", title: "Haircut", titleEn: "Haircut", description: "A classic cut and style.", descriptionEn: "A classic cut and style.", cents: 4500, minutes: 45 },
  { key: "t4-color", talent: "t4-maya", title: "Full color", titleEn: "Full color", description: "Single-process color with toner.", descriptionEn: "Single-process color with toner.", cents: 12000, minutes: 120 },
  { key: "t4-blowout", talent: "t4-jordan", title: "Blowout", titleEn: "Blowout", description: "Wash and blowout.", descriptionEn: "Wash and blowout.", cents: 3500, minutes: 30 },
  { key: "t4-kids", talent: "t4-jordan", title: "Kids haircut", titleEn: "Kids haircut", description: "For children under twelve.", descriptionEn: "For children under twelve.", cents: 3000, minutes: 30 },
  // TUL-1327: the one "Desde" (from-price) service. price_display 'from' + booking_mode 'request' (the pricing tab sets both; a CHECK forbids instant booking unless the price is exact).
  { key: "t4-bridal-trial", talent: "t4-maya", title: "Bridal hair trial", titleEn: "Bridal hair trial", description: "A styling session to plan your wedding-day look. The final price depends on length and style.", descriptionEn: "A styling session to plan your wedding-day look. The final price depends on length and style.", cents: 15000, minutes: 90, priceDisplay: "from", bookingMode: "request" },
];

export function planT4(at) {
  const fx = "T4";
  const ws = T4_WS;
  const w = workspaceOps(fx, "t4", {
    slug: T4_SLUG, name: "Brisa Hair Studio", tagline: "Cuts and color in Miami", businessType: "hair-salon", plan: "studio", workspaceType: "talent", seats: 5,
    currency: "USD", locales: ["en", "es"], tz: T4_TZ, ownerKey: "t4-owner", at,
  });
  const ops = [
    ...userOps(fx, "t4-owner", { email: email("t4-owner"), name: "Dana Brooks" }),
    ...userOps(fx, "t4-reception", { email: email("t4-reception"), name: "Chris Alvarez" }),
    ...userOps(fx, "t4-stylist", { email: email("t4-stylist"), name: "Maya Torres", appRole: "talent" }),
    ...w.ops,
    membershipOp(fx, "t4-reception", ws, "t4-reception", { role: "editor" }, at),
  ];
  const tids = {};
  for (const t of [
    { key: "t4-maya", code: "TAL-96202", display: "Maya Torres", tagline: "Color specialist", userKey: "t4-stylist" },
    { key: "t4-jordan", code: "TAL-96203", display: "Jordan Lee", tagline: "Cuts and styling", userKey: null },
  ]) {
    const made = talentOps(fx, t.key, { code: t.code, display: t.display, tagline: t.tagline, userKey: t.userKey, ws, tz: T4_TZ, currency: "USD", locale: "en" }, at);
    tids[t.key] = made.tid;
    ops.push(...made.ops);
  }
  for (const s of SERVICES) {
    ops.push(talentServiceOp(fx, s.key, tids[s.talent], ws, { title: s.title, titleEn: s.titleEn, description: s.description, descriptionEn: s.descriptionEn, cents: s.cents, minutes: s.minutes, currency: "USD", category: "Hair", ...(s.priceDisplay ? { priceDisplay: s.priceDisplay, bookingMode: s.bookingMode } : {}) }));
  }
  return ops;
}
