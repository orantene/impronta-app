/**
 * TUL-1400: public changelog launch switch.
 *
 * ONE env flag, `CHANGELOG_PUBLIC_LAUNCH` (default OFF, only "1" turns it on),
 * controls three things together:
 *   (a) /changelog robots: noindex while off, indexable when on;
 *   (b) the /changelog sitemap entry: absent while off;
 *   (c) the "Launch Edition" post: renders only when on.
 *
 * To launch: set CHANGELOG_PUBLIC_LAUNCH=1 in the production env and redeploy.
 * Pure module (no server-only imports) so it is unit-testable.
 */

export type ChangelogLocale = "en" | "es";

export type ChangelogPost = {
  slug: string;
  date: string;
  copy: Record<ChangelogLocale, { title: string; summary: string; body: string[] }>;
};

export function changelogPublicLaunch(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env.CHANGELOG_PUBLIC_LAUNCH === "1";
}

/**
 * Launch Edition post. PLACEHOLDER COPY: every line is a stand-in and
 * NEEDS ORAN SIGN-OFF before CHANGELOG_PUBLIC_LAUNCH is switched on.
 */
const LAUNCH_EDITION: ChangelogPost = {
  slug: "launch-edition",
  date: "2026-10-20",
  copy: {
    en: {
      title: "Launch Edition",
      summary: "Placeholder: the first public edition of the Tulala changelog.",
      body: [
        "PLACEHOLDER COPY, NEEDS ORAN SIGN-OFF BEFORE LAUNCH.",
        "Tulala is open to everyone. This is the first public edition of what we ship, and from here on every release gets a short, plain note.",
        "Placeholder highlights: booking, deposits and a site for every professional. Final list to be written by Oran.",
      ],
    },
    es: {
      title: "Edición de lanzamiento",
      summary: "Texto provisional: la primera edición pública del registro de cambios de Tulala.",
      body: [
        "TEXTO PROVISIONAL, REQUIERE VISTO BUENO DE ORAN ANTES DEL LANZAMIENTO.",
        "Tulala está abierta para todos. Esta es la primera edición pública de lo que publicamos, y de aquí en adelante cada versión tendrá una nota breve y clara.",
        "Puntos provisionales: reservas, anticipos y un sitio para cada profesional. La lista final la escribe Oran.",
      ],
    },
  },
};

export function visibleChangelogPosts(on: boolean): ChangelogPost[] {
  return on ? [LAUNCH_EDITION] : [];
}

export function changelogRobots(on: boolean): { index: boolean; follow: boolean } {
  return { index: on, follow: on };
}

export function changelogSitemapPaths(on: boolean): string[] {
  return on ? ["/changelog"] : [];
}
