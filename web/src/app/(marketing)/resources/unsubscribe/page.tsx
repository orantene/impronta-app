import type { Metadata } from "next";
import { getRequestLocale } from "@/i18n/request-locale";
import { pickLocale } from "@/lib/i18n/pick-locale";
import { MarketingContainer, MarketingSection } from "@/components/marketing/container";
import { SimplePageHero } from "@/components/marketing/simple-page-hero";
import { UnsubscribeConfirm } from "./unsubscribe-confirm";

/**
 * Marketing newsletter unsubscribe landing (Wave 2).
 *
 * Lives under `/resources/unsubscribe` so it passes the marketing surface
 * allow-list via the existing `/resources` prefix (no allow-list edit needed).
 * The welcome email links here with `?token=<unsubscribe_token>`; the actual
 * flip runs on a button click inside UnsubscribeConfirm, not on GET, so a link
 * scanner cannot auto-unsubscribe. noindex — this is a per-recipient utility URL.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function ResourcesUnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const locale = await getRequestLocale();

  const c = pickLocale(locale, {
    en: {
      eyebrow: "Newsletter",
      title: "Unsubscribe",
      subtitle: "Confirm below and you won't get the weekly guide anymore.",
      intro: "Click the button to stop receiving the newsletter. You can resubscribe anytime from the resources page.",
      cta: "Unsubscribe me",
      working: "Working...",
      done: "Done. You've been unsubscribed. Sorry to see you go.",
      notFound: "This link isn't recognised. It may have already been used, or the address was already off the list.",
      missing: "This unsubscribe link is missing its token. Open the link directly from the email.",
    },
    es: {
      eyebrow: "Boletín",
      title: "Darte de baja",
      subtitle: "Confirma abajo y dejarás de recibir la guía semanal.",
      intro: "Toca el botón para dejar de recibir el boletín. Puedes volver a suscribirte cuando quieras desde la página de recursos.",
      cta: "Darme de baja",
      working: "Procesando...",
      done: "Listo. Te diste de baja. Lamentamos verte partir.",
      notFound: "Este enlace no es válido. Puede que ya se haya usado, o que el correo ya no estuviera en la lista.",
      missing: "A este enlace de baja le falta el token. Abre el enlace directamente desde el correo.",
    },
  });

  return (
    <>
      <SimplePageHero eyebrow={c.eyebrow} title={c.title} subtitle={c.subtitle} sourcePage="resources-unsubscribe" />

      <MarketingSection>
        <MarketingContainer>
          <div
            className="rounded-[22px] p-6 sm:p-8"
            style={{
              background: "var(--plt-bg-elevated)",
              border: "1px solid var(--plt-hairline)",
            }}
          >
            {token ? (
              <UnsubscribeConfirm
                token={token}
                copy={{
                  intro: c.intro,
                  cta: c.cta,
                  working: c.working,
                  done: c.done,
                  notFound: c.notFound,
                }}
              />
            ) : (
              <p className="text-[0.9375rem] leading-[1.6]" style={{ color: "var(--plt-muted)" }}>
                {c.missing}
              </p>
            )}
          </div>
        </MarketingContainer>
      </MarketingSection>
    </>
  );
}
