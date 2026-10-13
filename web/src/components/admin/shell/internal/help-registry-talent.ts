import type { HelpEntry } from "./help-registry";

/**
 * Help for the talent dashboard (app.tulala.digital/talent), which the
 * assistant had no entry for: a talent asking how to change a service price
 * was grounded on dispute, KYC and API-key entries and handed to a human.
 *
 * Kept to what the screens actually do. Sidebar names are given in both
 * languages because talent read the dashboard in Spanish.
 */
export const TALENT_HELP: Record<string, HelpEntry> = {
  "talent-services": {
    audience: "Talent",
    category: "Your services (Servicios)",
    purpose:
      "Servicios (Services) is the list of what you sell. The same services, prices and photos show on your public page, where clients book them.",
    youCanHere: [
      "Add a service, or add many at once from a price list",
      "Open a service to change its name, price, minutes, photo and how clients book it",
      "Save it as a draft, or publish it so clients can book it",
      "Preview, share, duplicate, hide or archive a service from the ⋯ menu on its row",
    ],
    ticketCategory: "Bookings & inquiries",
    faqs: [
      {
        q: "How do I change the price of a service?",
        a: "Open Servicios (Services) in the sidebar, tap the service, change Price and save. Bookings already made keep the price they were agreed at.",
      },
      {
        q: "How do I add a photo to a service?",
        a: "Open the service and use Add a photo. You can pick one from your portfolio or take one with the camera.",
      },
      {
        q: "Why can't I publish my service?",
        a: "A service needs a name, a price and its minutes before it can be published. If the price depends on the job, choose Quote each time and it only needs a name. A draft without a price shows Needs a price (Falta precio) on its row.",
      },
      {
        q: "What do Instant booking, Request to book and quote mean?",
        a: "Instant booking confirms the booking straight away. Request to book sends you the request so you confirm it first. A quoted service has no fixed price: the client asks for a quote and you reply with one.",
      },
      {
        q: "What does Missing EN (Falta EN) on a row mean?",
        a: "The service has no English name yet, so English visitors see the Spanish one. Open the service and add the English name.",
      },
      {
        q: "How do I take a service off my page without deleting it?",
        a: "Use Hide from the ⋯ menu on its row. It comes off your pages within a few minutes and nobody can book it after that. Bookings already made are untouched, and you can put it back at any time with the same link.",
      },
    ],
  },
  "talent-messages": {
    audience: "Talent",
    category: "Messages (Mensajes)",
    purpose:
      "Mensajes (Messages) is where clients write to you from your page, and where you answer, send quotes and follow up.",
    youCanHere: [
      "Read and answer client conversations",
      "Start one yourself with + New conversation",
      "Copy your page link to share it, so new conversations arrive here",
    ],
    ticketCategory: "Bookings & inquiries",
    faqs: [
      {
        q: "Why do I have no messages?",
        a: "Clients write to you from your page. Copy your link from the Messages screen and share it on Instagram, WhatsApp or wherever your clients find you.",
      },
    ],
  },
  "talent-dashboard": {
    audience: "Talent",
    category: "Talent dashboard",
    purpose:
      "Your dashboard at app.tulala.digital/talent. The sidebar has Hoy (Today), Mensajes (Messages), Calendario (Calendar), Clientes (Clients), Dinero (Money), Perfil (Profile), Mi presencia (Your presence), Servicios (Services), Reseñas (Reviews) and Ajustes (Settings).",
    youCanHere: [
      "See today's bookings and what needs you on Hoy",
      "Edit your profile and how your page looks in Perfil and Mi presencia",
      "Manage what you sell and its prices in Servicios",
      "Open Soporte (Support) at the bottom of the sidebar to ask us anything",
    ],
    ticketCategory: "General",
    faqs: [
      {
        q: "Where are my prices?",
        a: "In Servicios (Services): open the service and edit its Price.",
      },
      {
        q: "How do I see my public page?",
        a: "Use Vista previa del sitio (Site preview) at the bottom of the sidebar, or the live-site chip at the top of the screen.",
      },
    ],
  },
};
