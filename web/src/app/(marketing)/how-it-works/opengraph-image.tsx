import { renderOgCard, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/seo/og-card";

export const alt = "How Tulala works · Tulala";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return renderOgCard({
    kicker: "How it works",
    title: "From first inquiry to paid booking.",
    subtitle: "One flow: your storefront, the request, the offer, the booking, the payment.",
  });
}
