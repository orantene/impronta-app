/**
 * copy.ts — the shared ES/EN copy every Look ships by default, plus the
 * business-component labels and empty states.
 *
 * RULES (docs/plans/templates/01-plan.md §1.3, §2)
 *  - No business-type word in `LOOK_COPY_DEFAULTS` (a static test scans it).
 *  - No fact: no hours, prices, addresses, awards, reviews. Identity comes in
 *    through `{{business.name}}` / `{{business.city}}` / `{{business.tagline}}`,
 *    and `[[ … ]]` groups vanish when the fact is missing.
 *  - Spanish first: ES is the design language of the market; EN rides along.
 *  - No em dashes in user-facing copy.
 *
 * A Look may override any key in its own `copy` to carry its voice; the
 * composer's model pass may override any key with copy written from facts.
 */

import type { Bilingual } from "./types";

export const LOOK_COPY_DEFAULTS: Readonly<Record<string, Bilingual>> = {
  // ── Navigation / actions ────────────────────────────────────────────────
  "nav.home": { es: "Inicio", en: "Home" },
  "nav.catalogue": { es: "Lo que ofrecemos", en: "What we offer" },
  "nav.transaction": { es: "Agenda", en: "Book" },
  "nav.about": { es: "Nosotros", en: "About" },
  "nav.contact": { es: "Contacto", en: "Contact" },
  "nav.gallery": { es: "Galería", en: "Gallery" },
  "nav.menuLabel": { es: "Navegación", en: "Navigation" },
  "action.primary": { es: "Escríbenos", en: "Get in touch" },
  "action.secondary": { es: "Cómo llegar", en: "Find us" },
  "action.whatsapp": { es: "Escríbenos por WhatsApp", en: "Message us on WhatsApp" },
  "action.gallery": { es: "Ver la galería", en: "See the gallery" },
  "action.about": { es: "Conócenos", en: "Meet us" },

  // ── Home ────────────────────────────────────────────────────────────────
  "home.hero.eyebrow": { es: "[[{{business.city}}]]", en: "[[{{business.city}}]]" },
  "home.hero.headline": { es: "{{business.name}}", en: "{{business.name}}" },
  "home.hero.sub": { es: "[[{{business.tagline}}]]", en: "[[{{business.tagline}}]]" },
  // Ships when there is no tagline: an invitation, not a claim.
  "home.hero.sub.fallback": { es: "Con gusto te atendemos. Escríbenos o ven a vernos.", en: "We would be glad to see you. Write to us or come by." },
  "home.offer.eyebrow": { es: "Lo que hacemos", en: "What we do" },
  "home.offer.headline": { es: "Hecho con cuidado, para ti", en: "Done with care, for you" },
  "home.offer.body": {
    es: "Conócenos en persona[[ en {{business.city}}]] o escríbenos y te contamos cómo trabajamos.",
    en: "Come and see us[[ in {{business.city}}]] or write to us and we will tell you how we work.",
  },
  "home.proof.eyebrow": { es: "Por qué nosotros", en: "Why us" },
  "home.gallery.eyebrow": { es: "Un vistazo", en: "A glimpse" },
  "home.gallery.headline": { es: "Así se ve {{business.name}}", en: "This is {{business.name}}" },
  "home.closing.headline": { es: "¿Hablamos?", en: "Shall we talk?" },
  "home.closing.body": {
    es: "Escríbenos o visítanos[[ en {{business.city}}]]. Te respondemos en persona.",
    en: "Write to us or visit us[[ in {{business.city}}]]. A real person answers.",
  },

  // ── Catalogue ───────────────────────────────────────────────────────────
  "catalogue.eyebrow": { es: "{{business.name}}", en: "{{business.name}}" },
  "catalogue.headline": { es: "Lo que ofrecemos", en: "What we offer" },
  "catalogue.intro": { es: "Todo lo que hacemos, en un solo lugar.", en: "Everything we do, in one place." },

  // ── Transaction ─────────────────────────────────────────────────────────
  "transaction.eyebrow": { es: "{{business.name}}", en: "{{business.name}}" },
  "transaction.headline": { es: "Agenda o pregunta", en: "Book or ask" },
  "transaction.intro": { es: "Elige lo que necesitas y te confirmamos.", en: "Choose what you need and we confirm." },

  // ── About ───────────────────────────────────────────────────────────────
  "about.eyebrow": { es: "Nosotros", en: "About" },
  "about.headline": { es: "La historia de {{business.name}}", en: "The story of {{business.name}}" },
  "about.body": {
    es: "{{business.name}} es un proyecto hecho con oficio[[ en {{business.city}}]]. Nos gusta hacer las cosas bien y tratar a cada persona por su nombre.",
    en: "{{business.name}} is a project built on craft[[ in {{business.city}}]]. We like doing things properly and calling every person by their name.",
  },
  "about.body2": {
    es: "[[{{business.tagline}}]]",
    en: "[[{{business.tagline}}]]",
  },

  // ── Contact ─────────────────────────────────────────────────────────────
  "contact.eyebrow": { es: "Contacto", en: "Contact" },
  "contact.headline": { es: "Ven a vernos o escríbenos", en: "Visit us or write to us" },
  "contact.intro": {
    es: "Escríbenos[[ o visítanos en {{business.city}}]]. Te responde una persona.",
    en: "Write to us[[ or visit us in {{business.city}}]]. A real person answers.",
  },
  "contact.hours.title": { es: "Horario", en: "Hours" },
  "contact.map.title": { es: "Cómo llegar", en: "How to get here" },
  "contact.socials.title": { es: "Síguenos", en: "Follow us" },

  // ── Gallery ─────────────────────────────────────────────────────────────
  "gallery.eyebrow": { es: "Galería", en: "Gallery" },
  "gallery.headline": { es: "Un vistazo a {{business.name}}", en: "A look at {{business.name}}" },

  // ── Footer ──────────────────────────────────────────────────────────────
  "footer.rights": { es: "© {{business.name}}", en: "© {{business.name}}" },
  "footer.tagline": { es: "[[{{business.tagline}}]]", en: "[[{{business.tagline}}]]" },
};

