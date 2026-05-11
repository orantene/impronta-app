/**
 * Pure helpers for the prototype profile shell drawer ↔ talent_profiles JSONB.
 * Keeps merge logic out of `use server` files (export hygiene) and reusable
 * from admin batch + talent self saves.
 *
 * ─── Section audit (agency batch `commitTalentProfileShellAdmin` + hydrate) ───
 * Wired: identity (inc. email/phone), about, location (inc. visits/place id),
 * rates, availability (inc. seasonalWindows in JSON), languages RPC, credits,
 * limits (hard/soft arrays), social proof, albums, documents, roster meta,
 * dynFields→field_values, video links + WhatsApp + business line (this file).
 * Self path mirrors via `updateSelf*` + `updateSelfProfileDrawerExtras`.
 *
 * Intent-based / separate actions: media uploads, polaroid assign, taxonomy
 * slug clicks (`assignTalentTaxonomyBySlug`), workflow status pill, trust
 * verifications preview, `rateTiers`, `dynFieldVisibility`, `homeCountry`,
 * `contexts`/prototype-only refinement when hidden for live roster.
 */

export type SocialLinkJson =
  | { label: string; href: string }
  | { kind: string; label: string; url: string; followers?: string };

export type EmbeddedMediaJson = {
  provider: string;
  url: string;
  label?: string;
  /** Set on rows owned by the admin-shell drawer video chips. */
  shellSource?: "drawer_video";
};

const SHELL_VIDEO_SOURCE = "drawer_video" as const;

const WHATSAPP_SHELL = "shell://whatsapp/";
const BUSINESS_SHELL = "shell://business/";

function hrefOf(link: SocialLinkJson): string {
  if ("href" in link) return link.href;
  return link.url ?? "";
}

function labelOf(link: SocialLinkJson): string {
  return link.label ?? "";
}

/** True if this row is reserved for the profile shell drawer. */
export function isShellReservedSocialLink(link: SocialLinkJson): boolean {
  const h = hrefOf(link);
  return h.startsWith(WHATSAPP_SHELL) || h.startsWith(BUSINESS_SHELL);
}

export function stripShellSocialLinks(links: unknown): SocialLinkJson[] {
  const arr = Array.isArray(links) ? (links as SocialLinkJson[]) : [];
  return arr.filter((l) => l && typeof l === "object" && !isShellReservedSocialLink(l));
}

export function stripShellEmbeddedVideos(embedded: unknown): EmbeddedMediaJson[] {
  const arr = Array.isArray(embedded) ? (embedded as EmbeddedMediaJson[]) : [];
  return arr.filter((e) => e && typeof e === "object" && e.shellSource !== SHELL_VIDEO_SOURCE);
}

function guessVideoProvider(url: string): string {
  const u = url.toLowerCase();
  if (u.includes("vimeo.com")) return "vimeo";
  if (u.includes("youtu.be") || u.includes("youtube.com")) return "youtube";
  if (u.includes("instagram.com")) return "instagram";
  return "youtube";
}

/** Digits only international number for WhatsApp shell URL. */
export function encodeShellWhatsappDigits(prefix: string, national: string): string {
  const digits = `${prefix.replace(/\D/g, "")}${national.replace(/\D/g, "")}`;
  return digits ? `${WHATSAPP_SHELL}${encodeURIComponent(digits)}` : "";
}

export function decodeShellWhatsappHref(href: string): string | null {
  if (!href.startsWith(WHATSAPP_SHELL)) return null;
  try {
    return decodeURIComponent(href.slice(WHATSAPP_SHELL.length));
  } catch {
    return null;
  }
}

export function encodeShellBusinessLine(text: string): string {
  const t = text.trim();
  return t ? `${BUSINESS_SHELL}${encodeURIComponent(t)}` : "";
}

export function decodeShellBusinessHref(href: string): string | null {
  if (!href.startsWith(BUSINESS_SHELL)) return null;
  try {
    return decodeURIComponent(href.slice(BUSINESS_SHELL.length));
  } catch {
    return null;
  }
}

