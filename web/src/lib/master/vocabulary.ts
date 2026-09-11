/**
 * Six independent state axes with paired labels and outcome-named CTAs.
 * No single Complete badge. No generic Continue where money moves or capacity
 * releases.
 */

export const STATE_AXES = [
  "publication",
  "commitment",
  "payment",
  "fulfillment",
  "attendance",
  "delivery",
] as const;

export type StateAxis = (typeof STATE_AXES)[number];

export type AxisLabels = Record<StateAxis, string | null>;

/** Pair labels such as "Confirmed · Deposit paid". Null axes are omitted. */
export function pairedStateLabel(axes: AxisLabels): string {
  const parts: string[] = [];
  for (const axis of STATE_AXES) {
    const label = axes[axis];
    if (label) parts.push(label);
  }
  return parts.join(" · ");
}

export type CtaKind =
  | "collect_deposit"
  | "collect_balance"
  | "confirm_booking"
  | "release_capacity"
  | "admit"
  | "mark_ready"
  | "generic_continue";

export type CtaDecision =
  | { ok: true; label: string }
  | { ok: false; reason: "generic_continue_forbidden"; message: string };

/**
 * Outcome-named buttons. Money and capacity actions may never render as
 * generic Continue.
 */
export function outcomeCta(kind: CtaKind, locale: "en" | "es" = "en"): CtaDecision {
  if (kind === "generic_continue") {
    return {
      ok: false,
      reason: "generic_continue_forbidden",
      message: "Use an outcome-named action when money moves or capacity releases.",
    };
  }
  const en: Record<Exclude<CtaKind, "generic_continue">, string> = {
    collect_deposit: "Collect deposit",
    collect_balance: "Collect balance",
    confirm_booking: "Confirm booking",
    release_capacity: "Release places",
    admit: "Admit",
    mark_ready: "Mark ready",
  };
  const es: typeof en = {
    collect_deposit: "Cobrar anticipo",
    collect_balance: "Cobrar saldo",
    confirm_booking: "Confirmar reserva",
    release_capacity: "Liberar lugares",
    admit: "Admitir",
    mark_ready: "Marcar listo",
  };
  return { ok: true, label: (locale === "es" ? es : en)[kind] };
}

export const ERROR_VOCABULARY = {
  sold_out: { en: "No places left.", es: "No quedan lugares." },
  slot_taken: { en: "That time was just taken.", es: "Ese horario acaba de ocuparse." },
  payment_required: { en: "Payment is still owed.", es: "Todavía se debe el pago." },
  unauthorized: { en: "You cannot do that in this workspace.", es: "No puedes hacer eso en este espacio." },
} as const;

export function errorCopy(
  key: keyof typeof ERROR_VOCABULARY,
  locale: "en" | "es" = "en",
): string {
  return ERROR_VOCABULARY[key][locale];
}
