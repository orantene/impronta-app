/**
 * Spanish name + one-line description for each homepage design starter (TUL-721: the admin
 * Sitio web picker listed "Impronta agency", "SaaS product"... on a Spanish workspace).
 * Keyed by `PAGE_DESIGN_SUMMARIES[].id`; `pageDesignCopy` falls back to the English summary
 * so a new starter never renders blank.
 */
import type { PageDesignSummary } from "./summaries";

export const PAGE_DESIGN_COPY_ES: Readonly<Record<string, { label: string; description: string }>> = {
  impronta: {
    label: "Agencia Impronta",
    description:
      "Inicio oscuro y editorial para una agencia, con acento dorado, buscador de talento, disciplinas, talento destacado, mercados y llamadas a consultar.",
  },
  editorial: {
    label: "Portafolio editorial",
    description:
      "Portafolio de fotografía de un solo artista, con tipografía serif grande, portada asimétrica a sangre, tres series seleccionadas y una frase con efecto al desplazarse.",
  },
  agency: {
    label: "Agencia de producción",
    description:
      "Inicio para una agencia de producción creativa, con tipografía serif de revista, cinta de créditos, cuadrícula de talento y un desglose claro de servicios.",
  },
  saas: {
    label: "Producto digital",
    description:
      "Página de producto con portada de beneficios, tres funciones destacadas, una tarjeta de consola en vivo y una tabla de precios.",
  },
  store: {
    label: "Tienda de impresiones",
    description:
      "Tienda de impresiones de arte, con tipografía de capitales romanas, galería principal del producto, detalles de la edición, precio con botón de compra y otras impresiones.",
  },
  "store-orderable": {
    label: "Tienda y menú (con pedidos)",
    description:
      "Página sencilla de venta con nombre en Cinzel, introducción del producto y un menú en vivo con los artículos que se pueden pedir.",
  },
  festival: {
    label: "Evento en vivo",
    description:
      "Página cinematográfica para un evento en vivo, con título de carácter, cartel principal, cartelera, horario de presentaciones y llamada a comprar boletos.",
  },
  "event-launch": {
    label: "Fiesta de lanzamiento",
    description:
      "Página de una sola pantalla para vender desde el teléfono: portada a sangre, programa, tarjetas de imagen, bandas, boletos, mesa VIP, lugar y preguntas frecuentes. Oro sobre negro.",
  },
  studio: {
    label: "Estudio creativo",
    description:
      "Marca de estudio cálida y clara, con una frase principal en Fraunces, tres cosas que hacemos, trabajos seleccionados, una cita y una invitación tranquila a contactar.",
  },
  noir: {
    label: "Estudio noir",
    description:
      "Estudio creativo oscuro y dramático sobre fondo casi negro con acento dorado, frase principal grande en Fraunces, una banda cinematográfica y trabajos con brillo.",
  },
  restaurant: {
    label: "Restaurante y menú (solo vista)",
    description:
      "Página contemporánea de restaurante, con el nombre en Playfair Display sobre una foto de comida a sangre, la historia de la cocina y un menú decorativo solo para ver.",
  },
  "restaurant-orderable": {
    label: "Restaurante y menú (con pedidos)",
    description:
      "Página de restaurante con portada en Playfair Display, la historia de la cocina y un menú en vivo con los artículos que se pueden pedir.",
  },
  conference: {
    label: "Evento y conferencia",
    description:
      "Inicio moderno para una conferencia sobre azul índigo, con portada llamativa, cuadrícula de ponentes, programa y dos llamadas a comprar boletos.",
  },
  coach: {
    label: "Marca personal o coach",
    description:
      "Página de marca personal para coach o consultora, con retrato en la portada, tres servicios, testimonios y una invitación a agendar una llamada.",
  },
};

/** The name + description the admin picker shows, in the dashboard language. */
export function pageDesignCopy(
  design: Pick<PageDesignSummary, "id" | "label" | "description">,
  locale: string,
): { label: string; description: string } {
  if (locale.toLowerCase().startsWith("es")) {
    const es = PAGE_DESIGN_COPY_ES[design.id];
    if (es) return es;
  }
  return { label: design.label, description: design.description };
}
