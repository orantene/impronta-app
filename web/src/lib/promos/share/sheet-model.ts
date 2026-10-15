import { buildCaption, type ShareLang } from "./captions";
import type { ShareColors, ShareStyle } from "./visual-model";
import type { Promo } from "@/lib/promos/types";

/** Pure model for the share sheet: channel order, asset URLs, caption templates. Client-safe. */
export type ShareChannel = "whatsapp" | "instagram" | "tiktok";

/** WhatsApp first on Spanish sites (likely the #1 channel in MX). */
export function channelOrder(lang: ShareLang): ShareChannel[] {
  return lang === "es" ? ["whatsapp", "instagram", "tiktok"] : ["instagram", "whatsapp", "tiktok"];
}

export function shareAssetUrl(
  promoId: string,
  asset: "story" | "post" | "card",
  opts: {
    style?: ShareStyle;
    lang?: ShareLang;
    host?: string | null;
    colors?: Partial<ShareColors>;
    qr?: boolean;
    download?: boolean;
    photoUrl?: string | null;
  } = {},
): string {
  const q = new URLSearchParams();
  if (opts.style && opts.style !== "theme") q.set("style", opts.style);
  if (opts.lang) q.set("lang", opts.lang);
  if (opts.host) q.set("host", opts.host);
  for (const k of ["bg", "ink", "accent"] as const) {
    const v = opts.colors?.[k];
    if (v) q.set(k, v.replace(/^#/, ""));
  }
  if (opts.photoUrl) q.set("photo", opts.photoUrl);
  if (opts.qr) q.set("qr", "1");
  if (opts.download) q.set("download", "1");
  const qs = q.toString();
  return `/api/promos/share/${encodeURIComponent(promoId)}/${asset}${qs ? `?${qs}` : ""}`;
}

const LINK_TOKEN = "{link}";

/** Caption with a `{link}` placeholder: the sheet fills in the per-channel tagged link. */
export function captionTemplate(input: { promo: Promo; lang: ShareLang; addonName?: string | null; spotsLeft?: number | null; hashtags?: readonly string[] }): string {
  return buildCaption({ ...input, link: LINK_TOKEN });
}

export function fillCaption(template: string, link: string): string {
  return template.split(LINK_TOKEN).join(link);
}
