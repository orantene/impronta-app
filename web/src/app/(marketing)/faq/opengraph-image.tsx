import { renderOgCard, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/seo/og-card";

export const alt = "Frequently asked questions · Tulala";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return renderOgCard({
    kicker: "FAQ",
    title: "Straight answers.",
    subtitle: "How bookings, payments, plans, and your own domain actually work.",
  });
}
