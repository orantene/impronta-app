/**
 * Spanish for the rail's own labels.
 *
 * WHY THIS IS NOT IN dashboard-i18n.ts. That file is grandfathered past
 * eslint's `max-lines` cap and held only by the size ratchet, and every feature
 * adding "just a few strings" is how it reached three and a half thousand
 * lines. `dashboard-i18n-links.ts` made the same call for the QR & Links
 * strings and said so in as many words; this is the same call for the rail's.
 *
 * WHY IT RE-EXPORTS THE LINKS TABLE. A second import and a second spread in
 * `dashboard-i18n.ts` would be two more lines on the file this module exists to
 * stop growing. Folding the links table in here keeps that file at exactly one
 * import and one spread, so a third rail label costs it nothing at all.
 *
 * Every label `lib/workspace/destinations.ts` can draw needs a row somewhere in
 * this chain: the rail renders English literals through `copy.t()`, which is
 * keyed by the English string, so a missing row renders in English on a Spanish
 * workspace and nothing else notices. `rail-visible-pages.static.test.ts` is
 * what says so, and it reads this module as well as the inline table.
 */

import { LINKS_ES_TEXT } from "./dashboard-i18n-links";

export const RAIL_ES_TEXT: Record<string, string> = {
  ...LINKS_ES_TEXT,
  // The four Appointments sub-views (W39). They are tabs of one route, but the
  // rail draws them as rows, so each needs its own literal. "Appointments" is
  // both the destination label and its landing child, and already has a row in
  // the inline table.
  "Sessions": "Sesiones",
  "Series": "Series",
  "Waitlist": "Lista de espera",
  // The People sub-views (W27): tabs of one route, rows in the rail. "Talent",
  // "Bookable" and "Everyone" already have rows in the inline table.
  "Access": "Acceso",
  // The approved navigation (W36, 2026-09-09): three destinations and two
  // group headings carry the board's own words, and two rows became children.
  "Appointments & Classes": "Citas y clases",
  "Events & Tickets": "Eventos y entradas",
  "Spaces & Resources": "Espacios y recursos",
  "Sell & manage": "Vender y gestionar",
  "Relationships": "Relaciones",
  "All orders": "Todos los pedidos",
  "Items": "Artículos",
  // The Catalog's other children (W01, W07, W09).
  "Menu structure": "Estructura del menú",
  "Passes & cards": "Pases y tarjetas",
  // The foot of a staff rail, where Settings would be (W38).
  "Setup is owner-only · ask the owner": "La configuración es solo del propietario · pídesela",
  // The tagline under the wordmark at the head of the rail.
  "Sell what you do, not what you ship": "Vende lo que haces, no lo que envías",
  // Talent Messages + Actions: shown when no thread is open (kept out of
  // dashboard-i18n.ts — that file is at its 3968-line size-ratchet budget).
  "Pick a conversation first": "Elige una conversación primero",
  // Services Defaults — prep time + booking CTA modes (#2294). Same reason:
  // do not grow the grandfathered dashboard-i18n.ts map.
  "Preparation and gaps": "Preparación y márgenes",
  "Preparation before each booking": "Preparación antes de cada cita",
  "A 60 minute service booked at 10:00 needs prep from {prepStart}. It ends at 11:00 for the client and {end} for you.":
    "Un servicio de 60 minutos reservado a las 10:00 necesita preparación desde las {prepStart}. Termina a las 11:00 para el cliente y a las {end} para ti.",
  "Preparation blocks time before the start so the previous client cannot run into your setup. The after buffer hides the next slot that would overlap, and the notice hides anything sooner.":
    "La preparación bloquea el tiempo antes del inicio para que el cliente anterior no se meta en tu setup. El margen de después oculta el siguiente horario que se encimaría, y el aviso oculta todo lo que sea antes.",
  "How clients book": "Cómo reservan los clientes",
  "Sheet button and path": "Botón y camino de la hoja",
  "Booking mode": "Modo de reserva",
  "On-demand reservation": "Reserva al momento",
  "Contact / inquiry": "Contacto / consulta",
  "Who-step button": "Botón del paso de datos",
  "Confirm now": "Confirmar ahora",
  "Check availability": "Consultar disponibilidad",
  "After the client fills name and contact, this button opens chat with those details already filled in. It does not create a confirmed booking.":
    "Cuando el cliente completa nombre y contacto, este botón abre el chat con esos datos ya cargados. No crea una cita confirmada.",
  "After the client fills name and contact, this button confirms the appointment when the service allows instant booking.":
    "Cuando el cliente completa nombre y contacto, este botón confirma la cita si el servicio admite reserva al momento.",
};