export function mergeShellSocialAndEmbedded(input: {
  currentSocialLinks: unknown;
  currentEmbeddedMedia: unknown;
  videoLinks: string[];
  whatsappPrefix: string;
  whatsappNational: string;
  businessLine: string;
}): { social_links: SocialLinkJson[]; embedded_media: EmbeddedMediaJson[] } {
  let social = stripShellSocialLinks(input.currentSocialLinks);
  const embBase = stripShellEmbeddedVideos(input.currentEmbeddedMedia);

  const waHref = encodeShellWhatsappDigits(input.whatsappPrefix, input.whatsappNational);
  if (waHref) {
    social = [...social, { label: "Shell · WhatsApp", href: waHref }];
  }

  const bizHref = encodeShellBusinessLine(input.businessLine);
  if (bizHref) {
    social = [...social, { label: "Shell · Business line", href: bizHref }];
  }

  const videos = input.videoLinks.map((raw) => {
    const url = raw.trim();
    if (!url) return null;
    return {
      provider: guessVideoProvider(url),
      url,
      label: "Profile shell",
      shellSource: SHELL_VIDEO_SOURCE,
    } as EmbeddedMediaJson;
  }).filter((x): x is EmbeddedMediaJson => x !== null);

  return {
    social_links: social,
    embedded_media: [...embBase, ...videos],
  };
}

export function extractShellVideoUrls(embedded: unknown): string[] {
  const arr = Array.isArray(embedded) ? (embedded as EmbeddedMediaJson[]) : [];
  return arr.filter((e) => e?.shellSource === SHELL_VIDEO_SOURCE && e.url?.trim()).map((e) => e.url.trim());
}

export function findShellWhatsappHref(links: unknown): string | null {
  const arr = Array.isArray(links) ? (links as SocialLinkJson[]) : [];
  for (const l of arr) {
    if (!l || typeof l !== "object") continue;
    const h = hrefOf(l);
    const d = decodeShellWhatsappHref(h);
    if (d) return d;
  }
  return null;
}

export function findShellBusinessLine(links: unknown): string | null {
  const arr = Array.isArray(links) ? (links as SocialLinkJson[]) : [];
  for (const l of arr) {
    if (!l || typeof l !== "object") continue;
    const h = hrefOf(l);
    const t = decodeShellBusinessHref(h);
    if (t) return t;
  }
  return null;
}

// ─── Limits (UI = structured rows; DB = hardLimits / softLimits string[]) ───

export type ShellLimitsEntry = {
  id: string;
  category: string;
  label: string;
  enforcement: "hard" | "soft";
};

export type ShellLimitsDataV1 = {
  hardLimits: string[];
  softLimits: string[];
  customNote?: string;
};

export function limitsEntriesToData(entries: ShellLimitsEntry[]): ShellLimitsDataV1 {
  const hard: string[] = [];
  const soft: string[] = [];
  for (const e of entries) {
    const t = e.label?.trim();
    if (!t) continue;
    if (e.enforcement === "soft") soft.push(t);
    else hard.push(t);
  }
  return { hardLimits: hard, softLimits: soft };
}

export function limitsDataToEntries(data: unknown): ShellLimitsEntry[] {
  if (!data || typeof data !== "object" || Array.isArray(data)) return [];
  const o = data as Record<string, unknown>;
  const hardLimits = Array.isArray(o.hardLimits) ? (o.hardLimits as unknown[]).map(String) : [];
  const softLimits = Array.isArray(o.softLimits) ? (o.softLimits as unknown[]).map(String) : [];
  const out: ShellLimitsEntry[] = [];
  let i = 0;
  for (const label of hardLimits) {
    const t = label.trim();
    if (!t) continue;
    out.push({ id: `lim-h-${i++}`, category: "general", label: t, enforcement: "hard" });
  }
  for (const label of softLimits) {
    const t = label.trim();
    if (!t) continue;
    out.push({ id: `lim-s-${i++}`, category: "general", label: t, enforcement: "soft" });
  }
  return out;
}
