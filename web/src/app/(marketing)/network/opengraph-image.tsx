import { renderOgCard, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/seo/og-card";

export const alt = "The shared network · Tulala";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return renderOgCard({
    kicker: "The network",
    title: "Shared discovery that sends you work.",
    subtitle: "Get found by clients browsing across the whole Tulala network.",
  });
}
