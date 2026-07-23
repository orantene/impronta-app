import { renderOgCard, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/seo/og-card";

export const alt = "Resources for independent talent · Tulala";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return renderOgCard({
    kicker: "Resources",
    title: "How this business actually works.",
    subtitle: "Short, practical guides on getting booked and getting paid.",
  });
}
