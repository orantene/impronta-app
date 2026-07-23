import { renderOgCard, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/seo/og-card";

export const alt = "Agencia de talento que trabaja como plataforma · Tulala";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return renderOgCard({
    kicker: "Agencia de talento",
    title: "La agencia que trabaja como plataforma.",
    subtitle: "Directorio global para contratar. Sitio propio para representar talento.",
  });
}
