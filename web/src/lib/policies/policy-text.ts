/**
 * Talent / agency policy page text generator (pure, no IO).
 *
 * Builds the booking policy and the privacy notice served on talent and agency
 * hosts at `/policies/booking` and `/policies/privacy`. The booking text is
 * generated from the canonical resolved settings (`resolveCommercialTerms`),
 * never hand-written per talent.
 *
 * Working defaults (owner decision 2026-09-30):
 *  - Tulala collects card payments on the talent's behalf through Stripe; the
 *    talent provides the service. We never say the talent is merchant of record.
 *  - The refund PRESET decides the refund amount; Tulala executes it.
 *  - No separate customer booking fee at launch (not mentioned).
 *  - Retention: unbooked inquiries 24 months after last activity, bookings and
 *    payments 5 years, guest data 12 months.
 *
 * Copy rules: plain language, no em dashes. Never exposes a legal name or a
 * private address: the only identity used is the public display name.
 */

import type { RefundPolicyKey } from "@/lib/billing/commercial-terms-types";

export type PolicyLocale = "en" | "es";

export function toPolicyLocale(locale: string | null | undefined): PolicyLocale {
  return (locale ?? "").toLowerCase().startsWith("es") ? "es" : "en";
}

export type PolicySection = {
  id: string;
  heading: string;
  paragraphs: string[];
  bullets?: string[];
};

export type PolicyDocument = {
  title: string;
  intro: string;
  sections: PolicySection[];
};

/** A per-offering override from `booking_policy_overrides` (already resolved to a label). */
export type PolicyOverride = {
  label: string;
  depositPct: number | null;
  cancelFreeHours: number | null;
  noShowFeeCents: number | null;
  currency: string;
};

export type BookingPolicyInput = {
  locale: PolicyLocale;
  /** Public display name of the talent or agency. */
  name: string;
  depositPct: number;
  refundPolicy: RefundPolicyKey;
  /** Instant / direct booking is available. */
  instantBookEnabled: boolean;
  /** The talent accepts cash or transfer in person for at least one service. */
  acceptsPayInPerson: boolean;
  overrides: PolicyOverride[];
};

type RefundCopy = { label: string; body: string };

const REFUND_COPY: Record<PolicyLocale, Record<RefundPolicyKey, RefundCopy>> = {
  en: {
    tiered: {
      label: "Tiered",
      body: "Cancel 14 or more days before the booking for a full refund. Cancel 7 to 14 days before for a 50% refund. Cancel less than 7 days before and nothing is refunded. Any deposit is not refundable.",
    },
    flexible: {
      label: "Flexible",
      body: "Cancel up to 48 hours before the booking for a full refund. After that, nothing is refunded.",
    },
    strict: {
      label: "Strict",
      body: "Any deposit is not refundable. For the rest of the payment, 50% is refunded when you cancel less than 30 days but at least 7 days before the booking. Under 7 days, nothing is refunded.",
    },
    manual: {
      label: "Case by case",
      body: "Refunds are reviewed one by one. Write to us through the site and we will agree on a fair outcome.",
    },
  },
  es: {
    tiered: {
      label: "Escalonada",
      body: "Si cancelas con 14 o más días de anticipación, se reembolsa todo. Con 7 a 14 días, se reembolsa el 50%. Con menos de 7 días no hay reembolso. El anticipo, si lo hay, no es reembolsable.",
    },
    flexible: {
      label: "Flexible",
      body: "Si cancelas hasta 48 horas antes de la reserva, se reembolsa todo. Después de ese plazo no hay reembolso.",
    },
    strict: {
      label: "Estricta",
      body: "El anticipo, si lo hay, no es reembolsable. Del resto del pago se reembolsa el 50% si cancelas con menos de 30 días pero al menos 7 días antes de la reserva. Con menos de 7 días no hay reembolso.",
    },
    manual: {
      label: "Caso por caso",
      body: "Los reembolsos se revisan uno por uno. Escríbenos desde el sitio y acordaremos un resultado justo.",
    },
  },
};

export function refundPresetCopy(locale: PolicyLocale, key: RefundPolicyKey): RefundCopy {
  return REFUND_COPY[locale][key];
}

