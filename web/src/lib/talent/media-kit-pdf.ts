/**
 * media-kit-pdf.ts — render a `TalentMediaKitModel` to PDF bytes.
 *
 * DEPENDENCY NOTE: uses `pdf-lib`, already a dependency and already the
 * PDF path for `api/talent/tax-summary` and `payments/booking-confirmation-pdf`.
 * No new dependency was added for the EPK — a headless-browser or React-PDF
 * renderer would have been a far heavier addition for one A4 document.
 *
 * IMAGE SAFETY: the only images embedded are ones whose URL passes
 * `isAllowedLogoUrl` — https, on the configured Supabase project host, under
 * `/storage/v1/`. Media URLs are derived from our own storage rows, but the
 * allowlist is re-applied here so this module cannot be turned into an SSRF
 * primitive by a future caller that trusts a user-supplied URL. A photo that
 * fails the check, fails to download, or is not a JPEG/PNG is silently
 * skipped — a missing photo must never fail the whole kit.
 */

import { PDFDocument, StandardFonts, rgb, PageSizes, type PDFImage } from "pdf-lib";
import { isAllowedLogoUrl } from "@/lib/media/logo-url-allowlist";
import type { TalentMediaKitModel } from "@/lib/talent/media-kit-model";

const PAGE_W = PageSizes.A4[0];
const PAGE_H = PageSizes.A4[1];
const ML = 50;
const MR = 50;
const CW = PAGE_W - ML - MR;

/** Cap on bytes pulled per image, so one huge original cannot blow the Function. */
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const IMAGE_FETCH_TIMEOUT_MS = 6000;

function fmtDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" }).format(
      new Date(iso),
    );
  } catch {
    return iso;
  }
}

type FetchedImage = { bytes: Uint8Array; kind: "jpg" | "png" };

/**
 * Download one image, origin-checked and size-capped. Returns null on any
 * problem at all — the caller treats a null as "draw nothing here".
 */
