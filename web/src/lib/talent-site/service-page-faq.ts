/**
 * TUL-795: FAQ on a talent service page. Pure (no DB) so render and tests share it.
 *
 * Source order: the talent's own published FAQ (`talent_faq_items`); when there is none,
 * plain Q&A derived only from fields the service already holds (duration, price, what is
 * paid at booking, free-cancel window). A missing field yields no question; nothing is invented.
 */
import { servicePageCopy, servicePriceLine, type ServicePageOffering } from "./service-page";

export type ServiceFaqItem = { question: string; answer: string };

type Copy = {
  heading: string;
  duration: string;
  price: string;
  pay: string;
  payDeposit: (pct: number) => string;
  payFull: string;
  payFree: string;
  cancel: string;
  cancelAnswer: (h: number) => string;
};

export function serviceFaqCopy(locale: string): Copy {
  return locale.toLowerCase().startsWith("en")
    ? {
        heading: "Frequently asked questions",
        duration: "How long does it take?",
        price: "How much does it cost?",
        pay: "Do I pay when I book?",
        payDeposit: (p) => `Yes, a ${p}% deposit when you book; the rest later.`,
        payFull: "Yes, the full price is paid when you book.",
        payFree: "No, booking does not require an upfront payment.",
        cancel: "Can I cancel?",
        cancelAnswer: (h) => `Free of charge up to ${h} h before the appointment.`,
      }
    : {
        heading: "Preguntas frecuentes",
        duration: "¿Cuánto dura?",
        price: "¿Cuánto cuesta?",
        pay: "¿Se paga al reservar?",
        payDeposit: (p) => `Sí, un anticipo del ${p}% al reservar; el resto después.`,
        payFull: "Sí, se paga el total al reservar.",
        payFree: "No, la reserva no requiere pago por adelantado.",
        cancel: "¿Puedo cancelar?",
        cancelAnswer: (h) => `Sin costo hasta ${h} h antes de la cita.`,
      };
}

function payAnswer(o: ServicePageOffering, c: Copy): string | null {
  if (o.bookingMode !== "instant" && o.bookingMode !== "request") return null;
  if (o.reserveMode === "deposit") return o.depositPct && o.depositPct > 0 ? c.payDeposit(o.depositPct) : null;
  if (o.reserveMode === "full") return c.payFull;
  if (o.reserveMode === "free") return c.payFree;
  return null;
}

export function serviceFaqItems(
  o: ServicePageOffering,
  talentFaq: readonly { question: string; answer: string }[],
  locale: string,
): ServiceFaqItem[] {
  const own = talentFaq
    .map((f) => ({ question: f.question.trim(), answer: f.answer.trim() }))
    .filter((f) => f.question && f.answer);
  if (own.length) return own;
  const c = serviceFaqCopy(locale);
  const price = servicePriceLine(o, locale, servicePageCopy(locale).priceFrom);
  const pay = payAnswer(o, c);
  const rows: [string, string | null][] = [
    [c.duration, o.durationMinutes && o.durationMinutes > 0 ? `${servicePageCopy(locale).minutes(o.durationMinutes)}.` : null],
    [c.price, price ? `${price}.` : null],
    [c.pay, pay],
    [c.cancel, o.cancellationHours && o.cancellationHours > 0 ? c.cancelAnswer(o.cancellationHours) : null],
  ];
  return rows.filter((r): r is [string, string] => Boolean(r[1])).map(([question, answer]) => ({ question, answer }));
}

/** FAQPage JSON-LD for exactly the items shown; null when there are none. */
export function buildServiceFaqJsonLd(items: readonly ServiceFaqItem[], canonicalUrl: string): Record<string, unknown> | null {
  if (!items.length) return null;
  return {
    "@type": "FAQPage",
    "@id": `${canonicalUrl}#faq`,
    mainEntity: items.map((i) => ({ "@type": "Question", name: i.question, acceptedAnswer: { "@type": "Answer", text: i.answer } })),
  };
}
