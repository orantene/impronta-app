import type { Metadata } from "next";
import Link from "next/link";
import { MarketingContainer, MarketingSection } from "@/components/marketing/container";
import { MarketingCta } from "@/components/marketing/cta-link";
import { FinalCtaSection } from "@/components/marketing/final-cta-section";
import { SUPPORT_EMAIL } from "@/lib/platform/support-contact";
import { getRequestLocale } from "@/i18n/request-locale";
import { withLocaleHref } from "@/i18n/pathnames";
import { pickLocale } from "@/lib/i18n/pick-locale";
import { PLATFORM_BRAND } from "@/lib/platform/brand";
import { breadcrumbJsonLdToString, buildBreadcrumbJsonLd } from "@/lib/seo/breadcrumb-json-ld";
import { buildMarketingLocaleAlternates } from "@/lib/seo/locale-alternates";

/**
 * The human support promise.
 *
 * TWO RULES GOVERN THIS PAGE, and both exist because the page's whole argument
 * is that we tell the truth about support when nobody else does.
 *
 * 1. NO RESPONSE TIME. We have not committed to one, so we do not print one.
 *    A missed number would prove the opposite of what this page claims.
 * 2. ONLY CHANNELS THAT EXIST. Today that is email and the support centre
 *    inside the product. WhatsApp is not wired up, so it is not named here.
 *
 * If either changes, change this page. Do not soften the rules to fill space.
 */

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  return {
    title: pickLocale(locale, {
      en: "Support: a real person answers",
      es: "Soporte: te responde una persona real",
    }),
    description: pickLocale(locale, {
      en: "No bot wall, no ticket maze. When something breaks in your business, you talk to a human at Tulala who can actually fix it.",
      es: "Sin muros de bots ni laberintos de tickets. Cuando algo se rompe en tu negocio, hablas con una persona de Tulala que sí puede resolverlo.",
    }),
    ...buildMarketingLocaleAlternates(locale, "/support"),
  };
}

