/**
 * TUL-583 (guide step): pure builder for the "Google Search Console" card.
 * No Google API calls. Custom domains verify with a DNS TXT record; Tulala
 * addresses verify with the HTML tag. The platform only emits a
 * google-site-verification tag per tenant (see site-verification-resolver),
 * not per talent, so `tagSupported` is false and the copy says so.
 */

export type GscLang = "en" | "es";
export type GscMode = "custom" | "tulala";

export type GscStep = { id: string; title: string; hint: string };

export type GscGuide = {
  mode: GscMode;
  siteUrl: string | null;
  sitemapUrl: string | null;
  tagSupported: boolean;
  steps: GscStep[];
  addPropertyUrl: string;
};

export const GSC_ADD_PROPERTY_URL = "https://search.google.com/search-console/welcome";

const isTulalaHost = (host: string): boolean => host === "tulala.digital" || host.endsWith(".tulala.digital");

function normalize(url: string | null | undefined): { url: string; host: string } | null {
  const raw = (url ?? "").trim();
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return { url: raw.replace(/\/+$/, ""), host: u.hostname.toLowerCase() };
  } catch {
    return null;
  }
}

const COPY = {
  en: {
    open: ["Open Search Console", "Sign in with the Google account you want to own this data."],
    add: ["Add your site", "Choose URL prefix and paste your site URL from above."],
    txt: ["Verify with a DNS TXT record", "Pick the domain option, copy the TXT value Google shows, add it as a TXT record at your domain provider, then press Verify."],
    tag: ["Verify with the HTML tag", "Pick HTML tag. Tulala adds this tag to Tulala addresses, but it is not self-serve yet: connect your own domain to verify now, or ask us."],
    sitemap: ["Submit your sitemap", "Open Sitemaps, paste the sitemap URL from above and press Submit."],
  },
  es: {
    open: ["Abre Search Console", "Entra con la cuenta de Google que quieres que sea dueña de estos datos."],
    add: ["Agrega tu sitio", "Elige prefijo de URL y pega la URL de tu sitio de arriba."],
    txt: ["Verifica con un registro TXT de DNS", "Elige la opción de dominio, copia el valor TXT que muestra Google, agrégalo como registro TXT con tu proveedor de dominio y presiona Verificar."],
    tag: ["Verifica con la etiqueta HTML", "Elige etiqueta HTML. Tulala agrega esta etiqueta a las direcciones de Tulala, pero aún no es autoservicio: conecta tu propio dominio para verificar ya, o pídenosla."],
    sitemap: ["Envía tu sitemap", "Abre Sitemaps, pega la URL del sitemap de arriba y presiona Enviar."],
  },
} as const;

export function buildGscGuide(input: { siteUrl?: string | null }, lang: GscLang): GscGuide {
  const site = normalize(input.siteUrl);
  const mode: GscMode = site && !isTulalaHost(site.host) ? "custom" : "tulala";
  const c = COPY[lang];
  const step = (id: string, [title, hint]: readonly [string, string]): GscStep => ({ id, title, hint });
  return {
    mode,
    siteUrl: site?.url ?? null,
    sitemapUrl: site ? `${site.url}/sitemap.xml` : null,
    tagSupported: false,
    steps: [
      step("open", c.open),
      step("add", c.add),
      step(mode === "custom" ? "txt" : "tag", mode === "custom" ? c.txt : c.tag),
      step("sitemap", c.sitemap),
    ],
    addPropertyUrl: GSC_ADD_PROPERTY_URL,
  };
}
