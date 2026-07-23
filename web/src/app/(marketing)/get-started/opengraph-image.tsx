import { renderOgCard, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/seo/og-card";

export const alt = "Start your business, free · Tulala";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return renderOgCard({
    kicker: "Get started",
    title: "Your Business. Your Brand. Your Bookings.",
    subtitle: "Open a free page and start taking requests in minutes.",
  });
}