async function fetchEmbeddableImage(url: string): Promise<FetchedImage | null> {
  if (!isAllowedLogoUrl(url)) return null;

  let res: Response;
  try {
    res = await fetch(url, {
      redirect: "error",
      signal: AbortSignal.timeout(IMAGE_FETCH_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;

  const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
  const kind: FetchedImage["kind"] | null = contentType.includes("png")
    ? "png"
    : contentType.includes("jpeg") || contentType.includes("jpg")
      ? "jpg"
      : null;
  if (!kind) return null;

  const declared = Number(res.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > MAX_IMAGE_BYTES) return null;

  let buffer: ArrayBuffer;
  try {
    buffer = await res.arrayBuffer();
  } catch {
    return null;
  }
  if (buffer.byteLength === 0 || buffer.byteLength > MAX_IMAGE_BYTES) return null;

  return { bytes: new Uint8Array(buffer), kind };
}

async function embed(pdf: PDFDocument, url: string | null): Promise<PDFImage | null> {
  if (!url) return null;
  const fetched = await fetchEmbeddableImage(url);
  if (!fetched) return null;
  try {
    return fetched.kind === "png"
      ? await pdf.embedPng(fetched.bytes)
      : await pdf.embedJpg(fetched.bytes);
  } catch {
    return null;
  }
}

/** Render the media kit. Deterministic apart from the images it manages to fetch. */
export async function generateTalentMediaKitPdf(
  model: TalentMediaKitModel,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const ink = rgb(0.043, 0.043, 0.051);
  const muted = rgb(0.44, 0.44, 0.47);
  const border = rgb(0.82, 0.82, 0.84);

  pdf.setTitle(`${model.displayName} — Media kit`);
  pdf.setAuthor(model.displayName);
  pdf.setProducer(model.brandName);
  pdf.setCreator(model.brandName);

  let page = pdf.addPage(PageSizes.A4);
  let cursor = 48; // distance from the top of the page
  const yFromTop = (c: number) => PAGE_H - c;

  function newPage() {
    page = pdf.addPage(PageSizes.A4);
    cursor = 48;
  }

  function ensureSpace(needed: number) {
    if (cursor + needed > PAGE_H - 56) newPage();
  }

  /** Greedy word-wrap. Returns the lines it drew so callers can advance. */
  function wrap(text: string, size: number, maxWidth: number, bold = false): string[] {
    const f = bold ? fontBold : font;
    const lines: string[] = [];
    for (const paragraph of text.split(/\r?\n/)) {
      let line = "";
      for (const word of paragraph.split(/\s+/).filter(Boolean)) {
        const test = line ? `${line} ${word}` : word;
        if (f.widthOfTextAtSize(test, size) > maxWidth && line) {
          lines.push(line);
          line = word;
        } else {
          line = test;
        }
      }
      lines.push(line);
    }
    return lines;
  }

  function drawText(
    text: string,
    opts: {
      x?: number;
      size?: number;
      bold?: boolean;
      color?: ReturnType<typeof rgb>;
      maxWidth?: number;
    } = {},
  ) {
    const f = opts.bold ? fontBold : font;
    const size = opts.size ?? 10;
    const maxWidth = opts.maxWidth ?? CW;
    let t = text;
    while (t.length > 1 && f.widthOfTextAtSize(t, size) > maxWidth) t = t.slice(0, -1);
    page.drawText(t, {
      x: opts.x ?? ML,
      y: yFromTop(cursor),
      size,
      font: f,
      color: opts.color ?? ink,
    });
  }

  function drawParagraph(text: string, size = 10, color = ink, maxWidth = CW) {
    const lineHeight = size * 1.5;
    for (const line of wrap(text, size, maxWidth)) {
      ensureSpace(lineHeight + 8);
      drawText(line, { size, color, maxWidth });
      cursor += lineHeight;
    }
  }

  function rule(color = border, thickness = 0.5) {
    page.drawLine({
      start: { x: ML, y: yFromTop(cursor) },
      end: { x: PAGE_W - MR, y: yFromTop(cursor) },
      thickness,
      color,
    });
  }

  function sectionHeading(label: string) {
    ensureSpace(48);
    cursor += 10;
    drawText(label.toUpperCase(), { size: 8, bold: true, color: muted });
    cursor += 12;
    rule();
    cursor += 16;
  }

  // ── Cover block: headshot left, identity right ──────────────────────
  const headshot = await embed(pdf, model.headshotUrl);
  const coverH = 150;
  const coverW = 118;
  const textX = headshot ? ML + coverW + 20 : ML;
  const textW = headshot ? CW - coverW - 20 : CW;

  if (headshot) {
    const scaled = headshot.scaleToFit(coverW, coverH);
    page.drawRectangle({
      x: ML,
      y: yFromTop(cursor + coverH),
      width: coverW,
      height: coverH,
      color: rgb(0.96, 0.96, 0.97),
      borderColor: border,
      borderWidth: 0.5,
    });
    page.drawImage(headshot, {
      x: ML + (coverW - scaled.width) / 2,
      y: yFromTop(cursor + coverH) + (coverH - scaled.height) / 2,
      width: scaled.width,
      height: scaled.height,
    });
  }

  const coverTop = cursor;
  cursor += 22;
  drawText(model.displayName, { x: textX, size: 22, bold: true, maxWidth: textW });
  cursor += 22;

  const typeLine = model.talentTypeLabels.length
    ? model.talentTypeLabels.join("  ·  ")
    : model.primaryTypeLabel;
  if (typeLine) {
    drawText(typeLine, { x: textX, size: 10, color: muted, maxWidth: textW });
    cursor += 16;
  }
  if (model.locationLabel) {
    drawText(model.locationLabel, { x: textX, size: 10, color: muted, maxWidth: textW });
    cursor += 16;
  }
  if (model.priceLabel) {
    cursor += 4;
    drawText(model.priceLabel, { x: textX, size: 12, bold: true, maxWidth: textW });
    cursor += 18;
  }
  if (model.headline) {
    cursor += 2;
    for (const line of wrap(model.headline, 10, textW)) {
      drawText(line, { x: textX, size: 10, color: muted, maxWidth: textW });
      cursor += 15;
    }
  }

  // The cover block is as tall as the taller of the two columns.
  cursor = Math.max(cursor, coverTop + (headshot ? coverH : 0));
  cursor += 22;
  rule(ink, 1);
  cursor += 6;

  // ── About ───────────────────────────────────────────────────────────
  if (model.bio) {
    sectionHeading("About");
    drawParagraph(model.bio, 10.5, ink);
  }

  // ── Selected work ───────────────────────────────────────────────────
  if (model.photos.length > 0) {
    const embedded: PDFImage[] = [];
    for (const photo of model.photos) {
      const img = await embed(pdf, photo.url);
      if (img) embedded.push(img);
    }

    if (embedded.length > 0) {
      sectionHeading("Selected work");
      const cols = 3;
      const gap = 12;
      const cellW = (CW - gap * (cols - 1)) / cols;
      const cellH = cellW * 1.25;

      for (let i = 0; i < embedded.length; i += cols) {
        ensureSpace(cellH + 16);
        const rowTop = cursor;
        for (let c = 0; c < cols; c += 1) {
          const img = embedded[i + c];
          if (!img) break;
          const x = ML + c * (cellW + gap);
          const boxY = yFromTop(rowTop + cellH);
          page.drawRectangle({
            x,
            y: boxY,
            width: cellW,
            height: cellH,
            color: rgb(0.96, 0.96, 0.97),
            borderColor: border,
            borderWidth: 0.5,
          });
          const scaled = img.scaleToFit(cellW - 6, cellH - 6);
          page.drawImage(img, {
            x: x + (cellW - scaled.width) / 2,
            y: boxY + (cellH - scaled.height) / 2,
            width: scaled.width,
            height: scaled.height,
          });
        }
        cursor = rowTop + cellH + gap;
      }
    }
  }

  // ── Contact / booking ───────────────────────────────────────────────
  sectionHeading("Booking");
  if (model.profileUrl) {
    drawParagraph(
      `Enquiries go through the profile below. Every message lands in the ${model.brandName} inbox with availability, rates and contracting in one place.`,
      10,
      ink,
    );
    cursor += 4;
    ensureSpace(24);
    drawText(model.profileUrl, { size: 11, bold: true });
    cursor += 18;
  } else {
    drawParagraph(
      `Enquiries go through the ${model.brandName} profile. Publish the profile to include a booking link in this kit.`,
      10,
      muted,
    );
  }

  // ── Footer on every page ────────────────────────────────────────────
  const footer = model.profileCode
    ? `${model.brandName}  ·  ${model.displayName}  ·  ${model.profileCode}  ·  Generated ${fmtDate(model.generatedAtISO)}`
    : `${model.brandName}  ·  ${model.displayName}  ·  Generated ${fmtDate(model.generatedAtISO)}`;
  for (const p of pdf.getPages()) {
    p.drawText(footer, { x: ML, y: 30, size: 7.5, font, color: muted });
  }

  return pdf.save();
}
