/**
 * TUL-1476 · Plain ES / EN copy for the owner's terms step (pure). No em dashes.
 * Model names reuse the "how you work with people" titles (TUL-1442) so the owner sees the
 * same words everywhere.
 */
import { choiceCopy } from "./work-style";
import type { JoinTermsOutcome } from "./join-terms";
import type { ProposedTerms, WorkModel } from "./terms";

export type JoinTermsLocale = "es" | "en";

export function joinTermsLocale(locale: string | null | undefined): JoinTermsLocale {
  return String(locale ?? "").toLowerCase().startsWith("es") ? "es" : "en";
}

const COPY = {
  es: {
    title: "Condiciones para esta persona",
    intro: "Le mandamos tus condiciones de siempre. Las acepta en su panel antes de vender algo contigo.",
    send: "Enviar condiciones",
    skip: "Ahora no",
    confirmApprove: "Aprobar y enviar",
    model: "Forma de trabajar",
    sharePercent: "Tu parte (%)",
    sharePercentMargin: "Tu parte sobre su precio (%)",
    shareAmount: "Renta",
    currency: "Moneda",
    pickCurrency: "Elige",
    exclusive: "Exclusiva con tu negocio",
    exclusiveHint: "Solo tú, su propia página y Tulala pueden vender sus servicios.",
    restTitle: "También incluye",
    loading: "Cargando tus condiciones...",
    ownerOnly: "Solo la persona dueña o un admin puede enviar condiciones. Puedes enviarlas después desde su perfil.",
    priceTalent: "El cliente ve el precio de la persona.",
    priceMargin: "El cliente ve el precio de la persona más tu parte.",
    priceOther: "El cliente ve el precio que tú fijas.",
    identityName: "Se muestra su nombre.",
    identityPortfolio: "Se muestra su portafolio, sin su nombre.",
    identityHidden: "No se muestra quién es.",
    talksWorkspace: "Tú hablas con los clientes.",
    talksTalent: "La persona habla con sus clientes.",
    noPoaching: "Nadie trata por fuera con los clientes que llegan por ti.",
    pendingNote: "No se vende nada con estas condiciones hasta que la persona las acepte.",
    outcome: {
      sent: "Condiciones enviadas. La persona las verá en su panel para aceptarlas.",
      skipped: "",
      not_allowed: "Se unió, pero las condiciones no se enviaron: solo la persona dueña o un admin puede enviarlas.",
      unavailable: "Se unió. Las condiciones todavía no están disponibles; envíalas después desde su perfil.",
      invalid: "Se unió, pero revisa las condiciones: la parte o la renta no es válida.",
      failed: "Se unió, pero no pudimos enviar las condiciones. Inténtalo de nuevo desde su perfil.",
    } satisfies Record<JoinTermsOutcome, string>,
    invalid: {
      share_bps: "Escribe tu parte como un número entre 0 y 90.",
      share_amount: "Escribe el monto de la renta.",
      share_currency: "Elige la moneda.",
      work_model: "Elige una forma de trabajar.",
    } as Record<string, string>,
  },
  en: {
    title: "Terms for this person",
    intro: "We send your usual terms. They accept them in their dashboard before anything is sold with you.",
    send: "Send terms",
    skip: "Not now",
    confirmApprove: "Approve and send",
    model: "Way of working",
    sharePercent: "Your share (%)",
    sharePercentMargin: "Your share on top of their price (%)",
    shareAmount: "Rent",
    currency: "Currency",
    pickCurrency: "Pick one",
    exclusive: "Exclusive with your business",
    exclusiveHint: "Only you, their own page and Tulala can sell their services.",
    restTitle: "Also included",
    loading: "Loading your terms...",
    ownerOnly: "Only the owner or an admin can send terms. You can send them later from their profile.",
    priceTalent: "Clients see the person's price.",
    priceMargin: "Clients see the person's price plus your share.",
    priceOther: "Clients see the price you set.",
    identityName: "Their name is shown.",
    identityPortfolio: "Their portfolio is shown, without their name.",
    identityHidden: "Who they are is not shown.",
    talksWorkspace: "You talk to the clients.",
    talksTalent: "The person talks to their clients.",
    noPoaching: "Nobody deals around you with clients who came through you.",
    pendingNote: "Nothing is sold under these terms until the person accepts them.",
    outcome: {
      sent: "Terms sent. The person will see them in their dashboard to accept.",
      skipped: "",
      not_allowed: "They joined, but the terms were not sent: only the owner or an admin can send terms.",
      unavailable: "They joined. Terms are not available yet; send them later from their profile.",
      invalid: "They joined, but check the terms: the share or rent is not valid.",
      failed: "They joined, but we could not send the terms. Try again from their profile.",
    } satisfies Record<JoinTermsOutcome, string>,
    invalid: {
      share_bps: "Enter your share as a number from 0 to 90.",
      share_amount: "Enter the rent amount.",
      share_currency: "Pick the currency.",
      work_model: "Pick a way of working.",
    } as Record<string, string>,
  },
} as const;

export type JoinTermsCopy = (typeof COPY)[JoinTermsLocale];

export function joinTermsCopy(locale: JoinTermsLocale): JoinTermsCopy {
  return COPY[locale];
}

export function modelLabel(model: WorkModel, locale: JoinTermsLocale): string {
  return choiceCopy(model, locale).title;
}

/** Plain lines for the defaults the step does not ask about, so the owner sees everything sent. */
export function joinTermsRestLines(t: ProposedTerms, locale: JoinTermsLocale): string[] {
  const c = COPY[locale];
  const lines: string[] = [];
  lines.push(t.clientPriceMode === "talent_price" ? c.priceTalent : t.clientPriceMode === "talent_plus_margin" ? c.priceMargin : c.priceOther);
  lines.push(t.showIdentity === "name" ? c.identityName : t.showIdentity === "portfolio" ? c.identityPortfolio : c.identityHidden);
  lines.push(t.clientContact === "workspace" ? c.talksWorkspace : c.talksTalent);
  if (t.noPoaching) lines.push(c.noPoaching);
  return lines;
}

/** The notice shown after a join, or null when there is nothing to say (skipped). */
export function joinTermsOutcomeNotice(outcome: JoinTermsOutcome | undefined, locale: JoinTermsLocale): string | null {
  if (!outcome || outcome === "skipped") return null;
  return COPY[locale].outcome[outcome] || null;
}
