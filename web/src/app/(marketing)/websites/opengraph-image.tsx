import { renderOgCard, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/seo/og-card";

export const alt = "A website for the place you run · Tulala";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return renderOgCard({
    kicker: "Website",
    title: "The website that fills tables, not just clicks.",
    subtitle: "Your own domain, both languages, requests and deposits. $12 a month.",
  });
}
