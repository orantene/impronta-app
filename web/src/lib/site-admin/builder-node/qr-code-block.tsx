// QR code block — the `qr_code` native builder block's renderer.
//
// FORK (b), ruled: this is a PURE, SYNCHRONOUS, server-safe inline render — NOT
// a self-fetch island like reserve-table-island / session-picker-island, and it
// has NO `native-data-block-needs` entry. A QR is a deterministic function of
// the bound link: it needs the encoder, not a tenant fetch.
//
// The block stores the link CODE and composes the URL from the host
// (`<origin>/q/<code>`). It never stores or resolves the link's target or name:
// a print design is laid out once and printed, so a stale cached name on paper
// is worse than no name, and a designer waiting on a round trip to draw a square
// is the wrong trade. (See docs/plans/qr-code-block-a-map.md and, on main,
// docs/plans/print-canvas-design.md.)
//
// `encodeQr` / `toSvg` are the Q2 renderer (#1658), both synchronous, no
// `server-only`, no browser API — safe in SSR and in the editor canvas alike.
// `toPng` / `toPrintPdf` (qr/files.ts) are async + server-only and belong to the
// export pipeline (Piece B), never to this block.

import { encodeQr } from "@/lib/links/qr";
import {
  MIN_CONTRAST,
  contrastRatio,
  toSvg,
} from "@/lib/links/qr/render";

export interface QrCodeBlockProps {
  /** The bound link's code (Q1 `links.code`). Empty ⇒ unconfigured placeholder. */
  code: string;
  /**
   * The public origin the code resolves on, scheme included, no trailing slash
   * (e.g. "https://casarizo.com"). Supplied by render from the page's request
   * host; the block composes `<origin>/q/<code>`. Empty ⇒ the short link is
   * shown host-less but the symbol still encodes the path.
   */
  origin?: string;
  /** Dark module colour (the block's `foreground`). Default black. */
  dark?: string;
  /** Background colour. Default white. */
  light?: string;
  /** Rounded module corners — cosmetic; scans identically. */
  rounded?: boolean;
  /** Rendered pixel size of the symbol (the SVG scales; this is the box). */
  sizePx?: number;
  /** Localised caption under the code. Absent ⇒ no caption. */
  caption?: string;
  /** Show the typeable short-link line under the code. Default true. */
  showShortLink?: boolean;
}

const DEFAULT_DARK = "#000000";
const DEFAULT_LIGHT = "#ffffff";

/** `<origin>/q/<code>` — the scannable URL. `origin` may be empty in previews. */
export function composeQrUrl(origin: string | undefined, code: string): string {
  const base = (origin ?? "").replace(/\/+$/, "");
  return `${base}/q/${code}`;
}

/** The typeable short link shown to a human: host + path, no scheme. */
export function shortLinkLabel(origin: string | undefined, code: string): string {
  const host = (origin ?? "").replace(/^https?:\/\//, "").replace(/\/+$/, "");
  return host ? `${host}/q/${code}` : `/q/${code}`;
}

export function QrCodeBlock({
  code,
  origin,
  dark = DEFAULT_DARK,
  light = DEFAULT_LIGHT,
  rounded = false,
  sizePx = 160,
  caption,
  showShortLink = true,
}: QrCodeBlockProps) {
  // Unconfigured: no link bound yet. Render a visible placeholder rather than a
  // QR of a dangling `/q/` — the editor shows the operator what to do.
  if (!code.trim()) {
    return (
      <div
        className="site-builder-node--qr-code site-builder-node--qr-code-empty"
        data-qr-code="empty"
        style={{
          display: "inline-flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 8,
          padding: 16,
          fontSize: 13,
          color: "rgba(0,0,0,0.55)",
          border: "1px dashed rgba(0,0,0,0.25)",
          borderRadius: 6,
        }}
      >
        <span style={{ fontWeight: 600 }}>QR code</span>
        <span>Pick a link to generate the code.</span>
      </div>
    );
  }

  const url = composeQrUrl(origin, code);

  // Contrast is enforced hard at export (toPrintPdf refuses) and at authoring
  // (the inspector prevents a low-contrast pair). Here — on a live page — never
  // throw and never ship an unscannable code: below the floor, fall back to
  // black-on-white so the rendered code always scans. The chosen colour still
  // wins whenever it is legible.
  const legible = contrastRatio(dark, light) >= MIN_CONTRAST;
  const renderDark = legible ? dark : DEFAULT_DARK;
  const renderLight = legible ? light : DEFAULT_LIGHT;

  let svg: string | null = null;
  try {
    svg = toSvg(encodeQr(url, { ecc: "M" }).matrix, {
      dark: renderDark,
      light: renderLight,
      rounded,
    });
  } catch {
    // encodeQr throws when the URL will not fit a version-10 symbol. A builder
    // block on a live page must degrade, not crash the render.
    svg = null;
  }

  return (
    <div
      className="site-builder-node--qr-code"
      data-qr-code="root"
      style={{
        display: "inline-flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
      }}
    >
      {svg ? (
        <span
          data-qr-code="symbol"
          aria-label={`QR code linking to ${shortLinkLabel(origin, code)}`}
          role="img"
          style={{ display: "block", width: sizePx, height: sizePx }}
          // Own generated SVG string (no user HTML); safe to inline.
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ) : (
        <span data-qr-code="too-long" style={{ fontSize: 13, color: "rgba(0,0,0,0.55)" }}>
          This link is too long to encode. Shorten it.
        </span>
      )}
      {caption ? (
        <span data-qr-code="caption" style={{ fontSize: 13, textAlign: "center" }}>
          {caption}
        </span>
      ) : null}
      {showShortLink ? (
        <span
          data-qr-code="short-link"
          style={{ fontSize: 12, opacity: 0.7, fontVariantNumeric: "tabular-nums" }}
        >
          {shortLinkLabel(origin, code)}
        </span>
      ) : null}
    </div>
  );
}
