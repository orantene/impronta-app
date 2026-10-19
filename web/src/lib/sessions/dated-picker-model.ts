/**
 * dated-picker-model.ts — the pure half of the "pick a date, people per tier,
 * pay" step (TUL-1344 slice 4): which state a date is in, how a seat count is
 * worded, and the step's copy in EN + ES. No I/O.
 */

export type DateState = "open" | "low" | "sold_out" | "closed" | "private";

/** At or below this many spots a date reads "few left". */
export const LOW_SPOTS = 5;

export function dateState(a: {
  seatsLeft: number | null;
  salesOpen: boolean;
  privateOnRequest: boolean;
}): DateState {
  if (a.privateOnRequest) return "private";
  if (!a.salesOpen) return "closed";
  if (a.seatsLeft == null) return "open";
  if (a.seatsLeft <= 0) return "sold_out";
  return a.seatsLeft <= LOW_SPOTS ? "low" : "open";
}

export function seatsLabel(seatsLeft: number | null, locale: string): string | null {
  if (seatsLeft == null || seatsLeft <= 0) return null;
  const es = locale.toLowerCase().startsWith("es");
  if (es) return seatsLeft === 1 ? "Queda 1 lugar" : `Quedan ${seatsLeft} lugares`;
  return seatsLeft === 1 ? "1 spot left" : `${seatsLeft} spots left`;
}

/** Where the card flow sends a guest who backs out. Same-site paths only. */
export function safeReturnPath(raw: string | undefined | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return "/";
  return raw.slice(0, 300);
}

export type DatedPickerCopy = {
  pickDate: string;
  howMany: string;
  perPerson: string;
  total: string;
  email: string;
  name: string;
  pay: string;
  payAtPlace: string;
  soldOutWaitlist: string;
  joinWaitlist: string;
  waitlistJoined: string;
  salesClosed: string;
  privateOnRequest: string;
  requestPrivate: string;
  notEnough: string;
  tierClosed: string;
  confirmed: string;
  confirmedNoEmail: string;
  viewReceipt: string;
  failed: string;
  noDates: string;
};

export const DATED_PICKER_COPY: Record<"en" | "es", DatedPickerCopy> = {
  en: {
    pickDate: "Pick a date",
    howMany: "How many people?",
    perPerson: "per person",
    total: "Total",
    email: "Your email",
    name: "Your name",
    pay: "Pay and book",
    payAtPlace: "Book and pay there",
    soldOutWaitlist: "Sold out, join the waitlist",
    joinWaitlist: "Join the waitlist",
    waitlistJoined: "You are on the waitlist. We will write to you if a spot opens.",
    salesClosed: "Sales closed for this date",
    privateOnRequest: "Private date on request",
    requestPrivate: "Ask for a private date",
    notEnough: "Not enough spots left for that many people.",
    tierClosed: "This price is not on sale right now.",
    confirmed: "Done, your spot is booked. We sent your ticket by email.",
    confirmedNoEmail: "Done, your spot is booked.",
    viewReceipt: "See your booking",
    failed: "We could not book that. Nothing was charged. Try again.",
    noDates: "No dates are open right now.",
  },
  es: {
    pickDate: "Elige una fecha",
    howMany: "¿Cuántas personas?",
    perPerson: "por persona",
    total: "Total",
    email: "Tu correo",
    name: "Tu nombre",
    pay: "Pagar y reservar",
    payAtPlace: "Reservar y pagar allá",
    soldOutWaitlist: "Agotado, únete a la lista de espera",
    joinWaitlist: "Unirme a la lista de espera",
    waitlistJoined: "Estás en la lista de espera. Te escribimos si se libera un lugar.",
    salesClosed: "Ventas cerradas para esta fecha",
    privateOnRequest: "Fecha privada a pedido",
    requestPrivate: "Pedir una fecha privada",
    notEnough: "No quedan lugares suficientes para tantas personas.",
    tierClosed: "Este precio no está a la venta ahora.",
    confirmed: "Listo, tu lugar está reservado. Te enviamos tu entrada por correo.",
    confirmedNoEmail: "Listo, tu lugar está reservado.",
    viewReceipt: "Ver tu reserva",
    failed: "No pudimos reservar. No se cobró nada. Inténtalo de nuevo.",
    noDates: "No hay fechas abiertas por ahora.",
  },
};

export function datedPickerCopy(locale: string): DatedPickerCopy {
  return locale.toLowerCase().startsWith("es") ? DATED_PICKER_COPY.es : DATED_PICKER_COPY.en;
}
