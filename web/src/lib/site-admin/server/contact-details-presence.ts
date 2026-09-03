/**
 * contact-details-presence.ts — is there enough here to publish a contact page?
 *
 * D7, decided 2026-09-03. A `/contact` page is seeded ONLY when
 * `agency_business_identity` holds real details to render. Otherwise nothing is
 * seeded and the header verb points at Ask, which always works and needs no
 * page.
 *
 * THE TEST IS "HAS REAL DETAILS", NOT "ROW EXISTS", and the difference is the
 * whole decision. Every workspace gets an identity row at signup. Keying on the
 * row would publish an empty "Contact" page on every new site, which is exactly
 * the placeholder that #1395 removed on the owner's call, rebuilt with extra
 * steps.
 *
 * SO WHAT COUNTS
 * ──────────────
 * A CHANNEL: an email, a phone, or a WhatsApp number. Something a visitor can
 * actually use to reach a human.
 *
 * A city, a country, a service area and social links are ENRICHMENT. They make
 * a contact page better and they cannot carry one alone: a page headed
 * "Contact" whose only content is "Tulum" and an Instagram link is a placeholder
 * with decoration, and it is worse than no page, because the nav promises a way
 * to get in touch that the page does not deliver.
 *
 * `public_name` deliberately counts for nothing. It is set on effectively every
 * workspace from the signup form, so admitting it would make this function
 * return true always and quietly restore the behaviour the owner rejected.
 *
 * Pure, no I/O, so the rule can be asserted without a database and read by both
 * the seeder and its test.
 */

/** The subset of `agency_business_identity` this rule reads. */
export type ContactDetailFields = {
  readonly contact_email?: string | null;
  readonly contact_phone?: string | null;
  readonly whatsapp?: string | null;
  readonly address_city?: string | null;
  readonly address_country?: string | null;
  readonly service_area?: string | null;
  readonly social_instagram?: string | null;
  readonly social_tiktok?: string | null;
  readonly social_facebook?: string | null;
  readonly social_linkedin?: string | null;
  readonly social_youtube?: string | null;
  readonly social_x?: string | null;
};

function filled(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * A way for a visitor to reach a human. This is the gate.
 *
 * Nothing else in the row can substitute for it, because a contact page that
 * offers no channel does not do the one job its name promises.
 */
export function hasContactChannel(identity: ContactDetailFields | null | undefined): boolean {
  if (!identity) return false;
  return (
    filled(identity.contact_email) ||
    filled(identity.contact_phone) ||
    filled(identity.whatsapp)
  );
}

/** Detail that enriches a contact page but cannot justify one on its own. */
export function hasContactEnrichment(
  identity: ContactDetailFields | null | undefined,
): boolean {
  if (!identity) return false;
  return (
    filled(identity.address_city) ||
    filled(identity.address_country) ||
    filled(identity.service_area) ||
    filled(identity.social_instagram) ||
    filled(identity.social_tiktok) ||
    filled(identity.social_facebook) ||
    filled(identity.social_linkedin) ||
    filled(identity.social_youtube) ||
    filled(identity.social_x)
  );
}

/**
 * Should this workspace get a seeded `/contact` page?
 *
 * Fails CLOSED toward "no page". A null row, a missing read, or a row of empty
 * strings all mean no page and an Ask verb in the header, which is a working
 * front door. The failure direction matters: seeding wrongly publishes an empty
 * page to the public internet, while not seeding costs a visitor nothing,
 * because the chat is always there.
 */
export function shouldSeedContactPage(
  identity: ContactDetailFields | null | undefined,
): boolean {
  return hasContactChannel(identity);
}
