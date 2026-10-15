import { pickLocale } from "@/lib/i18n/pick-locale";

/** Words on the root 404 page, platform or agency flavour. Pure. */
export function notFoundCopy(locale: string, agencyName: string | null) {
  const agency = agencyName !== null;
  return {
    heading: agency
      ? pickLocale(locale, { en: "This page is no longer here", es: "Esta página ya no está aquí" })
      : pickLocale(locale, { en: "Page not found", es: "Página no encontrada" }),
    body: agency
      ? pickLocale(locale, {
          en: `We couldn't find that page on ${agencyName}. The roster, news, or campaign you were looking for may have moved.`,
          es: `No encontramos esa página en ${agencyName}. Lo que buscabas puede haberse movido.`,
        })
      : pickLocale(locale, {
          en: "We couldn't find the page you're looking for.",
          es: "No encontramos la página que buscas.",
        }),
    primary: {
      label: agency
        ? pickLocale(locale, { en: "Back to homepage", es: "Volver al inicio" })
        : pickLocale(locale, { en: "Go home", es: "Ir al inicio" }),
      href: "/",
    },
    secondary: agency
      ? {
          label: pickLocale(locale, { en: "Send an inquiry", es: "Enviar una consulta" }),
          href: "/client/inquiries/new",
        }
      : {
          label: pickLocale(locale, { en: "Sign in", es: "Iniciar sesión" }),
          href: "/login",
        },
    poweredBy: pickLocale(locale, { en: "Powered by Tulala", es: "Con tecnología de Tulala" }),
  };
}
