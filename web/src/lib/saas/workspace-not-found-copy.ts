/**
 * TUL-697 — copy for the branded 404 on a workspace (agency / studio) site.
 * Follows the visitor's site language and the workspace's own name; a
 * nameless workspace reads "this site", never a made-up "Studio". Pure.
 */

export type WorkspaceNotFoundCopy = {
  lang: "es" | "en";
  eyebrow: string;
  heading: string;
  body: string;
  home: string;
  inquiry: string;
  poweredBy: string;
};

export function workspaceNotFoundLang(locale: string | null | undefined): "es" | "en" {
  return (locale ?? "").toLowerCase().startsWith("es") ? "es" : "en";
}

export function workspaceNotFoundCopy(locale: string | null | undefined, name: string | null | undefined): WorkspaceNotFoundCopy {
  const lang = workspaceNotFoundLang(locale);
  const clean = name?.trim() ?? "";
  if (lang === "es") {
    return {
      lang,
      eyebrow: clean ? clean.toUpperCase() : "ESTE SITIO",
      heading: "Esta página ya no está aquí",
      body: `No encontramos esa página en ${clean || "este sitio"}. Puede que se haya movido.`,
      home: "Volver al inicio",
      inquiry: "Enviar una solicitud",
      poweredBy: "Con tecnología de Tulala",
    };
  }
  return {
    lang,
    eyebrow: clean ? clean.toUpperCase() : "THIS SITE",
    heading: "This page is no longer here",
    body: `We couldn't find that page on ${clean || "this site"}. It may have moved.`,
    home: "Back to homepage",
    inquiry: "Send an inquiry",
    poweredBy: "Powered by Tulala",
  };
}
