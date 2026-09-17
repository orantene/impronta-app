/**
 * ticket_picker copy + tiny formatters. Split from the island so the island
 * stays under the file cap; nothing here touches the DOM.
 */
export type Locale = "en" | "es";
export function pickLocale(raw?: string): Locale { return raw?.toLowerCase().startsWith("es") ? "es" : "en"; }
export function newOrderKey(): string {
  try { return crypto.randomUUID(); } catch {
    const r = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, "0");
    return `${r()}${r()}-${r()}-4${r().slice(1)}-a${r().slice(1)}-${r()}${r()}${r()}`;
  }
}

export const COPY: Record<Locale, Record<string, string>> = {
  en: {
    heading: "Tickets",
    night: "Pick a night",
    tier: "Pick a ticket",
    loading: "Loading tickets...",
    not_configured: "This block is not set up yet: it needs an event to sell.",
    noNights: "No night is on sale yet.",
    noTiers: "No ticket is on sale for that night yet.",
    quantity: "How many",
    decrease: "Fewer",
    increase: "More",
    email: "Email",
    emailHelp: "Your ticket goes here. If you cannot open it, we will find you by name at the door.",
    emailPlaceholder: "you@email.com",
    promo: "Promo code",
    promoPlaceholder: "If you have one",
    promo_unknown: "That code is not recognised.",
    promo_not_started: "That code is not active yet.",
    promo_expired: "That code has ended.",
    promo_exhausted: "That code has been used up.",
    promo_customer_limit: "You have already used that code.",
    promo_not_applicable: "That code does not apply to this order.",
    name: "Name",
    namePlaceholder: "Your name",
    buy: "Buy with card",
    buyFree: "Get your ticket",
    free: "Free",
    admits: "admits {n}",
    payHow: "How will you pay",
    payCard: "Card now",
    payDoor: "At the door",
    payDoorHelp: "Your seats are held until the night ends. Pay at the door when you arrive. Offered only up to 7 days before the night.",
    holdDoor: "Holding your seats for the door...",
    heldDoor: "Your seats are held. Pay at the door when you arrive. Your receipt:",
    buying: "Holding your seats...",
    redirecting: "Taking you to payment...",
    door_opens_closer: "Paying at the door opens closer to the date.",
    door_doors_open: "Doors are open: pay at the door in person.",
    door_offered: "Paying at the door is available closer to the night.",
    sold_out: "That night just sold out at that ticket. Pick another and it is yours.",
    night_not_on_sale: "That night is no longer on sale. Pick another.",
    tier_not_on_sale: "That ticket is not on sale right now.",
    quantity_err: "That number of tickets is outside what one order can hold.",
    not_sellable: "This event is not on sale just now.",
    unavailable: "We could not load the tickets. Nothing was charged. Try again.",
    invalid_request: "Something in that did not look right. Check the details and try again.",
    engine_error: "Something went wrong at our end. Nothing was charged.",
    pay_at_door_not_yet: "Paying at the door is not available online yet. Pay by card, or at the door on the night.",
    pay_at_door_not_offered: "Paying at the door is not offered for that night.",
    emailRequired: "We need an email to send your ticket to.",
    not_found: "We could not find that order. Nothing was charged.",
    ageGate: "Age check",
    ageConfirm: "I am {n} or over",
    ageHelp: "Bring ID. Staff check at the door, and a ticket without ID is not admitted.",
    age_gate_unconfirmed: "Please confirm your age to continue.",
    age_gate_below_minimum: "This one has an age limit, so we cannot sell it to you.",
    seats: "Seats",
    holdSeats: "Hold seats",
    holdingSeats: "Holding seats...",
    heldUntil: "Held until {when}",
    seat_taken: "That seat was just taken.",
    hold_expired: "That hold ended. Pick the seats again.",
    step_tier: "Your ticket",
    step_qty: "How many",
    step_details: "Your details",
    continue: "Continue",
    back: "Back",
    total: "Total",
    openSheet: "Buy tickets",
    close: "Close",
    byInvitation: "By invitation only",
    includes: "Includes",
    each: "each",
    // v3: inline cards + stepper, order bar, checkout sheet, floating CTA
    stage_tickets: "Tickets",
    stage_details: "Details",
    stage_pay: "Payment",
    low: "Few left",
    soldOut: "Sold out",
    byLink: "Link only",
    perOrderMax: "Up to {n} per order",
    yourOrder: "Your order",
    emptyOrder: "Choose your tickets to continue.",
    subtotal: "Subtotal",
    pay: "Pay {amount}",
    payFreeOrder: "Get tickets",
    phone: "Phone (optional)",
    phonePlaceholder: "+52 998 000 0000",
    emailInvalid: "Enter a valid email so the ticket can reach you.",
    howItWorks: "Your ticket arrives by email with a QR code. Show it at the door from your phone.",
    ticketsFor: "Tickets for",
    editOrder: "Change",
    processing: "One moment...",
    heldTitle: "Your seats are held",
    scrollToTickets: "See tickets",
    holdForDoor: "Hold my seats, pay at the door",
  },
  es: {
    heading: "Entradas",
    night: "Elige una noche",
    tier: "Elige una entrada",
    loading: "Cargando entradas...",
    not_configured: "Este bloque aún no está configurado: necesita un evento para vender.",
    noNights: "Todavía no hay ninguna noche a la venta.",
    noTiers: "Todavía no hay entradas a la venta para esa noche.",
    quantity: "Cuántas",
    decrease: "Menos",
    increase: "Más",
    email: "Correo",
    emailHelp: "Tu entrada llega aquí. Si no puedes abrirla, te buscamos por tu nombre en la puerta.",
    emailPlaceholder: "tu@correo.com",
    name: "Nombre",
    namePlaceholder: "Tu nombre",
    buy: "Pagar con tarjeta",
    buyFree: "Conseguir entrada",
    free: "Gratis",
    admits: "admite {n}",
    payHow: "Cómo pagas",
    payCard: "Tarjeta ahora",
    payDoor: "En la puerta",
    payDoorHelp: "Tus lugares quedan reservados hasta que termine la noche. Pagas en la puerta al llegar. Solo hasta 7 días antes de la noche.",
    holdDoor: "Reservando tus lugares para la puerta...",
    heldDoor: "Tus lugares están reservados. Pagas en la puerta al llegar. Tu recibo:",
    buying: "Reservando tus lugares...",
    redirecting: "Llevándote al pago...",
    door_opens_closer: "Pagar en la puerta se abre más cerca de la fecha.",
    door_doors_open: "Las puertas están abiertas: paga en la puerta en persona.",
    door_offered: "Pagar en la puerta estará disponible más cerca de la noche.",
    sold_out: "Esa noche se acaba de agotar con esa entrada. Elige otra y es tuya.",
    night_not_on_sale: "Esa noche ya no está a la venta. Elige otra.",
    tier_not_on_sale: "Esa entrada no está a la venta ahora.",
    quantity_err: "Ese número de entradas está fuera de lo que admite un pedido.",
    not_sellable: "Este evento no está a la venta por ahora.",
    unavailable: "No pudimos cargar las entradas. No se cobró nada. Intenta de nuevo.",
    invalid_request: "Algo no se ve bien. Revisa los datos e intenta de nuevo.",
    engine_error: "Algo falló de nuestro lado. No se cobró nada.",
    pay_at_door_not_yet: "Pagar en la puerta aún no está disponible en línea. Paga con tarjeta, o en la puerta esa noche.",
    pay_at_door_not_offered: "Pagar en la puerta no se ofrece para esa noche.",
    promo: "Código promocional",
    promoPlaceholder: "Si tienes uno",
    promo_unknown: "Ese código no se reconoce.",
    promo_not_started: "Ese código todavía no está activo.",
    promo_expired: "Ese código ya terminó.",
    promo_exhausted: "Ese código ya se usó por completo.",
    promo_customer_limit: "Ya usaste ese código.",
    promo_not_applicable: "Ese código no aplica a este pedido.",
    emailRequired: "Necesitamos un correo para enviarte la entrada.",
    not_found: "No encontramos ese pedido. No se cobró nada.",
    ageGate: "Control de edad",
    ageConfirm: "Tengo {n} años o más",
    ageHelp: "Trae identificación. En la puerta la revisan, y sin identificación no se entra.",
    age_gate_unconfirmed: "Confirma tu edad para continuar.",
    age_gate_below_minimum: "Esta entrada tiene límite de edad, así que no te la podemos vender.",
    seats: "Asientos",
    holdSeats: "Reservar asientos",
    holdingSeats: "Reservando asientos...",
    heldUntil: "Reservado hasta {when}",
    seat_taken: "Ese asiento acaba de ocuparse.",
    hold_expired: "Esa reserva terminó. Elige los asientos de nuevo.",
    step_tier: "Tu entrada",
    step_qty: "Cuántas",
    step_details: "Tus datos",
    continue: "Continuar",
    back: "Volver",
    total: "Total",
    openSheet: "Comprar entradas",
    close: "Cerrar",
    byInvitation: "Solo por invitación",
    includes: "Incluye",
    each: "c/u",
    // v3: inline cards + stepper, order bar, checkout sheet, floating CTA
    stage_tickets: "Entradas",
    stage_details: "Datos",
    stage_pay: "Pago",
    low: "Quedan pocas",
    soldOut: "Agotado",
    byLink: "Solo con enlace",
    perOrderMax: "Hasta {n} por pedido",
    yourOrder: "Tu pedido",
    emptyOrder: "Elige tus entradas para continuar.",
    subtotal: "Subtotal",
    pay: "Pagar {amount}",
    payFreeOrder: "Conseguir entradas",
    phone: "Teléfono (opcional)",
    phonePlaceholder: "+52 998 000 0000",
    emailInvalid: "Escribe un correo válido para que te llegue la entrada.",
    howItWorks: "Tu entrada llega por correo con un código QR. La muestras en la puerta desde el teléfono.",
    ticketsFor: "Entradas para",
    editOrder: "Cambiar",
    processing: "Un momento...",
    heldTitle: "Tus lugares están reservados",
    scrollToTickets: "Ver entradas",
    holdForDoor: "Reservar y pagar en la puerta",
  },
};

