import { ImageResponse } from "next/og";

import { encodeQr } from "@/lib/links/qr";
import { assertScannableContrast, toSvg } from "@/lib/links/qr/render";
import {
  displayUrl, resolveStyle, SHARE_COPY, SHARE_SIZES, stylePalette,
  type ShareColors, type ShareFormat, type ShareStyle,
} from "./visual-model";
import type { ShareLang } from "./captions";

export type ShareVisualInput = {
  format: ShareFormat;
  style: ShareStyle;
  lang: ShareLang;
  /** "20% de descuento" */
  headline: string;
  /** "lunes a miércoles · solo 3 lugares" */
  condition: string | null;
  talentName: string;
  link: string;
  colors: ShareColors;
  photoUrl?: string | null;
  withQr?: boolean;
};

function qrDataUri(link: string, dark: string, light: string): string | null {
  try {
    assertScannableContrast(dark, light);
    const svg = toSvg(encodeQr(link, { ecc: "M" }).matrix, { dark, light, size: 240 });
    return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  } catch {
    return null;
  }
}

/** Story 9:16 and post 1:1 in the three styles. Server rendered, site language. */
export function renderShareVisual(input: ShareVisualInput): ImageResponse {
  const style = resolveStyle(input.style, input.photoUrl);
  const { width, height } = SHARE_SIZES[input.format];
  const p = stylePalette(style, input.colors);
  const story = input.format === "story";
  const copy = SHARE_COPY[input.lang];
  const qr = input.withQr ? qrDataUri(input.link, "#111111", "#ffffff") : null;
  const big = story ? 128 : 112;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%", display: "flex", flexDirection: "column",
          justifyContent: "space-between", background: p.bg, color: p.fg,
          padding: story ? "140px 90px" : "90px", position: "relative",
        }}
      >
        {style === "photo" && input.photoUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={input.photoUrl} alt="" width={width} height={height}
              style={{ position: "absolute", top: 0, left: 0, width, height, objectFit: "cover" }} />
            <div style={{ position: "absolute", top: 0, left: 0, width, height, background: "rgba(0,0,0,0.5)", display: "flex" }} />
          </>
        ) : null}
        <div style={{ display: "flex", fontSize: 40, letterSpacing: 2, opacity: 0.85, position: "relative" }}>
          {input.talentName}
        </div>
        <div style={{ display: "flex", flexDirection: "column", position: "relative" }}>
          <div style={{ display: "flex", fontSize: big, fontWeight: 800, lineHeight: 1.04 }}>{input.headline}</div>
          {input.condition ? (
            <div style={{ display: "flex", fontSize: 44, marginTop: 36, opacity: 0.9 }}>{input.condition}</div>
          ) : null}
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", position: "relative" }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{
              display: "flex", fontSize: 40, fontWeight: 700, padding: "22px 44px",
              borderRadius: 999, background: p.accent, color: p.accentFg,
            }}>
              {copy.cta}
            </div>
            <div style={{ display: "flex", fontSize: 30, marginTop: 24, opacity: 0.8 }}>{displayUrl(input.link)}</div>
          </div>
          {qr ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt="" width={240} height={240} style={{ borderRadius: 16 }} />
          ) : null}
        </div>
      </div>
    ),
    { width, height },
  );
}

export const PROMO_OG_SIZE = { width: 1200, height: 630 } as const;

/** 1200x630 link-preview card. `headline` null = the generic personal/unavailable card. */
export function renderPromoOgCard(input: {
  lang: ShareLang;
  talentName: string;
  headline: string | null;
  condition: string | null;
  colors: ShareColors;
}): ImageResponse {
  const generic = input.lang === "es" ? "Una oferta para ti" : "An offer for you";
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%", display: "flex", flexDirection: "column",
          justifyContent: "space-between", background: input.colors.bg, color: input.colors.ink, padding: "72px 80px",
        }}
      >
        <div style={{ display: "flex", fontSize: 34, opacity: 0.8 }}>{input.talentName}</div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 84, fontWeight: 800, lineHeight: 1.05 }}>{input.headline ?? generic}</div>
          {input.headline && input.condition ? (
            <div style={{ display: "flex", fontSize: 36, marginTop: 24, opacity: 0.85 }}>{input.condition}</div>
          ) : null}
        </div>
        <div style={{ display: "flex", fontSize: 32, fontWeight: 700, color: input.colors.accent }}>
          {SHARE_COPY[input.lang].cta}
        </div>
      </div>
    ),
    PROMO_OG_SIZE,
  );
}
