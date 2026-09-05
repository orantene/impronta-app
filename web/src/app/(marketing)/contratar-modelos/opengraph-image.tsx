import { renderOgCard, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/seo/og-card";

export const alt = "Contratar modelos · Tulala";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return renderOgCard({
    kicker: "Contratar modelos",
    title: "Contrata modelos para tu marca o evento.",
    subtitle: "Solicitud estructurada, oferta con precio y pago dentro del chat.",
    locale: "es",
  });
}