// ── Business components ───────────────────────────────────────────────────

export const COMPONENT_LABELS: Readonly<Record<string, Bilingual>> = {
  menu: { es: "Menú", en: "Menu" },
  reserve: { es: "Reservar mesa", en: "Reserve a table" },
  classes: { es: "Clases y sesiones", en: "Classes and sessions" },
  tickets: { es: "Boletos", en: "Tickets" },
  roster: { es: "Nuestro talento", en: "Our talent" },
  team: { es: "El equipo", en: "The team" },
  services: { es: "Servicios", en: "Services" },
  book: { es: "Agenda una cita", en: "Book an appointment" },
  order: { es: "Haz tu pedido", en: "Place an order" },
  bookSubmit: { es: "Enviar solicitud", en: "Send request" },
  fieldName: { es: "Tu nombre", en: "Your name" },
  fieldPhone: { es: "Teléfono o WhatsApp", en: "Phone or WhatsApp" },
  fieldEmail: { es: "Correo", en: "Email" },
  fieldDate: { es: "Fecha preferida", en: "Preferred date" },
  fieldMessage: { es: "¿Qué necesitas?", en: "What do you need?" },
  hours: { es: "Horario", en: "Hours" },
  whereWeAre: { es: "Dónde estamos", en: "Where we are" },
  orderWhatsapp: { es: "Pedir por WhatsApp", en: "Order on WhatsApp" },
  askWhatsapp: { es: "Preguntar por WhatsApp", en: "Ask on WhatsApp" },
  gallery: { es: "Galería", en: "Gallery" },
  teamSize: { es: "Somos un equipo de {{count}} personas.", en: "We are a team of {{count}} people." },
  yearsLabel: { es: "años de experiencia", en: "years of experience" },
  goToBooking: { es: "Ir a la agenda", en: "Go to booking" },
};

/** One honest line per component when the facts are missing. Never a sample row. */
export const COMPONENT_EMPTY_STATES: Readonly<Record<string, Bilingual>> = {
  menu_board: { es: "El menú aún no está publicado.", en: "Menu items are not published yet." },
  reserve_table: { es: "Las reservas abren pronto. Escríbenos mientras tanto.", en: "Reservations open soon. Write to us in the meantime." },
  session_picker: { es: "Las clases aún no están publicadas.", en: "Classes are not published yet." },
  ticket_picker: { es: "Aún no hay boletos a la venta.", en: "No tickets on sale yet." },
  directory: { es: "Los perfiles aún no están publicados.", en: "Profiles are not published yet." },
  team: { es: "", en: "" },
  service_list: { es: "Los servicios aún no están publicados.", en: "Services are not published yet." },
  booking_form: { es: "", en: "" },
  location_hours: { es: "El horario aún no está publicado.", en: "Hours are not published yet." },
  whatsapp_order: { es: "", en: "" },
  gallery: { es: "", en: "" },
  proof: { es: "", en: "" },
};
