import { renderOgCard, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/seo/og-card";

export const alt = "For staffing, casting and placement · Tulala";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return renderOgCard({
    kicker: "For staffing and casting",
    title: "Placement that scales.",
    subtitle: "Structured inquiries and a network that routes work to the right people.",
  });
}
