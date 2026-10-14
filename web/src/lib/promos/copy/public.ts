/**
 * Client-facing promo copy (design E, L6, L9). ES first, EN second.
 * Pure: shared by server renders and client islands. No em dashes.
 */

export type PublicPromoCopy = {
  off: (percent: number) => string;
  gift: (label: string | null) => string;
  left: (left: number, max: number) => string;
  /** Screen-reader line for a struck price. */
  beforeNow: (before: string, now: string) => string;
  /** Checkout summary line. */
  beforeNowSaved: (before: string, now: string, saved: string) => string;
  from: string;
  someServices: (percent: number) => string;
  codeToggle: string;
  codeLabel: string;
  codeApply: string;
  codeApplied: (code: string) => string;
  codeEnded: (code: string) => string;
  codeNotStarted: (code: string) => string;
  codeUnknown: (code: string) => string;
  codeUsedUp: (code: string) => string;
  codeNotApplicable: (code: string) => string;
  codeTryAgain: string;
  betterDeal: (deal: string, code: string) => string;
  soldOut: (regular: string) => string;
  /** Booking confirm refused because the offer ran out; nothing was charged. */
  promoGone: string;
  /** Pill when the 7-day promo link cookie applied an offer. */
  linkPill: string;
  bookAnyway: string;
  endsIn: (d: number, h: number, m: number) => string;
  subtotal: string;
  promoLine: (name: string) => string;
  free: string;
  total: string;
  saved: (amount: string) => string;
};

const ES: PublicPromoCopy = {
  off: (p) => `-${p}%`,
  gift: (l) => (l ? `Gratis: ${l}` : "Regalo incluido"),
  left: (l, m) => `Quedan ${l} de ${m}`,
  beforeNow: (b, n) => `Antes ${b}, ahora ${n}`,
  beforeNowSaved: (b, n, s) => `Antes ${b} · Ahora ${n} · Ahorras ${s}`,
  from: "Desde",
  someServices: (p) => `-${p}% en algunos servicios`,
  codeToggle: "¿Tienes un código?",
  codeLabel: "Código de descuento",
  codeApply: "Aplicar",
  codeApplied: (c) => `${c} aplicado`,
  codeEnded: (c) => `${c} ya terminó`,
  codeNotStarted: (c) => `${c} todavía no empieza`,
  codeUnknown: (c) => `No encontramos el código ${c}`,
  codeUsedUp: (c) => `${c} ya se agotó`,
  codeNotApplicable: (c) => `${c} no aplica a esta reserva`,
  codeTryAgain: "No pudimos revisar el código. Intenta de nuevo.",
  betterDeal: (d, c) => `Ya tienes una mejor oferta (${d}). Tu código ${c} no fue necesario.`,
  soldOut: (r) => `Esta oferta se acaba de agotar. El precio normal es ${r}.`,
  promoGone: "Esta oferta se acaba de agotar. No se cobró nada. Revisa el precio normal y confirma de nuevo.",
  linkPill: "Oferta de tu enlace aplicada",
  bookAnyway: "Reservar de todos modos",
  endsIn: (d, h, m) => `termina en ${d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`}`,
  subtotal: "Subtotal",
  promoLine: (n) => n,
  free: "Gratis",
  total: "Total",
  saved: (a) => `Ahorras ${a}`,
};

const EN: PublicPromoCopy = {
  off: (p) => `-${p}%`,
  gift: (l) => (l ? `Free: ${l}` : "Free gift included"),
  left: (l, m) => `${l} of ${m} left`,
  beforeNow: (b, n) => `Was ${b}, now ${n}`,
  beforeNowSaved: (b, n, s) => `Was ${b} · Now ${n} · You save ${s}`,
  from: "From",
  someServices: (p) => `-${p}% on some services`,
  codeToggle: "Have a code?",
  codeLabel: "Discount code",
  codeApply: "Apply",
  codeApplied: (c) => `${c} applied`,
  codeEnded: (c) => `${c} has ended`,
  codeNotStarted: (c) => `${c} has not started yet`,
  codeUnknown: (c) => `We could not find the code ${c}`,
  codeUsedUp: (c) => `${c} is sold out`,
  codeNotApplicable: (c) => `${c} does not apply to this booking`,
  codeTryAgain: "We could not check the code. Please try again.",
  betterDeal: (d, c) => `You're already getting a better deal (${d}). Your code ${c} wasn't needed.`,
  soldOut: (r) => `This offer just sold out. Regular price is ${r}.`,
  promoGone: "This offer just ran out. Nothing was charged. Check the regular price and confirm again.",
  linkPill: "Offer from your link applied",
  bookAnyway: "Book anyway",
  endsIn: (d, h, m) => `ends in ${d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`}`,
  subtotal: "Subtotal",
  promoLine: (n) => n,
  free: "Free",
  total: "Total",
  saved: (a) => `You save ${a}`,
};

export function publicPromoCopy(locale: string | null | undefined): PublicPromoCopy {
  return (locale ?? "").toLowerCase().startsWith("en") ? EN : ES;
}
