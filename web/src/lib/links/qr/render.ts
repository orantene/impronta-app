/**
 * Turning a QR matrix into something you can put on paper or a screen.
 *
 * SVG is the source of truth: it is resolution-independent, so the same call
 * serves a 24px preview and a 10cm table tent. PNG and PDF are produced from
 * the matrix directly rather than by rasterising the SVG, so none of them
 * depend on a browser.
 *
 * PRINT RULES, which are not decoration:
 *   - QUIET ZONE of 4 modules on every side. A code printed flush to the edge
 *     of a card, or against a coloured panel, fails to scan — the scanner uses
 *     the surrounding white to find the symbol at all. This is the single most
 *     common way a printed code fails in the field.
 *   - CONTRAST. Dark on light, and the caller is refused if the pair is too
 *     close. A scanner thresholds the image; a mid-grey on beige is not a
 *     colour choice, it is an unscannable code.
 *   - A LOGO in the centre requires error correction H, which is why
 *     `svgWithLogo` will not accept a lower level.
 */
import type { Matrix } from "./matrix";

/** Modules of clear space required on every side. Four is the standard's minimum. */
export const QUIET_ZONE = 4;

export type SvgOptions = {
  /** Dark module colour. Default black. */
  dark?: string;
  /** Background colour. Default white. */
  light?: string;
  /** Rounded module corners, purely cosmetic; both scan the same. */
  rounded?: boolean;
  /** Rendered edge length in px. Omit for a unit-less scalable symbol. */
  size?: number;
};

/** Relative luminance per WCAG, used for the contrast check. */
function luminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new Error(`colour must be a 6-digit hex like #1a1e22, got ${JSON.stringify(hex)}`);
  const v = parseInt(m[1]!, 16);
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel((v >> 16) & 255) + 0.7152 * channel((v >> 8) & 255) + 0.0722 * channel(v & 255);
}

/** WCAG contrast ratio between two hex colours, 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * The floor a printed code needs. 4.5 is the WCAG text threshold and is a
 * deliberately conservative choice here: scanners are more tolerant than eyes
 * in good light and far less tolerant in a dim bar, which is exactly where
 * these get scanned.
 */
export const MIN_CONTRAST = 4.5;

export function assertScannableContrast(dark: string, light: string): void {
  const ratio = contrastRatio(dark, light);
  if (ratio < MIN_CONTRAST) {
    throw new Error(
      `Those two colours have ${ratio.toFixed(1)}:1 contrast; a printed code needs at least ` +
        `${MIN_CONTRAST}:1 to scan reliably in low light. Darken the code or lighten the background.`,
    );
  }
}

/** Render the matrix as SVG, quiet zone included. */
export function toSvg(matrix: Matrix, options: SvgOptions = {}): string {
  const dark = options.dark ?? "#000000";
  const light = options.light ?? "#ffffff";
  assertScannableContrast(dark, light);

  const span = matrix.size + QUIET_ZONE * 2;
  const parts: string[] = [];
  for (let y = 0; y < matrix.size; y += 1) {
    for (let x = 0; x < matrix.size; x += 1) {
      if (!matrix.modules[y]![x]) continue;
      const px = x + QUIET_ZONE;
      const py = y + QUIET_ZONE;
      parts.push(
        options.rounded
          ? `<rect x="${px}" y="${py}" width="1" height="1" rx="0.28"/>`
          : `<rect x="${px}" y="${py}" width="1" height="1"/>`,
      );
    }
  }

  const dimensions = options.size ? ` width="${options.size}" height="${options.size}"` : "";
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${span} ${span}"${dimensions} ` +
    `shape-rendering="crispEdges" role="img">` +
    `<rect width="${span}" height="${span}" fill="${light}"/>` +
    `<g fill="${dark}">${parts.join("")}</g>` +
    `</svg>`
  );
}

/**
 * Module size in device pixels for a target physical width at a target DPI.
 *
 * Rounded DOWN to a whole number: a fractional module size makes the rasteriser
 * distribute the remainder unevenly, so some modules land a pixel wider than
 * their neighbours. A scanner reading module centres copes, but a cheap one
 * reading edges does not, and the failure only shows up on paper.
 */
export function modulePixels(matrix: Matrix, widthMm: number, dpi = 300): number {
  const span = matrix.size + QUIET_ZONE * 2;
  const targetPx = (widthMm / 25.4) * dpi;
  return Math.max(1, Math.floor(targetPx / span));
}

/**
 * A 1-bit-per-pixel bitmap of the symbol at `scale` device pixels per module,
 * quiet zone included. The caller turns this into PNG or draws it into a PDF.
 */
export function toBitmap(matrix: Matrix, scale: number): { size: number; pixels: Uint8Array } {
  if (!Number.isInteger(scale) || scale < 1) {
    throw new Error(`scale must be a whole number of pixels per module, got ${scale}`);
  }
  const span = (matrix.size + QUIET_ZONE * 2) * scale;
  const pixels = new Uint8Array(span * span); // 0 = light, 1 = dark
  for (let y = 0; y < matrix.size; y += 1) {
    for (let x = 0; x < matrix.size; x += 1) {
      if (!matrix.modules[y]![x]) continue;
      const ox = (x + QUIET_ZONE) * scale;
      const oy = (y + QUIET_ZONE) * scale;
      for (let dy = 0; dy < scale; dy += 1) {
        pixels.fill(1, (oy + dy) * span + ox, (oy + dy) * span + ox + scale);
      }
    }
  }
  return { size: span, pixels };
}
