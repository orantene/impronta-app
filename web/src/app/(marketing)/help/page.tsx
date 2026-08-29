import type { Metadata } from "next";
import Link from "next/link";
import { MarketingContainer, MarketingSection } from "@/components/marketing/container";
import { SUPPORT_EMAIL } from "@/components/marketing/marketing-support-menu";
import { getRequestLocale } from "@/i18n/request-locale";
import { withLocaleHref } from "@/i18n/pathnames";
import { pickLocale } from "@/lib/i18n/pick-locale";
import { buildMarketingLocaleAlternates } from "@/lib/seo/locale-alternates";

/**
 * Help docs index. Still scaffolding for the articles themselves, but no
 * longer scaffolding for the chrome around them.
 *
 * This page previously shipped raw hex colours and a system font stack, so it
 * looked like a different product to anyone who arrived from the site; it had
 * no canonical or hreflang despite being in the sitemap under both locales;
 * every card href was un localised, so a Spanish reader clicking one landed in
 * English; and it pointed at help@tulala.digital while every other surface in
 * the codebase uses hello@. All four are fixed here.
 */

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  return {
    title: pickLocale(locale, { en: "Help and guides", es: "Ayuda y guías" }),
    description: pickLocale(locale, {
      en: "Guides for operators, agencies, talents and clients using Tulala. Find your role and start there.",
      es: "Guías para operadores, agencias, talento y clientes de Tulala. Encuentra tu rol y empieza ahí.",
    }),
    ...buildMarketingLocaleAlternates(locale, "/help"),
  };
}

const ROLES = [
  {
    slug: "operators",
    en: {
      title: "Independent operators",
      description:
        "Solo agents and small studios. Claiming your free Tulala URL, building your roster, sending the first inquiry.",
    },
    es: {
      title: "Operadores independientes",
      description:
        "Agentes independientes y estudios pequeños. Reclamar tu URL gratis de Tulala, armar tu roster y enviar la primera solicitud.",
    },
  },
  {
    slug: "agencies",
    en: {
      title: "Representation agencies",
      description:
        "Multi seat agencies running several coordinators, custom domains, branded sites, and the full pipeline.",
    },
    es: {
      title: "Agencias de representación",
      description:
        "Agencias con varios coordinadores, dominios propios, sitios con tu marca y el pipeline completo.",
    },
  },
  {
    slug: "talents",
    en: {
      title: "Talents on a roster",
      description:
        "Models, hosts, performers and creators. Editing your profile, managing availability, and tracking bookings.",
    },
    es: {
      title: "Talento en un roster",
      description:
        "Modelos, presentadores, artistas y creadores. Editar tu perfil, manejar tu disponibilidad y seguir tus reservas.",
    },
  },
  {
    slug: "clients",
    en: {
      title: "Clients booking talent",
      description:
        "Brands, productions and event planners. Sending inquiries, requesting talent, approving offers.",
    },
    es: {
      title: "Clientes que reservan talento",
      description:
        "Marcas, producciones y organizadores de eventos. Enviar solicitudes, pedir talento y aprobar ofertas.",
    },
  },
] as const;

export default async function HelpIndexPage() {
  const locale = await getRequestLocale();
  const es = locale === "es";

  const t = {
    eyebrow: es ? "Ayuda" : "Help",
    title: es ? "Ayuda y guías" : "Help and guides",
    lede: es
      ? "Elige tu rol para encontrar las guías correctas. Y si no encuentras lo que necesitas, no te quedas solo con la documentación."
      : "Pick your role to find the right guides. And if you cannot find what you need, you are not left alone with the documentation.",
    humanTitle: es ? "¿No lo encuentras?" : "Cannot find it?",
    humanBody: es
      ? "Te responde una persona real, no un bot. Escribe a"
      : "A real person answers, not a bot. Write to",
    humanTail: es ? ". Leemos todos los mensajes." : ". We read every message.",
    promise: es ? "Cómo funciona nuestro soporte" : "How our support works",
  };

  return (
    <>
      <MarketingSection spacing="tight">
        <MarketingContainer size="wide">
          <div className="mx-auto max-w-3xl text-center">
            <p className="plt-eyebrow" style={{ color: "var(--plt-muted)" }}>
              {t.eyebrow}
            </p>
            <h1
              className="plt-display mt-4"
              style={{
                fontSize: "clamp(2rem, 5.5vw, 3.1rem)",
                lineHeight: 1.05,
                color: "var(--plt-ink)",
              }}
            >
              {t.title}
            </h1>
            <p
              className="plt-body mx-auto mt-5 max-w-2xl"
              style={{ fontSize: "1.0625rem", lineHeight: 1.7, color: "var(--plt-ink-soft)" }}
            >
              {t.lede}
            </p>
          </div>

          <div className="mx-auto mt-12 grid max-w-4xl gap-4 sm:grid-cols-2">
            {ROLES.map((role) => {
              const side = es ? role.es : role.en;
              return (
                <Link
                  key={role.slug}
                  href={withLocaleHref(`/help/${role.slug}`, locale)}
                  className="rounded-[18px] p-6 transition-colors hover:border-[var(--plt-forest)]"
                  style={{
                    background: "var(--plt-bg-raised)",
                    border: "1px solid var(--plt-hairline)",
                  }}
                >
                  <h2
                    className="plt-display"
                    style={{ fontSize: "1.0625rem", color: "var(--plt-ink)" }}
                  >
                    {side.title}
                  </h2>
                  <p
                    className="plt-body mt-2"
                    style={{
                      fontSize: "0.9375rem",
                      lineHeight: 1.6,
                      color: "var(--plt-muted)",
                    }}
                  >
                    {side.description}
                  </p>
                </Link>
              );
            })}
          </div>

          <div
            className="mx-auto mt-10 max-w-4xl rounded-[18px] p-6"
            style={{
              background: "var(--plt-bg-deep)",
              border: "1px solid var(--plt-hairline)",
            }}
          >
            <p
              className="plt-body"
              style={{ fontSize: "0.9375rem", lineHeight: 1.65, color: "var(--plt-ink-soft)" }}
            >
              <strong style={{ color: "var(--plt-ink)" }}>{t.humanTitle}</strong> {t.humanBody}{" "}
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                className="underline underline-offset-2"
                style={{ color: "var(--plt-forest)" }}
              >
                {SUPPORT_EMAIL}
              </a>
              {t.humanTail}{" "}
              <Link
                href={withLocaleHref("/support", locale)}
                className="underline underline-offset-2"
                style={{ color: "var(--plt-forest)" }}
              >
                {t.promise}
              </Link>
            </p>
          </div>
        </MarketingContainer>
      </MarketingSection>
    </>
  );
}