export function formatWhen(iso: string, timeZone: string | null, locale: Locale): string {
  try {
    return new Intl.DateTimeFormat(locale === "es" ? "es" : "en", {
      weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false,
      ...(timeZone ? { timeZone } : {}),
    }).format(new Date(iso));
  } catch { return iso; }
}
/**
 * THE ONE money formatter for the picker: the narrow symbol ("$1,000.00")
 * with the ISO code beside it, so "$" is never ambiguous between MXN and USD
 * on one page. Cards, order bar, checkout summary and the pay button all
 * read this, so a guest sees the same "$1,000.00 MXN" everywhere (the sheet
 * used to say "1000,00 MXN" through a second, bare-locale formatter).
 * Regional locales on purpose: bare "es" formats MXN as "1000,00 $".
 */
export function priceParts(cents: number, currency: string, locale: Locale, freeLabel: string): { amount: string; code: string | null } {
  if (cents === 0) return { amount: freeLabel, code: null };
  const code = currency.toUpperCase();
  try {
    const amount = new Intl.NumberFormat(locale === "es" ? "es-MX" : "en-US", { style: "currency", currency: code, currencyDisplay: "narrowSymbol" }).format(cents / 100);
    return { amount, code };
  } catch { return { amount: (cents / 100).toFixed(2), code }; }
}
/** `priceParts` as one string: "$1,000.00 MXN", or the free label. */
export function money(cents: number, currency: string, locale: Locale, freeLabel: string): string {
  const p = priceParts(cents, currency, locale, freeLabel);
  return p.code ? `${p.amount} ${p.code}` : p.amount;
}
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

