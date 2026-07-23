import { renderOgCard, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/seo/og-card";

export const alt = "For agencies and representation · Tulala";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return renderOgCard({
    kicker: "For agencies",
    title: "Your roster, on your own domain.",
    subtitle: "A branded site, a real inquiry pipeline, and one place to manage people.",
  });
}
