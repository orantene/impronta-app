import { renderOgCard, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/seo/og-card";

export const alt = "About Tulala · Tulala";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return renderOgCard({
    kicker: "About",
    title: "Software for talent businesses.",
    subtitle: "A branded storefront, structured bookings, and payment in the chat.",
  });
}
