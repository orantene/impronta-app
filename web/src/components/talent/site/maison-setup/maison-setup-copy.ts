/** EN/ES copy for Maison Choose-a-design + Theme detail (PR4). */
export type MaisonSetupLocale = "en" | "es";

const ES: Record<string, string> = {
  "Choose a design": "Elige un diseño",
  "Your free website": "Tu sitio web gratis",
  "Find your website style": "Encuentra el estilo de tu sitio",
  "Explore designs, then see them with your photos and services.":
    "Explora diseños y míralos con tus fotos y servicios.",
  "Featured demo:": "Demo destacada:",
  "1 demo": "1 demo",
  "Explore theme →": "Explorar tema →",
  "Maison is the first Tulala design. It works for any profession: you will see it with your own photos and services before choosing.":
    "Maison es el primer diseño de Tulala. Sirve para cualquier oficio: lo verás con tus fotos y servicios antes de elegir.",
  "Designs": "Diseños",
  "Demos · 1": "Demos · 1",
  "THEME": "TEMA",
  "Demo:": "Demo:",
  "Show": "Mostrar",
  Demo: "Demo",
  "My content": "Mi contenido",
  "Demo photos, text and prices. Nothing is added to your site unless you import it.":
    "Fotos, textos y precios de demo. Nada se agrega a tu sitio salvo que importes.",
  "Your profile, services and photos in this design. Sections without content are hidden.":
    "Tu perfil, servicios y fotos en este diseño. Las secciones sin contenido se ocultan.",
  Colors: "Colores",
  "Demo colors": "Colores de la demo",
  "Use demo colors": "Usar colores de la demo",
  "Custom colors": "Colores personalizados",
  Personalise: "Personalizar",
  "Import starter content · 13 available ›": "Importar contenido inicial · 13 disponibles ›",
  "Optional. Imported items are saved as drafts.":
    "Opcional. Lo importado se guarda como borradores.",
  "Use this design": "Usar este diseño",
  Preview: "Vista previa",
  "Choices saved": "Elecciones guardadas",
  "Draft saved": "Borrador guardado",
  Live: "En vivo",
  Desktop: "Escritorio",
  Phone: "Teléfono",
  "DEMO CONTENT": "CONTENIDO DEMO",
  "Only colors change. Photos, content and layout stay.":
    "Solo cambian los colores. Fotos, contenido y diseño se quedan.",
  "About this theme": "Sobre este tema",
  "Switching demos changes sample photos, text and prices — not your saved site.":
    "Cambiar de demo cambia fotos, textos y precios de muestra — no tu sitio guardado.",
  Close: "Cerrar",
  Editorial: "Editorial",
  Warm: "Cálido",
  "Service menu": "Menú de servicios",
  "Booking-ready": "Listo para reservar",
  Portfolio: "Portafolio",
  "Import opens in a later step.": "La importación llega en un paso posterior.",
  "Apply & review land in the next release. Your choices are saved.":
    "Aplicar y revisar llegan en la siguiente versión. Tus elecciones están guardadas.",
  "Review your website": "Revisa tu sitio",
  "Ready to publish": "Listo para publicar",
  "1 thing before publishing": "1 cosa antes de publicar",
  Publish: "Publicar",
  "Publishing…": "Publicando…",
  Undo: "Deshacer",
  "Design applied to your draft": "Diseño aplicado a tu borrador",
  "Nothing is public until you publish. After publishing you can change the design at any time.":
    "Nada es público hasta que publiques. Después puedes cambiar el diseño cuando quieras.",
  "My website": "Mi sitio web",
  "View website": "Ver sitio",
  "Change design": "Cambiar diseño",
  "Design options": "Opciones de diseño",
  "Design options open in a later step.":
    "Las opciones de diseño llegan en un paso posterior.",
  "Your website is live": "Tu sitio ya está en vivo",
  "Could not publish. Try again.": "No se pudo publicar. Inténtalo de nuevo.",
  "Try again": "Intentar de nuevo",
  Address: "Dirección",
  Design: "Diseño",
  "No trial, plan, or price in this flow.": "Sin prueba, plan ni precio en este flujo.",
};

export function maisonSetupT(locale: MaisonSetupLocale, key: string): string {
  if (locale === "es") return ES[key] ?? key;
  return key;
}

export function tagLabel(locale: MaisonSetupLocale, key: string): string {
  const map: Record<string, { en: string; es: string }> = {
    editorial: { en: "Editorial", es: "Editorial" },
    warm: { en: "Warm", es: "Cálido" },
    menu: { en: "Service menu", es: "Menú de servicios" },
    booking: { en: "Booking-ready", es: "Listo para reservar" },
    portfolio: { en: "Portfolio", es: "Portafolio" },
  };
  const row = map[key];
  if (!row) return key;
  return locale === "es" ? row.es : row.en;
}
