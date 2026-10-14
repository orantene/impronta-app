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
        q: "How do I add a service?",
        a: "Open Servicios (Services) in the sidebar and tap Agregar un servicio (Add a service). To add many at once, use Agregar varios (Add many). Nothing is public until you save and publish it.",
      },
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
  "talent-hours": {
    audience: "Talent",
    category: "Your hours (Calendario)",
    purpose:
      "Your working hours decide the times clients can book with you. You set them in Calendario (Calendar).",
    youCanHere: [
      "Open Ajustes (Settings) in the sidebar and tap Horario y días libres (Working hours and days off), the first row under when you work",
      "Or open Calendario in the sidebar and tap Disponibilidad (Availability) to reach the same hours",
      "Set your weekly hours and save them",
      "Find the Horario de reservas (Booking hours) card lower on the Calendario page, with the same weekly hours",
      "Set a shortest notice and the gap after each booking in Servicios, under Valores predeterminados (Defaults)",
    ],
    ticketCategory: "Bookings & inquiries",
    faqs: [
      {
        q: "How do I change my hours or schedule?",
        a: "Open Ajustes (Settings) in the sidebar and tap Horario y días libres (Working hours and days off). Edit your weekly hours and save. You can also reach them from Calendario (Calendar), then Disponibilidad (Availability). Clients only see times inside these hours.",
      },
      {
        q: "How do I stop clients booking at certain times?",
        a: "Your weekly hours are the only times clients can book, so remove or shorten that day in Disponibilidad (Availability) and save.",
      },
      {
        q: "How do I leave a gap between bookings or require notice?",
        a: "Open Servicios (Services), then Valores predeterminados (Defaults). Under Preparación y márgenes (Preparation and gaps) set the buffer after each booking, and set Aviso mínimo que aceptas (Shortest notice you accept).",
      },
    ],
  },
  "talent-days-off": {
    audience: "Talent",
    category: "Days off (Días libres)",
    purpose:
      "Block a day or a stretch of time so nobody can book you, without changing your weekly hours.",
    youCanHere: [
      "Open Calendario (Calendar), then Disponibilidad (Availability), and find Time off and one-day hours (Días libres y horario de un día)",
      "Block a date for a holiday, travel or personal time",
      "Change the hours for a single day without touching your weekly Horario y días libres (Working hours and days off) in Ajustes (Settings)",
    ],
    ticketCategory: "Bookings & inquiries",
    faqs: [
      {
        q: "How do I block a day off or take a holiday?",
        a: "Open Calendario (Calendar), tap Disponibilidad (Availability), and use Time off and one-day hours (Días libres y horario de un día) to block the date. Clients cannot book you on blocked days. Your weekly hours in Ajustes (Settings) are unchanged.",
      },
      {
        q: "How do I work different hours on one day only?",
        a: "In Disponibilidad (Availability), use Time off and one-day hours (Días libres y horario de un día) and set the hours for that date. Other days keep your weekly Horario y días libres (Working hours and days off).",
      },
    ],
  },
  "talent-booking-changes": {
    audience: "Talent",
    category: "Rescheduling and cancelling a booking (Reservas)",
    purpose:
      "Open a booking from Calendario (Calendar) or Hoy (Today) to reschedule it, cancel it or message the client.",
    youCanHere: [
      "Open the booking and tap Reschedule (Reprogramar) to propose a new time. The client confirms it",
      "Open the booking and choose Cancel booking (Cancelar reserva). It shows what happens to the payment before anything is cancelled",
      "Use Message (Mensaje) on the booking to talk to the client first",
    ],
    ticketCategory: "Bookings & inquiries",
    faqs: [
      {
        q: "How do I cancel a booking?",
        a: "Open the booking from Calendario (Calendar) or Hoy (Today) and choose Cancel booking (Cancelar reserva). It first shows what happens to the payment, then you confirm.",
      },
      {
        q: "How do I reschedule a booking or move an appointment?",
        a: "Open the booking from Calendario (Calendar) and tap Reschedule (Reprogramar). Pick a new time. The old time is released when the client accepts. A booking can only be rescheduled once it is confirmed.",
      },
    ],
  },
  "talent-deposits": {
    audience: "Talent",
    category: "Deposits and cancelling (Servicios)",
    purpose:
      "Each service has its own rules for the deposit (anticipo) and for cancelling. They sit in the service itself, and your Valores predeterminados (Defaults) fill in anything you do not set.",
    youCanHere: [
      "Open a service in Servicios and find Reglas que usa este servicio (Rules this service uses)",
      "Choose its Anticipo (Deposit): None, 20, 25, 30 or 50 percent",
      "Choose its Cancelación (Cancelling) window: 12, 24, 48 or 72 hours",
      "Tap Usar mi predeterminado (Use my default) to go back to your defaults",
    ],
    ticketCategory: "Billing",
    faqs: [
      {
        q: "How do I charge a deposit (anticipo)?",
        a: "Open Servicios (Services), open the service, and under Reglas que usa este servicio (Rules this service uses) tap Edit on Anticipo (Deposit). Pick 20, 25, 30 or 50 percent. Pick None if the client pays everything on the day.",
      },
      {
        q: "How do I set the same deposit for all my services?",
        a: "Open Servicios (Services), then Valores predeterminados (Defaults), and set Anticipo (Deposit) there. Every service without its own deposit follows it.",
      },
      {
        q: "What happens to the deposit if the client cancels?",
        a: "Free cancellation lasts until the number of hours you chose before the booking. Inside that window the deposit is kept. Before it, the client is refunded in full.",
      },
    ],
  },
  "talent-payouts": {
    audience: "Talent",
    category: "Getting paid (Dinero and Payouts)",
    purpose:
      "Dinero (Money) shows what you have earned. The Payouts page (Depósitos) is where you connect the bank account your share of each booking is sent to.",
    youCanHere: [
      "Open Dinero (Money) in the sidebar to see your earnings",
      "On the Payouts page, tap Set up payouts (Configurar pagos), choose your country and connect your bank",
      "Tap Update bank or payout details there to change them later",
      "See payouts that need attention and the reason on the same page",
    ],
    ticketCategory: "Billing",
    faqs: [
      {
        q: "How do I set up payouts or connect my bank?",
        a: "Open the Payouts page and tap Set up payouts (Configurar pagos). Choose your country of residence, then connect your bank. Once you are set up, your share of each booking lands in your bank automatically.",
      },
      {
        q: "How do I change my bank or payout details?",
        a: "On the Payouts page tap Update bank or payout details.",
      },
      {
        q: "Why is my payout held or failed?",
        a: "A held payout is released automatically once your payout details are complete, and nothing is lost. For a failed one, check that your payout details are complete. If it stays there, contact your agency or ask us to look at it.",
      },
    ],
  },
  "talent-presence": {
    audience: "Talent",
    category: "Your page and profile (Perfil, Mi presencia)",
    purpose:
      "Perfil (Profile) holds your details and Mi presencia (Your presence) is how your public page looks. Your public page is the one clients visit to book you.",
    youCanHere: [
      "Edit your details and photos in Perfil (Profile)",
      "Change how your public page looks in Mi presencia (Your presence)",
      "See your public link in Perfil once the essentials are filled in",
      "Open Vista previa del sitio (Site preview) at the bottom of the sidebar to see the page as a client does",
    ],
    ticketCategory: "Public site & domains",
    faqs: [
      {
        q: "How do I publish my site or public page?",
        a: "Fill in the essentials in Perfil (Profile). Until then it says Not published yet, and when the essentials are in, Perfil shows the address where your page lives. Change the look in Mi presencia (Your presence). Use Vista previa del sitio (Site preview) to check it.",
      },
      {
        q: "How do I change what my page shows?",
        a: "Open Mi presencia (Your presence) in the sidebar. To pick a different design or theme, press Cambiar diseño (Change design) there. Your services and prices come from Servicios (Services), and your details and photos from Perfil (Profile).",
      },
    ],
  },
  "talent-design": {
    audience: "Talent",
    category: "Design and theme (Cambiar diseño)",
    purpose:
      "Cambiar diseño (Change design) is how you pick a different design or theme for your website. It lives in Mi presencia (My presence), on the Mi sitio web (My website) tab.",
    youCanHere: [
      "Open Mi presencia (My presence), then Mi sitio web (My website), and press Cambiar diseño (Change design) to choose a new design or theme",
      "Inside the site builder, open the Diseño (Design) panel to adjust colors, fonts and style",
    ],
    ticketCategory: "Public site & domains",
    faqs: [
      {
        q: "How do I change my design or theme?",
        a: "Open Mi presencia (My presence), go to Mi sitio web (My website) and press Cambiar diseño (Change design). In the builder you can also use the Diseño (Design) panel. Vista previa del sitio (Site preview) only shows the page, it does not change the design.",
      },
    ],
  },
  "talent-reviews": {
    audience: "Talent",
    category: "Reviews (Reseñas)",
    purpose:
      "Reseñas (Reviews) shows what clients say after working with you.",
    youCanHere: [
      "Open Reseñas (Reviews) in the sidebar to read what clients say",
      "Publish a client review so it appears on your public profile",
    ],
    ticketCategory: "General",
    faqs: [
      {
        q: "How do I show a review on my profile?",
        a: "When a client leaves a review you can publish it with Publish review. Until you publish it, it does not appear on your public profile.",
      },
    ],
  },
};
