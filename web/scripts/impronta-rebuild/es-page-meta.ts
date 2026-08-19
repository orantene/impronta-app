/**
 * The Spanish head copy (title, meta title, meta description) for the pages
 * that predate the rebuild — DATA ONLY.
 *
 * Lives in its own module because two consumers need it: the one-shot
 * fix-es-page-meta.ts script that applied it to the live rows, and the
 * core-es.ts page builders that reuse the same heads so each page keeps ONE
 * Spanish voice. A script module with a top-level main() must never be the
 * import path for data — importing it would run the script.
 */

export interface EsMeta {
  title: string;
  metaTitle: string;
  metaDescription: string;
}

/**
 * Spanish head copy for the pages the rebuild has not reached yet.
 *
 * Written to match the voice of the rebuilt Spanish pages (agency-managed,
 * concrete, no marketing inflation) so the site reads as one thing while the
 * bodies catch up.
 */
export const ES_PAGE_META: Record<string, EsMeta> = {
  about: {
    title: "Acerca de Impronta",
    metaTitle: "Acerca de Impronta | Agencia de modelos y talento en Tulum",
    metaDescription:
      "Impronta es una agencia boutique de modelos y talento en Tulum y Playa del Carmen. Conocemos a cada persona que representamos y respondemos por cada reserva de principio a fin.",
  },
  contact: {
    title: "Contacto",
    metaTitle: "Contacto | Reserva talento en Tulum y la Riviera Maya",
    metaDescription:
      "Cuéntanos tu brief, tus fechas y el tipo de talento que necesitas. Un coordinador responde personalmente, normalmente en menos de 24 horas.",
  },
  "for-clients": {
    title: "Para Clientes",
    metaTitle: "Para clientes | Reserva modelos y talento en la Riviera Maya",
    metaDescription:
      "Cómo trabaja Impronta con marcas, productoras y organizadores de eventos: un brief, un coordinador y una preselección de talento verificado y disponible.",
  },
  faq: {
    title: "Preguntas Frecuentes",
    metaTitle: "Preguntas frecuentes | Reservas y representación | Impronta",
    metaDescription:
      "Respuestas sobre tarifas, disponibilidad, usos de imagen, viáticos y cómo postularse al roster de Impronta en Tulum y la Riviera Maya.",
  },
  "become-a-model": {
    title: "Conviértete en Modelo",
    metaTitle: "Postúlate como modelo o talento | Impronta, Tulum",
    metaDescription:
      "Postúlate para representación con Impronta. Si tu perfil encaja con el roster, nos conocemos en persona, construimos tu perfil profesional y te ponemos frente a briefs reales.",
  },
  studio: {
    title: "Estudio y Servicios",
    metaTitle: "Estudio y servicios de producción | Impronta, Tulum",
    metaDescription:
      "Estudio, locaciones y servicios de producción de Impronta para shoots, castings y contenido de marca en Tulum y Playa del Carmen.",
  },
  terms: {
    title: "Términos de Servicio",
    metaTitle: "Términos de servicio | Impronta",
    metaDescription:
      "Términos que rigen el uso del sitio de Impronta y las reservas de talento gestionadas por la agencia.",
  },
  privacy: {
    title: "Aviso de Privacidad",
    metaTitle: "Aviso de privacidad | Impronta",
    metaDescription:
      "Cómo Impronta recopila, usa y protege los datos personales de clientes y talento, conforme a la legislación mexicana.",
  },
  "404": {
    title: "Página no encontrada",
    metaTitle: "Página no encontrada | Impronta",
    metaDescription:
      "Esta página no existe o cambió de dirección. Explora el directorio de talento o vuelve al inicio.",
  },
};
