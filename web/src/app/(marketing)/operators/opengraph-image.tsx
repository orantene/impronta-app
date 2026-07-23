import { renderOgCard, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/seo/og-card";

export const alt = "For independent operators · Tulala";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return renderOgCard({
    kicker: "For independent operators",
    title: "You are the business.",
    subtitle: "Run bookings, payments, and your own site without agency overhead.",
  });
}
