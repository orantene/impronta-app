/**
 * `toPrintPdfDesign` — the four refusals, and the geometry they protect.
 *
 * These assert BEHAVIOUR (a real PDF, real refusals) rather than source text,
 * because a printed piece that fails does so silently: nobody reports an
 * unscannable tent, they just stop scanning it.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { PrintDesignRefusal, toPrintPdfDesign } from "./print-export";
import type { PrintDesign } from "./print-design";

const SHORT = "https://a.co/q/t7";
// A long code encodes to a larger matrix in the SAME slot: smaller modules.
const LONG = `https://tenant.example.com/q/${"x".repeat(180)}`;

function design(over: Partial<PrintDesign> = {}): PrintDesign {
  return {
    size: "table_tent",
    bleedMm: 3,
    qr: { xMm: 20, yMm: 40, sizeMm: 60 },
    ...over,
  };
}

test("it produces a real PDF, one page per item", async () => {
  const bytes = await toPrintPdfDesign(
    [{ url: SHORT, title: "Table 7" }, { url: SHORT, title: "Table 8" }],
    design({ title: { xMm: 50, yMm: 20, sizePt: 18, bold: true } }),
  );
  assert.equal(new TextDecoder().decode(bytes.slice(0, 5)), "%PDF-");
  // Parse it rather than grepping the bytes: PDF object streams are compressed,
  // so a regex over the raw file counts whatever happened to stay literal.
  const { PDFDocument } = await import("pdf-lib");
  assert.equal((await PDFDocument.load(bytes)).getPageCount(), 2, "one page per item");
});

test("REFUSAL: a code too pale to scan is refused, not warned about", async () => {
  await assert.rejects(
    () => toPrintPdfDesign([{ url: SHORT }], design({ qr: { xMm: 20, yMm: 40, sizeMm: 60, darkHex: "#cccccc" } })),
    (e: unknown) => e instanceof PrintDesignRefusal && e.reason === "contrast",
  );
});

test("REFUSAL: the slot is checked PER PAGE, so a fan-out cannot pass on its shortest link", async () => {
  // This is the whole reason validation is per-page. The short code fits the
  // slot; the long one does not. A single up-front check would have passed on
  // the short URL and shipped the long one unscannable.
  const d = design({ qr: { xMm: 20, yMm: 40, sizeMm: 22 } });
  await assert.doesNotReject(() => toPrintPdfDesign([{ url: SHORT }], d));
  await assert.rejects(
    () => toPrintPdfDesign([{ url: SHORT, title: "Table 7" }, { url: LONG, title: "Table 8" }], d),
    (e: unknown) => e instanceof PrintDesignRefusal && e.reason === "slot_too_small",
  );
});

test("the slot refusal NAMES the offending code, because a fan-out has many", async () => {
  await assert.rejects(
    () => toPrintPdfDesign(
      [{ url: SHORT, title: "Table 7" }, { url: LONG, title: "Table 8" }],
      design({ qr: { xMm: 20, yMm: 40, sizeMm: 22 } }),
    ),
    (e: unknown) => e instanceof Error && e.message.includes("Table 8"),
  );
});

test("REFUSAL: a logo over the code is bounded by the correction budget, not exempted by ecc H", async () => {
  // Slice 1's type exempts any logo at "H". An arbitrarily large one still
  // destroys the symbol, so the exporter bounds it by AREA.
  const png = await (await import("sharp")).default({
    create: { width: 8, height: 8, channels: 3, background: "#000" },
  }).png().toBuffer();

  const huge = { png: new Uint8Array(png), xMm: 20, yMm: 40, wMm: 50, hMm: 50 };
  await assert.rejects(
    () => toPrintPdfDesign([{ url: SHORT }], design({ qr: { xMm: 20, yMm: 40, sizeMm: 60, ecc: "H" }, logo: huge })),
    (e: unknown) => e instanceof PrintDesignRefusal && e.reason === "logo_over_code",
    "a logo covering most of the code must be refused even at ecc H",
  );

  // A small mark within budget at H is allowed: that is the legitimate case.
  const small = { ...huge, wMm: 12, hMm: 12, xMm: 44, yMm: 64 };
  await assert.doesNotReject(
    () => toPrintPdfDesign([{ url: SHORT }], design({ qr: { xMm: 20, yMm: 40, sizeMm: 60, ecc: "H" }, logo: small })),
  );
});

test("a logo that does not touch the code is never refused", async () => {
  const png = await (await import("sharp")).default({
    create: { width: 8, height: 8, channels: 3, background: "#000" },
  }).png().toBuffer();
  await assert.doesNotReject(() =>
    toPrintPdfDesign([{ url: SHORT }], design({
      logo: { png: new Uint8Array(png), xMm: 2, yMm: 2, wMm: 15, hMm: 10 },
    })),
  );
});

test("a refusal throws BEFORE any page is drawn", async () => {
  // A half-written PDF is worse than none: it downloads, opens, and gets
  // printed. Every refusal is computable from millimetres, so all of them
  // happen before the document exists.
  await assert.rejects(
    () => toPrintPdfDesign([{ url: SHORT }], design({ qr: { xMm: 0, yMm: 0, sizeMm: 60, darkHex: "#eeeeee" } })),
    (e: unknown) => e instanceof PrintDesignRefusal,
  );
});

test("bleed is validated, and the page is bigger than the trim box by twice the bleed", async () => {
  await assert.rejects(() => toPrintPdfDesign([{ url: SHORT }], design({ bleedMm: 40 })), /between 0 and 10/);

  const { PDFDocument } = await import("pdf-lib");
  const bytes = await toPrintPdfDesign([{ url: SHORT }], design({ bleedMm: 3 }));
  const doc = await PDFDocument.load(bytes);
  const { width, height } = doc.getPage(0).getSize();
  const MM = 72 / 25.4;
  // table_tent is 100x150mm trim, so 106x156mm at 3mm bleed.
  assert.ok(Math.abs(width - 106 * MM) < 0.5, `width ${width} should be 106mm`);
  assert.ok(Math.abs(height - 156 * MM) < 0.5, `height ${height} should be 156mm`);
});

test("an empty item list is refused rather than producing a zero-page PDF", async () => {
  await assert.rejects(() => toPrintPdfDesign([], design()), /Nothing to print/);
});

async function pngBytes(w = 40, h = 20) {
  const sharp = (await import("sharp")).default;
  return new Uint8Array(
    await sharp({ create: { width: w, height: h, channels: 3, background: "#334455" } })
      .png()
      .toBuffer(),
  );
}

test("a full-bleed background PHOTOGRAPH is drawn, not dropped and not mistaken for a logo", async () => {
  // The ruled palette offers `image` for "logo / full-bleed background image",
  // and PrintDesign could only carry a hex fill. Without a home, the extractor
  // had two silent wrongs available: drop the photo, or map it to `logo` — where
  // it covers the card, trips the logo-over-code refusal, and tells the operator
  // to move their own background off the code.
  const png = await pngBytes();
  const withPhoto = await toPrintPdfDesign(
    [{ url: SHORT }],
    design({ backgroundImage: { png } }),
  );
  const withoutPhoto = await toPrintPdfDesign([{ url: SHORT }], design());
  assert.ok(
    withPhoto.byteLength > withoutPhoto.byteLength,
    "the PDF must actually carry the embedded photograph",
  );
});

test("a background photograph is NOT refused as a logo over the code", async () => {
  // The whole point of the separate field. As `logo` this exact image would
  // cover 100% of the QR slot and be refused; as a background it is fine,
  // because the code draws its own opaque backing on top of it.
  const png = await pngBytes();
  await assert.doesNotReject(() =>
    toPrintPdfDesign(
      [{ url: SHORT }],
      design({ backgroundImage: { png }, qr: { xMm: 20, yMm: 40, sizeMm: 60, ecc: "L" } }),
    ),
    "a background photograph must never be treated as a logo occluding the code",
  );
});

test("cover is the default fit, because letterboxing a bleed defeats bleed", async () => {
  // A background that does not reach the bleed edge leaves a white hairline at
  // the trim — the exact defect bleed exists to prevent. An extreme aspect ratio
  // is the case that would letterbox if fit were ignored.
  const wide = await pngBytes(400, 10);
  await assert.doesNotReject(() =>
    toPrintPdfDesign([{ url: SHORT }], design({ backgroundImage: { png: wide } })),
  );
  await assert.doesNotReject(() =>
    toPrintPdfDesign([{ url: SHORT }], design({ backgroundImage: { png: wide, fit: "stretch" } })),
  );
});

// ── The client size list must match the server's ────────────────────────────

test("PRINT_SIZE_OPTIONS matches PRINT_SIZES exactly", async () => {
  // The two lists are separate because qr/files.ts is `server-only` and the
  // popover is a client component — importing one from the other pulls server
  // code into the client bundle and fails the build. Separate lists can drift,
  // and a drifted list offers the operator a size the endpoint then REFUSES,
  // so the duplication is paid for here.
  const { PRINT_SIZE_OPTIONS } = await import("./share-targets");
  const { PRINT_SIZES } = await import("./qr/files");

  assert.deepEqual(
    PRINT_SIZE_OPTIONS.map((o) => o.key).sort(),
    Object.keys(PRINT_SIZES).sort(),
    "the popover offers a different set of sizes than the endpoint accepts",
  );

  for (const opt of PRINT_SIZE_OPTIONS) {
    const real = PRINT_SIZES[opt.key as keyof typeof PRINT_SIZES];
    assert.equal(
      opt.dims,
      `${real.widthMm} × ${real.heightMm} mm`,
      `${opt.key}: the label's dimensions do not match the real page size`,
    );
  }
});
