/** Pure decision + copy helpers for <ConsentEmbed> (unit-tested). */

export type EmbedLocale = "en" | "es";

/** Consent is granted when the consent cookie lists "embeds" or analytics consent is granted. */
export function embedsConsented(input: {
  cookieHeader: string;
  analyticsConsent: string | null;
}): boolean {
  if (input.analyticsConsent === "granted") return true;
  const m = /(?:^|;\s*)tulala_consent=([^;]*)/.exec(input.cookieHeader || "");
  if (!m) return false;
  let value = m[1];
  try {
    value = decodeURIComponent(value);
  } catch {
    /* keep raw */
  }
  return value
    .replace(/[[\]{}"']/g, " ")
    .split(/[,|:+\s]+/)
    .map((p) => p.trim().toLowerCase())
    .includes("embeds");
}

/** Rewrite YouTube embed urls to the no-cookie domain. */
export function privacyEmbedSrc(src: string): string {
  return src.replace(
    /^https:\/\/(?:www\.)?youtube\.com\/embed\//,
    "https://www.youtube-nocookie.com/embed/",
  );
}

const PROVIDER_NAMES: Record<string, string> = {
  youtube: "YouTube",
  vimeo: "Vimeo",
  spotify: "Spotify",
  soundcloud: "SoundCloud",
  calendly: "Calendly",
  instagram: "Instagram",
  tiktok: "TikTok",
  maps: "Google Maps",
  google_maps: "Google Maps",
};

export function providerDisplayName(provider: string): string {
  return PROVIDER_NAMES[provider.toLowerCase()] ?? provider;
}

const COPY = {
  en: {
    load: (p: string) => `Load content from ${p}`,
    note: (p: string) => `${p} may set cookies and see your IP address when this loads.`,
  },
  es: {
    load: (p: string) => `Cargar contenido de ${p}`,
    note: (p: string) => `${p} puede guardar cookies y ver tu dirección IP al cargar este contenido.`,
  },
} as const;

export function embedCopy(locale: string | null | undefined, provider: string) {
  const l: EmbedLocale = (locale ?? "").toLowerCase().startsWith("es") ? "es" : "en";
  const name = providerDisplayName(provider);
  return { name, load: COPY[l].load(name), note: COPY[l].note(name) };
}
