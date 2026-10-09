import type { CopyRow } from "./section-template-copy-rows";

/**
 * TUL-80 gaps: placeholder copy for registry section embeds (FAQ, CTA, gallery
 * strip) and the section library defaults, keyed by the authored agency
 * English. Same shape and same pass as section-template-copy-rows.ts. A solo
 * talent speaks as "I", a business as "we". No em dashes in user copy.
 */
function row(
  key: string,
  agencyEs: string,
  talent: [string, string],
  business: [string, string] = talent,
): [string, CopyRow] {
  return [
    key,
    {
      agency: { en: key, es: agencyEs },
      talent: { en: talent[0], es: talent[1] },
      business: { en: business[0], es: business[1] },
    },
  ];
}

const SERVICES_Q: [string, string] = ["What do you offer?", "¿Qué ofreces?"];

export const EMBED_ROWS: ReadonlyArray<[string, CopyRow]> = [
  row(
    "Everything you need to know about working with us.",
    "Todo lo que necesitas saber para trabajar con nosotros.",
    ["Everything you need to know about working with me.", "Todo lo que necesitas saber para trabajar conmigo."],
    ["Everything you need to know about working with us.", "Todo lo que necesitas saber para trabajar con nosotros."],
  ),
  row("How do I start an inquiry?", "¿Cómo inicio una consulta?", ["How do I get in touch?", "¿Cómo me pongo en contacto?"]),
  row(
    "Browse our directory and click 'Start inquiry' on any talent profile, or contact us directly and we'll match you with the right fit for your brief.",
    "Explora nuestro directorio y haz clic en 'Iniciar consulta' en cualquier perfil de talento, o contáctanos directamente y te propondremos la opción ideal para tu brief.",
    ["Send me a message with the details and I will reply personally.", "Envíame un mensaje con los detalles y te responderé personalmente."],
    ["Send us a message with the details and we will reply personally.", "Envíanos un mensaje con los detalles y te responderemos personalmente."],
  ),
  row("What types of talent do you represent?", "¿Qué tipos de talento representan?", SERVICES_Q, ["What do you offer?", "¿Qué ofrecen?"]),
  row(
    "We represent models, chefs, musicians, photographers, and creative professionals across a wide range of disciplines and markets.",
    "Representamos modelos, chefs, músicos, fotógrafos y profesionales creativos de muchas disciplinas y mercados.",
    ["Describe your services here so clients know what to expect.", "Describe aquí tus servicios para que tus clientes sepan qué esperar."],
  ),
  row("How are rates determined?", "¿Cómo se determinan las tarifas?", ["How much does it cost?", "¿Cuánto cuesta?"]),
  row(
    "Rates vary by talent, project scope, usage rights, and market. We provide a detailed quote after reviewing your brief — no surprises.",
    "Las tarifas varían según el talento, el alcance del proyecto, los derechos de uso y el mercado. Enviamos una cotización detallada tras revisar tu brief, sin sorpresas.",
    ["Add your prices or explain how you quote, so there are no surprises.", "Agrega tus precios o explica cómo cotizas, para que no haya sorpresas."],
  ),
  row("Do you work internationally?", "¿Trabajan a nivel internacional?", ["Where do you work?", "¿Dónde trabajas?"], ["Where do you work?", "¿Dónde trabajan?"]),
  row(
    "Yes. We have active rosters across multiple markets and can source and coordinate talent for projects worldwide.",
    "Sí. Contamos con rosters activos en varios mercados y podemos coordinar talento para proyectos en todo el mundo.",
    ["Tell clients which areas you serve and whether you travel.", "Cuéntales a tus clientes qué zonas atiendes y si te desplazas."],
  ),
  // CTA embed preset.
  row("Let's create something together", "Creemos algo juntos", ["Let's create something together", "Creemos algo juntos"]),
  row(
    "Tell us about your project and we'll match you with the right talent.",
    "Cuéntanos sobre tu proyecto y te propondremos al talento ideal.",
    ["Tell us about your project and we will reply personally.", "Cuéntanos sobre tu proyecto y te responderemos personalmente."],
  ),
  // Gallery strip embed preset.
  row(
    "Replace these with your agency's own editorial photography.",
    "Reemplaza estas imágenes con la fotografía editorial de tu agencia.",
    ["Replace these with your own photos.", "Reemplaza estas imágenes con tus propias fotos."],
  ),
];
