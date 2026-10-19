/**
 * Renewal notice and Checkout disclosure copy.
 *
 * Kept out of messages/*.json on purpose: those catalogs ship in the admin
 * client bundle, and this copy is only read on the server (Stripe Checkout
 * custom text and the talent bell). Same sentences, same {amount}/{domain}/{date}
 * placeholders, three locales.
 */
import "server-only";

export type DomainRenewalLocale = "en" | "es" | "fr";

export type DomainRenewalCopyKey =
  | "chargedTitle"
  | "chargedBody"
  | "payTitle"
  | "payBody"
  | "autorenewOffTitle"
  | "autorenewOffBody"
  | "consentDisclosure";

export const DOMAIN_RENEWAL_COPY: Record<DomainRenewalLocale, Record<DomainRenewalCopyKey, string>> = {
  en: {
    chargedTitle: "Domain renewal paid",
    chargedBody: "We charged {amount} to your saved card to renew {domain}. That is our cost, with no markup. It renews on {date}.",
    payTitle: "Pay to keep {domain}",
    payBody: "{domain} renews on {date}. The renewal costs {amount}, our cost with no markup. Use the link within 24 hours; we will send a new one if needed. If it is not paid a week before, we turn off auto-renew and the domain will expire.",
    autorenewOffTitle: "Auto-renew is off for {domain}",
    autorenewOffBody: "We did not receive the renewal payment, so {domain} will expire on {date} and your site will stop loading there. Pay before then and we turn auto-renew back on.",
    consentDisclosure: "This domain renews every year at the registrar's price, with no markup. We tell you 21 days before and charge this card then. You can pay with a link instead at any time.",
  },
  es: {
    chargedTitle: "Renovación de dominio pagada",
    chargedBody: "Cobramos {amount} a tu tarjeta guardada para renovar {domain}. Es nuestro costo, sin margen. Se renueva el {date}.",
    payTitle: "Paga para conservar {domain}",
    payBody: "{domain} se renueva el {date}. La renovación cuesta {amount}, nuestro costo sin margen. Usa el enlace en las próximas 24 horas; si hace falta te enviamos otro. Si no se paga una semana antes, apagamos la renovación automática y el dominio vencerá.",
    autorenewOffTitle: "Renovación automática apagada para {domain}",
    autorenewOffBody: "No recibimos el pago de la renovación, así que {domain} vence el {date} y tu sitio dejará de cargar ahí. Paga antes de esa fecha y volvemos a encender la renovación automática.",
    consentDisclosure: "Este dominio se renueva cada año al precio del registrador, sin margen. Te avisamos 21 días antes y cobramos esta tarjeta entonces. Si prefieres, puedes pagar con un enlace.",
  },
  fr: {
    chargedTitle: "Renouvellement du domaine payé",
    chargedBody: "Nous avons débité {amount} de votre carte enregistrée pour renouveler {domain}. C'est notre coût, sans marge. Il se renouvelle le {date}.",
    payTitle: "Payez pour garder {domain}",
    payBody: "{domain} se renouvelle le {date}. Le renouvellement coûte {amount}, notre coût sans marge. Utilisez le lien dans les 24 heures ; nous en enverrons un autre si besoin. S'il n'est pas payé une semaine avant, nous désactivons le renouvellement automatique et le domaine expirera.",
    autorenewOffTitle: "Renouvellement automatique désactivé pour {domain}",
    autorenewOffBody: "Nous n'avons pas reçu le paiement du renouvellement : {domain} expirera le {date} et votre site ne s'affichera plus. Payez avant cette date et nous réactivons le renouvellement automatique.",
    consentDisclosure: "Ce domaine se renouvelle chaque année au prix du registraire, sans marge. Nous vous prévenons 21 jours avant et débitons alors cette carte. Vous pouvez aussi payer par lien à tout moment.",
  },
};

export function domainRenewalLocale(preferred: string | null | undefined): DomainRenewalLocale {
  const l = (preferred ?? "").toLowerCase();
  if (l.startsWith("es")) return "es";
  if (l.startsWith("fr")) return "fr";
  return "en";
}

export function domainRenewalCopy(preferred: string | null | undefined, key: DomainRenewalCopyKey): string {
  return DOMAIN_RENEWAL_COPY[domainRenewalLocale(preferred)][key];
}
