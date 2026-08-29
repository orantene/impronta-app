import { renderOgCard, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/seo/og-card";

export const alt = "Everything Tulala gives you";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return renderOgCard({
    kicker: "The platform",
    title: "Everything you need to sell what you do.",
    subtitle: "Website, storefront, bookings, payments, clients and real human support.",
  });
}
