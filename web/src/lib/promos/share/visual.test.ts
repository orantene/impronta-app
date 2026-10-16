import test from "node:test";
import assert from "node:assert/strict";

import { createRequire } from "node:module";
import {
  displayUrl, parseFormat, parseLang, parseStyle, pdfSafe, resolveStyle, safeHex, sanitizeColors,
  SHARE_SIZES, stylePalette, DEFAULT_SHARE_COLORS,
} from "./visual-model";

test("sizes: story is 9:16, post is 1:1", () => {
  assert.equal(SHARE_SIZES.story.width / SHARE_SIZES.story.height, 9 / 16);
  assert.equal(SHARE_SIZES.post.width, SHARE_SIZES.post.height);
});

test("colors: invalid values fall back, valid are normalised", () => {
  assert.equal(safeHex("FFAA00", "#000000"), "#ffaa00");
  assert.equal(safeHex("red; background:url(x)", "#111111"), "#111111");
  assert.equal(safeHex(undefined, "#111111"), "#111111");
  assert.deepEqual(sanitizeColors({ bg: "zzz" }), DEFAULT_SHARE_COLORS);
});

test("parse helpers and style fallback", () => {
  assert.equal(parseFormat("story"), "story");
  assert.equal(parseFormat("gif"), null);
  assert.equal(parseStyle("nope"), "theme");
  assert.equal(parseStyle("photo"), "photo");
  assert.equal(parseLang("en"), "en");
  assert.equal(parseLang("fr"), "es");
  assert.equal(resolveStyle("photo", null), "bold");
  assert.equal(resolveStyle("photo", "http://insecure/x.jpg"), "bold");
  assert.equal(resolveStyle("photo", "https://cdn/x.jpg"), "photo");
  assert.equal(resolveStyle("theme", null), "theme");
  assert.equal(stylePalette("theme", DEFAULT_SHARE_COLORS).bg, DEFAULT_SHARE_COLORS.bg);
});

test("displayUrl and pdfSafe", () => {
  assert.equal(displayUrl("https://ana.mx/p/gel-20?via=wa"), "ana.mx/p/gel-20");
  assert.equal(pdfSafe("Hola ✨ — mundo é"), "Hola - mundo é");
});

// pdf-lib is a web dependency; skip (not fail) where node_modules lacks it.
const hasPdfLib = (() => {
  try { createRequire(import.meta.url).resolve("pdf-lib"); return true; } catch { return false; }
})();

test("printable card is a one-page A6 PDF", { skip: !hasPdfLib && "pdf-lib not installed in this worktree" }, async () => {
  const { buildPromoCardPdf, A6 } = await import("./card-pdf");
  const bytes = await buildPromoCardPdf({
    lang: "es", talentName: "Ana Nails", headline: "20% de descuento",
    condition: "lunes a miércoles", link: "https://ana.mx/p/gel-20?via=qr_print",
  });
  assert.equal(Buffer.from(bytes.slice(0, 5)).toString(), "%PDF-");
  const { PDFDocument } = await import("pdf-lib");
  const doc = await PDFDocument.load(bytes);
  assert.equal(doc.getPageCount(), 1);
  const { width, height } = doc.getPage(0).getSize();
  assert.ok(Math.abs(width - A6.width) < 0.5 && Math.abs(height - A6.height) < 0.5);
});

test("sheet model: WhatsApp first on ES, asset urls, caption fill", async () => {
  const { channelOrder, shareAssetUrl, captionTemplate, fillCaption } = await import("./sheet-model");
  assert.equal(channelOrder("es")[0], "whatsapp");
  assert.equal(channelOrder("en")[0], "instagram");
  assert.equal(shareAssetUrl("p1", "story"), "/api/promos/share/p1/story");
  assert.equal(
    shareAssetUrl("p1", "post", { style: "bold", lang: "en", colors: { bg: "#fff000" }, qr: true, download: true }),
    "/api/promos/share/p1/post?style=bold&lang=en&bg=fff000&qr=1&download=1",
  );
  const tpl = captionTemplate({
    promo: { id: "x", offer_kind: "percent", value: 15, currency: "MXN", scope: "all", audience: "public", unlock: "link", applies_on: "appointment", tz: "America/Mexico_City" },
    lang: "es",
  });
  assert.match(tpl, /\{link\}/);
  assert.match(fillCaption(tpl, "https://x/p/a?via=wa"), /Reserva aquí: https:\/\/x\/p\/a\?via=wa/);
});
