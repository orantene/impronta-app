/**
 * payment-flag-copy.ts — the Issues inbox sentences for flagged card charges
 * (TUL-1283, TUL-1284, TUL-1268 M2), in en / es / fr, resolved ON THE SERVER.
 *
 * WHY NOT `messages/*.json`. The admin workspace client bundle carries the full
 * en/es/fr catalogs (`i18n/use-t.ts`), so every key added there is shipped to
 * every admin route in three languages. These sentences are only ever needed
 * by the Issues page, so the page localizes the rows before they reach the
 * client and passes plain strings as props (app bundle budget, 2026-10-19).
 *
 * PURE: no imports beyond types. No em dashes in any string.
 */

import type { ExceptionRow } from "./model";

type Locale = "en" | "es" | "fr";

type FlagCopy = {
  label: string;
  why: string;
  resolve: string;
  resolved: string;
  resolveFailed: string;
  reasons: Record<
    "amount_mismatch" | "charge_on_inactive_row" | "duplicate_charge" | "refund_restore_failed",
    { title: string; detail: string; label?: string; why?: string }
  >;
};

export const PAYMENT_FLAG_COPY: Record<Locale, FlagCopy> = {
  en: {
    label: "Check the charge in Stripe",
    why: "Refund or reconcile it in Stripe. Nothing here moves money.",
    resolve: "Mark resolved",
    resolved: "Marked resolved. It leaves this list on the next refresh.",
    resolveFailed: "Could not mark it resolved. Only owners and admins with billing access can. Nothing was changed.",
    reasons: {
      amount_mismatch: {
        title: "Card charge does not match the booking",
        detail: "Stripe charged {charged} but the booking is for {expected}. It was not marked paid. Reconcile the amount or refund the charge.",
      },
      charge_on_inactive_row: {
        title: "Card charge on a cancelled booking",
        detail: "Stripe charged {charged} after this booking was cancelled, refunded or its payment had failed. The money is owed back to the customer.",
      },
      duplicate_charge: {
        title: "Possible duplicate card charge",
        detail: "Stripe charged {charged} again ({paymentIntent}) after this booking was already paid ({otherPaymentIntent}). Refund the extra charge if it is a duplicate.",
      },
      refund_restore_failed: {
        title: "Refunded, but tickets, seats or promo were not put back",
        detail: "The refund went through, but putting back the tickets, seats or promo code did not finish. Some may still be held or still admit. Check the order and release them by hand.",
        label: "Put the order back by hand",
        why: "Open the order, void any ticket that still admits and free the seats or promo, then mark this resolved. Nothing here moves money.",
      },
    },
  },
  es: {
    label: "Revisar el cobro en Stripe",
    why: "Reembólsalo o concílialo en Stripe. Aquí no se mueve dinero.",
    resolve: "Marcar como resuelto",
    resolved: "Marcado como resuelto. Sale de esta lista al actualizar.",
    resolveFailed: "No se pudo marcar como resuelto. Solo pueden hacerlo dueños y administradores con acceso a facturación. No se cambió nada.",
    reasons: {
      amount_mismatch: {
        title: "El cobro con tarjeta no coincide con la reserva",
        detail: "Stripe cobró {charged} pero la reserva es por {expected}. No se marcó como pagada. Concilia el monto o reembolsa el cobro.",
      },
      charge_on_inactive_row: {
        title: "Cobro con tarjeta en una reserva cancelada",
        detail: "Stripe cobró {charged} después de que esta reserva se canceló, se reembolsó o su pago falló. Se le debe devolver el dinero al cliente.",
      },
      duplicate_charge: {
        title: "Posible cobro duplicado con tarjeta",
        detail: "Stripe cobró {charged} otra vez ({paymentIntent}) cuando esta reserva ya estaba pagada ({otherPaymentIntent}). Reembolsa el cobro extra si es un duplicado.",
      },
      refund_restore_failed: {
        title: "Reembolsado, pero no se devolvieron los boletos, lugares o la promo",
        detail: "El reembolso se hizo, pero no terminó de devolverse los boletos, lugares o el código promo. Puede que sigan apartados o que aún dejen entrar. Revisa el pedido y libéralos a mano.",
        label: "Devolver el pedido a mano",
        why: "Abre el pedido, anula los boletos que aún dejen entrar y libera los lugares o la promo, y marca esto como resuelto. Aquí no se mueve dinero.",
      },
    },
  },
  fr: {
    label: "Verifier le paiement dans Stripe",
    why: "Remboursez ou rapprochez-le dans Stripe. Rien ici ne deplace d'argent.",
    resolve: "Marquer comme resolu",
    resolved: "Marque comme resolu. Il quitte cette liste a la prochaine actualisation.",
    resolveFailed: "Impossible de le marquer comme resolu. Seuls les proprietaires et admins avec acces a la facturation le peuvent. Rien n'a ete modifie.",
    reasons: {
      amount_mismatch: {
        title: "Le paiement par carte ne correspond pas a la reservation",
        detail: "Stripe a debite {charged} mais la reservation est de {expected}. Elle n'a pas ete marquee payee. Rapprochez le montant ou remboursez le paiement.",
      },
      charge_on_inactive_row: {
        title: "Paiement par carte sur une reservation annulee",
        detail: "Stripe a debite {charged} apres l'annulation ou le remboursement de cette reservation, ou l'echec de son paiement. L'argent doit etre rendu au client.",
      },
      duplicate_charge: {
        title: "Possible double paiement par carte",
        detail: "Stripe a debite {charged} une seconde fois ({paymentIntent}) alors que cette reservation etait deja payee ({otherPaymentIntent}). Remboursez le paiement en trop s'il s'agit d'un doublon.",
      },
      refund_restore_failed: {
        title: "Rembourse, mais billets, places ou promo non remis",
        detail: "Le remboursement est passe, mais la remise des billets, places ou du code promo n'est pas terminee. Certains peuvent rester bloques ou encore valides. Verifiez la commande et liberez-les a la main.",
        label: "Remettre la commande a la main",
        why: "Ouvrez la commande, annulez les billets encore valides, liberez les places ou la promo, puis marquez comme resolu. Rien ici ne deplace d'argent.",
      },
    },
  },
};