export default async function SupportPage() {
  const locale = await getRequestLocale();
  const es = locale === "es";
  const base = `https://${PLATFORM_BRAND.domain}`;
  const L = (href: string) => withLocaleHref(href, locale);

  const t = {
    eyebrow: es ? "Soporte" : "Support",
    title: es ? "Te responde una persona real." : "A real person answers.",
    lede: es
      ? "Sabes exactamente de qué estamos hablando. Escribes porque algo se rompió, y lo primero que te encuentras es un bot que te pide reformular la pregunta. Después un artículo del centro de ayuda que no era el tuyo. Después un formulario. Y en algún punto dejas de intentarlo y aprendes a vivir con el problema."
      : "You know exactly what we are talking about. You write in because something broke, and the first thing you meet is a bot asking you to rephrase the question. Then a help centre article that was not your problem. Then a form. And at some point you stop trying and learn to live with it.",
    lede2: es
      ? "Eso no es soporte. Eso es una empresa protegiendo su tiempo con el tuyo. Aquí no lo hacemos así, y esta página existe para que nos lo puedas reclamar."
      : "That is not support. That is a company protecting its time using yours. We do not run it that way, and this page exists so you can hold us to it.",

    reachTitle: es ? "Cómo nos escribes" : "How you reach us",
    reachLede: es
      ? "Dos caminos, los dos llegan a la misma persona. Nombramos solo los que existen hoy."
      : "Two ways in, both landing with the same person. We name only the ones that exist today.",
    channels: [
      {
        name: es ? "El centro de soporte, dentro del producto" : "The support centre, inside the product",
        body: es
          ? "Abres soporte desde tu panel y el mensaje llega con tu cuenta, tu página y lo que estabas haciendo ya adjuntos. No tienes que explicar quién eres ni reconstruir el problema desde cero."
          : "You open support from your dashboard and the message arrives with your account, your page and what you were doing already attached. You do not have to explain who you are or rebuild the problem from scratch.",
      },
      {
        name: es ? "Correo" : "Email",
        body: es
          ? `Escribe a ${SUPPORT_EMAIL} desde donde estés. Va al mismo lugar, lo lee la misma gente.`
          : `Write to ${SUPPORT_EMAIL} from wherever you are. It goes to the same place and the same people read it.`,
      },
    ],

    honestTitle: es ? "Lo que no vamos a hacer" : "What we will not do",
    honest: es
      ? [
          "No vamos a publicar un tiempo de respuesta que todavía no podemos cumplir. Una promesa incumplida es peor que no prometer nada, y sería lo primero que destruiría el argumento de esta página.",
          "No vamos a poner un bot entre tú y una persona. Si algún día una herramienta nos ayuda a leer tu mensaje más rápido, seguirá siendo una persona quien te responde.",
          "No vamos a cerrar tu caso porque dejaste de escribir. Si el problema sigue vivo, sigue abierto.",
          "No vamos a cobrarte por hablar con alguien. El soporte humano no es un plan superior.",
        ]
      : [
          "We are not going to publish a response time we cannot yet commit to. A promise that gets missed is worse than no promise, and it would be the first thing to destroy the argument on this page.",
          "We are not going to put a bot between you and a person. If a tool ever helps us read your message faster, a person still writes the answer.",
          "We are not going to close your case because you went quiet. If the problem is still real, it is still open.",
          "We are not going to charge you for talking to someone. Human support is not a higher plan.",
        ],

    fixTitle: es ? "Y puede arreglarlo de verdad" : "And they can actually fix it",
    fixBody: es
      ? "La diferencia real no es que responda un humano. Es qué puede hacer ese humano. La persona que te contesta puede ver tu página, tu configuración y tus reservas, y puede arreglar la cosa en lugar de escalarla a un equipo que no te va a escribir. Si algo está mal en la plataforma, se convierte en trabajo nuestro ese mismo día, no en un ticket que se enfría."
      : "The real difference is not that a human replies. It is what that human can do. The person answering can see your page, your settings and your bookings, and can fix the thing rather than escalate it to a team that never writes back. If something is wrong with the platform, it becomes our work that day instead of a ticket that goes cold.",
    langNote: es
      ? "En español o en inglés, el que prefieras. No te vamos a hacer traducir tu propio problema."
      : "In Spanish or in English, whichever you prefer. We are not going to make you translate your own problem.",

    ctaTitle: es ? "¿Necesitas algo ahora?" : "Need something now?",
    ctaBody: es
      ? "Escríbenos. No hay formulario de calificación ni cuestionario previo."
      : "Write to us. There is no qualifying form and no questionnaire first.",
    emailCta: es ? "Escríbenos por correo" : "Email us",
    featureCta: es ? "Cómo funciona el soporte premium" : "How premium support works",
    helpCta: es ? "Ver las guías" : "Browse the guides",
  };

  const breadcrumb = buildBreadcrumbJsonLd([
    { name: PLATFORM_BRAND.name, url: `${base}/` },
    { name: t.eyebrow, url: `${base}/support` },
  ]);

  return (
    <>
      {breadcrumb ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: breadcrumbJsonLdToString(breadcrumb) }}
        />
      ) : null}

      <MarketingSection spacing="tight">
        <MarketingContainer size="wide">
          <div className="mx-auto max-w-3xl text-center">
            <p className="plt-eyebrow" style={{ color: "var(--plt-muted)" }}>
              {t.eyebrow}
            </p>
            <h1
              className="plt-display mt-4"
              style={{
                fontSize: "clamp(2.2rem, 6.5vw, 3.8rem)",
                lineHeight: 1.03,
                color: "var(--plt-ink)",
              }}
            >
              {t.title}
            </h1>
            <div
              className="plt-body mx-auto mt-6 flex max-w-2xl flex-col gap-4 text-left"
              style={{ fontSize: "1.0625rem", lineHeight: 1.7, color: "var(--plt-ink-soft)" }}
            >
              <p>{t.lede}</p>
              <p>{t.lede2}</p>
            </div>
          </div>
        </MarketingContainer>
      </MarketingSection>

      <MarketingSection spacing="tight">
        <MarketingContainer size="wide">
          <div className="mx-auto max-w-3xl">
            <h2
              className="plt-display"
              style={{ fontSize: "clamp(1.5rem, 3.4vw, 2rem)", color: "var(--plt-ink)" }}
            >
              {t.reachTitle}
            </h2>
            <p
              className="plt-body mt-2"
              style={{ color: "var(--plt-muted)", fontSize: "1rem", lineHeight: 1.65 }}
            >
              {t.reachLede}
            </p>
            <div className="mt-7 grid gap-6 sm:grid-cols-2">
              {t.channels.map((ch) => (
                <div
                  key={ch.name}
                  className="rounded-[18px] p-6"
                  style={{
                    background: "var(--plt-bg-raised)",
                    border: "1px solid var(--plt-hairline)",
                  }}
                >
                  <h3
                    className="plt-display"
                    style={{ fontSize: "1.0625rem", color: "var(--plt-ink)" }}
                  >
                    {ch.name}
                  </h3>
                  <p
                    className="plt-body mt-2"
                    style={{
                      color: "var(--plt-ink-soft)",
                      fontSize: "0.9375rem",
                      lineHeight: 1.65,
                    }}
                  >
                    {ch.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </MarketingContainer>
      </MarketingSection>

      <MarketingSection spacing="tight">
        <MarketingContainer size="wide">
          <div className="mx-auto max-w-3xl">
            <h2
              className="plt-display"
              style={{ fontSize: "clamp(1.5rem, 3.4vw, 2rem)", color: "var(--plt-ink)" }}
            >
              {t.honestTitle}
            </h2>
            <ul className="mt-6 flex flex-col">
              {t.honest.map((line) => (
                <li
                  key={line}
                  className="plt-body py-4"
                  style={{
                    borderTop: "1px solid var(--plt-hairline)",
                    color: "var(--plt-ink-soft)",
                    fontSize: "1rem",
                    lineHeight: 1.7,
                  }}
                >
                  {line}
                </li>
              ))}
            </ul>
          </div>
        </MarketingContainer>
      </MarketingSection>

      <MarketingSection spacing="tight">
        <MarketingContainer size="wide">
          <div className="mx-auto max-w-3xl">
            <h2
              className="plt-display"
              style={{ fontSize: "clamp(1.5rem, 3.4vw, 2rem)", color: "var(--plt-ink)" }}
            >
              {t.fixTitle}
            </h2>
            <p
              className="plt-body mt-4"
              style={{ color: "var(--plt-ink-soft)", fontSize: "1.0625rem", lineHeight: 1.7 }}
            >
              {t.fixBody}
            </p>
            <p
              className="plt-display-serif mt-5 italic"
              style={{ color: "var(--plt-forest)", fontSize: "1.125rem", lineHeight: 1.6 }}
            >
              {t.langNote}
            </p>

            <div
              className="mt-10 rounded-[20px] p-7 sm:p-9"
              style={{
                background: "var(--plt-bg-raised)",
                border: "1px solid var(--plt-hairline)",
              }}
            >
              <h3
                className="plt-display"
                style={{ fontSize: "1.375rem", color: "var(--plt-ink)" }}
              >
                {t.ctaTitle}
              </h3>
              <p
                className="plt-body mt-2"
                style={{ color: "var(--plt-ink-soft)", fontSize: "1rem", lineHeight: 1.65 }}
              >
                {t.ctaBody}
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
                <MarketingCta href={`mailto:${SUPPORT_EMAIL}`} variant="primary" external eventSource="support" eventIntent="support-email">
                  {t.emailCta}
                </MarketingCta>
                <Link
                  href={L("/features/premium-support")}
                  className="text-[0.9375rem] font-medium transition-colors hover:underline"
                  style={{ color: "var(--plt-forest)" }}
                >
                  {t.featureCta}
                </Link>
                <Link
                  href={L("/help")}
                  className="text-[0.9375rem] transition-colors hover:underline"
                  style={{ color: "var(--plt-muted)" }}
                >
                  {t.helpCta}
                </Link>
              </div>
            </div>
          </div>
        </MarketingContainer>
      </MarketingSection>

      <FinalCtaSection />
    </>
  );
}
