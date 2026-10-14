/**
 * llms.txt for the marketing host (TUL-589). Every sentence is lifted from
 * copy already published on tulala.digital (the /about page and the hero and
 * pricing pages); nothing here is a new claim. Pure so it is unit-testable.
 */

export function buildLlmsTxt(base: URL): string {
  const u = (path: string) => new URL(path, base).toString();
  return [
    "# Tulala",
    "",
    "> Tulala is the commerce platform for talent: a branded storefront, structured bookings, and payment in the chat.",
    "",
    "Sell what you do, not what you ship.",
    "",
    "## What Tulala builds",
    "",
    "- Storefront: your own site, your own layout, no code required, built with the page builder. Free on a Tulala subdomain to start; your own domain on a paid plan.",
    "- Booking messenger: every inquiry becomes a conversation with a priced offer, a confirmed booking, and payment inside the same thread.",
    "- Discovery network: an opt-in shared directory, turned on per profile.",
    "",
    "## Who it is for",
    "",
    "- Independent talent: solo operators and small studios.",
    "- Agencies and studios: multi-seat teams running a branded roster and a shared pipeline.",
    "- Staffing networks and hubs: casting, staffing, and placement operations.",
    "",
    "## Pages",
    "",
    `- [About](${u("/about")})`,
    `- [How it works](${u("/how-it-works")})`,
    `- [Pricing](${u("/pricing")})`,
    `- [FAQ](${u("/faq")})`,
    `- [For independent talent](${u("/operators")})`,
    `- [For agencies](${u("/agencies")})`,
    `- [For staffing networks and hubs](${u("/organizations")})`,
    `- [Network](${u("/network")})`,
    `- [Support](${u("/support")})`,
    `- [Contact](${u("/contact")})`,
    "",
  ].join("\n");
}
