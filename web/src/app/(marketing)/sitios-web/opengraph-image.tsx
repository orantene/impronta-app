import { renderOgCard, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/seo/og-card";

export const alt = "Páginas web para restaurantes, cafés y estudios · Tulala";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return renderOgCard({
    kicker: "Páginas web",
    title: "La página que llena mesas, no solo clics.",
    subtitle: "Dominio propio, los dos idiomas, reservas y anticipos. 12 USD al mes.",
    strapline: "La Plataforma de Comercio para el Talento",
  });
}
