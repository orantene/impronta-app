import { renderOgCard, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/seo/og-card";

export const alt = "Tulala pricing · Tulala";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return renderOgCard({
    kicker: "Pricing",
    title: "Start free. Upgrade when it pays.",
    subtitle: "Transparent plans for operators, agencies, and large placement networks.",
  });
}