function pickLocale(locale: string | null | undefined): Locale {
  const l = (locale ?? "").toLowerCase();
  return l.startsWith("es") ? "es" : l.startsWith("fr") ? "fr" : "en";
}

const fill = (template: string, vars: Record<string, string>): string =>
  template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? vars[k]! : m));

/** The three strings the client needs for "Mark resolved", in the reader's language. */
export function paymentFlagUiCopy(locale: string | null | undefined): { resolve: string; resolved: string; resolveFailed: string } {
  const c = PAYMENT_FLAG_COPY[pickLocale(locale)];
  return { resolve: c.resolve, resolved: c.resolved, resolveFailed: c.resolveFailed };
}

/** Rewrite flagged-payment rows into the reader's language; every other row is returned as is. */
export function localizePaymentFlagRows(rows: readonly ExceptionRow[], locale: string | null | undefined): ExceptionRow[] {
  const c = PAYMENT_FLAG_COPY[pickLocale(locale)];
  return rows.map((row) => {
    const reason = row.source === "payment_flag" ? row.resolvable?.reason : undefined;
    const text = reason && reason in c.reasons ? c.reasons[reason as keyof FlagCopy["reasons"]] : null;
    if (!text || !row.copy || row.nextAction.kind !== "inspect") return row;
    return {
      ...row,
      title: text.title,
      detail: fill(text.detail, row.copy.vars),
      nextAction: { ...row.nextAction, label: text.label ?? c.label, why: text.why ?? c.why },
      // Already spoken; the client never needs the keys.
      copy: undefined,
    };
  });
}