function money(locale: PolicyLocale, cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat(locale === "es" ? "es-MX" : "en-US", {
      style: "currency",
      currency: currency || "USD",
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

function pct(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export function hasOverrideContent(o: PolicyOverride): boolean {
  return (
    o.depositPct != null ||
    o.cancelFreeHours != null ||
    (o.noShowFeeCents != null && o.noShowFeeCents > 0)
  );
}

function overrideBullet(locale: PolicyLocale, o: PolicyOverride): string {
  const parts: string[] = [];
  if (locale === "es") {
    if (o.depositPct != null) parts.push(`anticipo del ${pct(o.depositPct)}%`);
    if (o.cancelFreeHours != null) {
      parts.push(`cancelación sin costo hasta ${o.cancelFreeHours} horas antes`);
    }
    if (o.noShowFeeCents != null && o.noShowFeeCents > 0) {
      parts.push(`cargo por inasistencia de ${money(locale, o.noShowFeeCents, o.currency)}`);
    }
  } else {
    if (o.depositPct != null) parts.push(`${pct(o.depositPct)}% deposit`);
    if (o.cancelFreeHours != null) {
      parts.push(`free cancellation up to ${o.cancelFreeHours} hours before`);
    }
    if (o.noShowFeeCents != null && o.noShowFeeCents > 0) {
      parts.push(`${money(locale, o.noShowFeeCents, o.currency)} no-show fee`);
    }
  }
  return `${o.label}: ${parts.join(", ")}`;
}

export function buildBookingPolicy(input: BookingPolicyInput): PolicyDocument {
  const { locale, name } = input;
  const es = locale === "es";
  const refund = REFUND_COPY[locale][input.refundPolicy];
  const sections: PolicySection[] = [];

  const dep = input.depositPct;
  sections.push({
    id: "deposit",
    heading: es ? "Anticipo y pago" : "Deposit and payment",
    paragraphs: [
      dep <= 0
        ? es
          ? `${name} no pide anticipo al reservar. El pago se acuerda en la conversación o en el momento del servicio.`
          : `${name} does not ask for a deposit when you book. Payment is agreed in your conversation or at the time of the service.`
        : dep >= 100
          ? es
            ? `${name} pide el pago completo por adelantado para confirmar la reserva.`
            : `${name} asks for the full payment up front to confirm the booking.`
          : es
            ? `${name} pide un anticipo del ${pct(dep)}% para confirmar la reserva. El resto se paga como se acuerde en tu oferta.`
            : `${name} asks for a ${pct(dep)}% deposit to confirm the booking. The rest is paid as agreed in your offer.`,
    ],
  });

  const methodBullets = [
    es
      ? "Tarjeta: Tulala cobra el pago en nombre de este profesional a través de Stripe. El servicio lo presta el profesional, no Tulala."
      : "Card: Tulala collects the payment on this professional's behalf through Stripe. The service is provided by the professional, not by Tulala.",
  ];
  if (input.acceptsPayInPerson) {
    methodBullets.push(
      es
        ? "Efectivo o transferencia: disponible en los servicios que lo permiten, pagando directamente en persona."
        : "Cash or transfer: available for the services that allow it, paid directly in person.",
    );
  }
  sections.push({
    id: "payment-methods",
    heading: es ? "Formas de pago" : "How you can pay",
    paragraphs: [],
    bullets: methodBullets,
  });

  sections.push({
    id: "booking-mode",
    heading: es ? "Cómo se confirma una reserva" : "How a booking is confirmed",
    paragraphs: [
      input.instantBookEnabled
        ? es
          ? `Algunos servicios de ${name} se pueden reservar al instante. Los demás empiezan con una consulta y ${name} los confirma.`
          : `Some of ${name}'s services can be booked instantly. The rest start with an inquiry and ${name} confirms them.`
        : es
          ? `Las reservas con ${name} empiezan con una consulta. Tu reserva queda confirmada cuando ${name} la acepta.`
          : `Bookings with ${name} start with an inquiry. Your booking is confirmed once ${name} accepts it.`,
    ],
  });

  sections.push({
    id: "refunds",
    heading: es ? "Cancelaciones y reembolsos" : "Cancellations and refunds",
    paragraphs: [
      es ? `Política de ${name}: ${refund.label}.` : `${name}'s policy: ${refund.label}.`,
      refund.body,
      es
        ? "Tulala procesa los reembolsos que correspondan según esta política."
        : "Tulala processes any refund that is due under this policy.",
    ],
  });

  const overrideBullets = input.overrides
    .filter(hasOverrideContent)
    .map((o) => overrideBullet(locale, o));
  if (overrideBullets.length > 0) {
    sections.push({
      id: "service-terms",
      heading: es ? "Condiciones por servicio" : "Terms for specific services",
      paragraphs: [
        es
          ? "Estos servicios tienen condiciones propias que reemplazan lo anterior:"
          : "These services have their own terms, which replace the above:",
      ],
      bullets: overrideBullets,
    });
  }

  return {
    title: es ? "Política de reservas" : "Booking policy",
    intro: es
      ? `Esto es lo que debes saber antes de reservar con ${name}.`
      : `What to know before you book with ${name}.`,
    sections,
  };
}

export type PrivacyNoticeInput = {
  locale: PolicyLocale;
  name: string;
};

export function buildPrivacyNotice(input: PrivacyNoticeInput): PolicyDocument {
  const { locale, name } = input;
  const es = locale === "es";
  return {
    title: es ? "Aviso de privacidad" : "Privacy notice",
    intro: es
      ? `Cómo se usan tus datos cuando te comunicas con ${name} a través de este sitio.`
      : `How your information is used when you contact ${name} through this site.`,
    sections: [
      {
        id: "who",
        heading: es ? "Quién recibe tus datos" : "Who receives your information",
        paragraphs: [
          es
            ? `${name} recibe tu consulta: tu nombre, tus datos de contacto, los detalles de tu evento o reserva y tus mensajes. Tulala aloja este sitio y procesa esos datos en nombre de ${name} para que la conversación, la reserva y el pago funcionen.`
            : `${name} receives your inquiry: your name, contact details, the details of your event or booking, and your messages. Tulala hosts this site and processes that information on behalf of ${name} so the conversation, booking and payment work.`,
        ],
      },
      {
        id: "why",
        heading: es ? "Para qué se usan" : "What it is used for",
        paragraphs: [],
        bullets: es
          ? [
              "Responder a tu consulta y gestionar tu reserva.",
              "Cobrar pagos y emitir reembolsos a través de Tulala y Stripe.",
              "Mantener el sitio seguro y evitar abusos.",
            ]
          : [
              "Replying to your inquiry and managing your booking.",
              "Collecting payments and issuing refunds through Tulala and Stripe.",
              "Keeping the site secure and preventing abuse.",
            ],
      },
      {
        id: "retention",
        heading: es ? "Cuánto tiempo se guardan" : "How long it is kept",
        paragraphs: [],
        bullets: es
          ? [
              "Consultas y mensajes sin reserva: 24 meses después de la última actividad.",
              "Reservas y pagos: 5 años.",
              "Datos de invitado: 12 meses.",
            ]
          : [
              "Inquiries and messages that did not become a booking: 24 months after the last activity.",
              "Bookings and payments: 5 years.",
              "Guest data: 12 months.",
            ],
      },
      {
        id: "choices",
        heading: es ? "Cookies y tus opciones" : "Cookies and your choices",
        paragraphs: [
          es
            ? "El análisis del sitio solo se activa si lo aceptas. Puedes cambiar tu decisión en cualquier momento con el enlace Opciones de privacidad al pie de la página."
            : "Site analytics only run if you accept them. You can change your decision at any time with the Privacy choices link in the page footer.",
        ],
      },
      {
        id: "contact",
        heading: es ? "Cómo contactar" : "How to get in touch",
        paragraphs: [
          es
            ? `Para consultar, corregir o pedir la eliminación de tus datos, escríbele a ${name} desde este sitio. Tulala también atiende estas solicitudes a través de su política de privacidad.`
            : `To ask about, correct or delete your information, write to ${name} from this site. Tulala also handles these requests through its own privacy policy.`,
        ],
      },
    ],
  };
}

export type TulalaPolicyLinks = {
  termsUrl: string;
  privacyUrl: string;
  cookiesUrl: string;
};

/** Tulala platform legal pages, always on the marketing host. */
export function tulalaPolicyLinks(siteUrl: string): TulalaPolicyLinks {
  const base = siteUrl.replace(/\/$/, "");
  return {
    termsUrl: `${base}/legal/terms`,
    privacyUrl: `${base}/legal/privacy`,
    cookiesUrl: `${base}/legal/cookies`,
  };
}

/** Chrome copy for the policy pages. */
export const POLICY_CHROME: Record<
  PolicyLocale,
  {
    paymentsLine: string;
    tulalaTerms: string;
    tulalaPrivacy: string;
    tulalaCookies: string;
    bookingPolicy: string;
    privacyNotice: string;
  }
> = {
  en: {
    paymentsLine: "Payments processed by Tulala",
    tulalaTerms: "Tulala platform terms",
    tulalaPrivacy: "Tulala privacy policy",
    tulalaCookies: "Cookies",
    bookingPolicy: "Booking policy",
    privacyNotice: "Privacy notice",
  },
  es: {
    paymentsLine: "Pagos procesados por Tulala",
    tulalaTerms: "Términos de la plataforma Tulala",
    tulalaPrivacy: "Política de privacidad de Tulala",
    tulalaCookies: "Cookies",
    bookingPolicy: "Política de reservas",
    privacyNotice: "Aviso de privacidad",
  },
};

/** "By continuing you agree to the booking policy" line (display only). */
export const BOOKING_POLICY_AGREE: Record<
  PolicyLocale,
  { before: string; link: string; after: string }
> = {
  en: { before: "By continuing you agree to the ", link: "booking policy", after: "." },
  es: { before: "Al continuar aceptas la ", link: "política de reservas", after: "." },
};
