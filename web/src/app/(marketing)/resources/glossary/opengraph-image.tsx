import { renderOgCard, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/seo/og-card";

export const alt = "Glossary of talent-commerce terms · Tulala";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return renderOgCard({
    kicker: "Glossary",
    title: "The words, in plain language.",
    subtitle: "Definitions of the terms used to book and pay talent.",
  });
}
