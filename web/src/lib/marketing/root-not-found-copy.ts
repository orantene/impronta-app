/**
 * Copy for the root `not-found.tsx` (a `notFound()` raised by any page outside
 * the talent-site tree). Agency hosts get the agency-branded variant.
 */

export type RootNotFoundLang = "en" | "es";

export type RootNotFoundCopy = {
  heading: string;
  body: string;
  primary: { label: string; href: string };
  secondary: { label: string; href: string };
  poweredBy: string;
};

export function rootNotFoundLang(locale: string | null | undefined): RootNotFoundLang {
  return (locale ?? "").toLowerCase().startsWith("es") ? "es" : "en";
}

export function rootNotFoundCopy(lang: RootNotFoundLang, agencyName: string | null): RootNotFoundCopy {
  if (agencyName !== null) {
    return lang === "es"
      ? {
          heading: "Esta página ya no está aquí",
          body: `No encontramos esa página en ${agencyName}. El talento, la noticia o la campaña que buscabas puede haberse movido.`,
          primary: { label: "Volver al inicio", href: "/" },
          secondary: { label: "Enviar una solicitud", href: "/client/inquiries/new" },
          poweredBy: "Con la tecnología de Tulala",
        }
      : {
          heading: "This page is no longer here",
          body: `We couldn't find that page on ${agencyName}. The roster, news, or campaign you were looking for may have moved.`,
          primary: { label: "Back to homepage", href: "/" },
          secondary: { label: "Send an inquiry", href: "/client/inquiries/new" },
          poweredBy: "Powered by Tulala",
        };
  }
  return lang === "es"
    ? {
        heading: "Página no encontrada",
        body: "No encontramos la página que buscas.",
        primary: { label: "Ir al inicio", href: "/" },
        secondary: { label: "Iniciar sesión", href: "/login" },
        poweredBy: "",
      }
    : {
        heading: "Page not found",
        body: "We couldn't find the page you're looking for.",
        primary: { label: "Go home", href: "/" },
        secondary: { label: "Sign in", href: "/login" },
        poweredBy: "",
      };
}
