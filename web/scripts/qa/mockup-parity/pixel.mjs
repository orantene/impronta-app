/**
 * Perceptual (pixel) diff for mockup parity. The canvas diff is lifted from
 * scripts/design-diff.mts so both tools agree: both images are scaled to the
 * narrower width, padded white to the taller height, and a pixel is "bad" when
 * its summed RGB distance exceeds PIXEL_DISTANCE. The mismatch ratio is
 * bad / (w * h), so a height difference between mockup and product counts as
 * mismatch too (the padded strip is bad pixels), and is also reported on its own.
 *
 * Everything runs in a headless canvas (no pixelmatch / sharp dependency).
 */

export const PIXEL_DISTANCE = 48;

/** CSS that freezes motion without hiding anything: zero-length animations end at their final frame. */
const FREEZE_CSS = `*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition-duration:0s!important;transition-delay:0s!important;scroll-behavior:auto!important;caret-color:transparent!important}`;

/** Make a page deterministic before any section is cropped: no motion, fonts loaded, images decoded. */
export async function preparePage(page) {
  await page.addStyleTag({ content: FREEZE_CSS }).catch(() => {});
  await page
    .evaluate(async () => {
      const fontsReady = () => (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve());
      await fontsReady();
      const imgs = Array.from(document.images);
      for (const i of imgs) i.loading = "eager";
      await Promise.all(imgs.map((i) => (i.decode ? i.decode().catch(() => {}) : Promise.resolve())));
      await fontsReady();
    })
    .catch(() => {});
  await page.waitForTimeout(150);
}

/** A helper page that does the canvas work. Call close() when done. */
export async function createImageTool(browser) {
  const ctx = await browser.newContext({ viewport: { width: 400, height: 300 } });
  const page = await ctx.newPage();
  await page.setContent("<!doctype html><title>img</title>");
  const b64 = (buf) => buf.toString("base64");

  return {
    /** @returns {Promise<{ratio:number, mismatchPx:number, w:number, h:number, heightA:number, heightB:number, heightDelta:number, diffPng:Buffer}>} */
    async diff(pngA, pngB, { distance = PIXEL_DISTANCE } = {}) {
      const res = await page.evaluate(
        async ([da, db, dist]) => {
          const load = (src) => new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = src; });
          const [ia, ib] = await Promise.all([load(da), load(db)]);
          const w = Math.min(ia.width, ib.width);
          const ha = Math.round((ia.height * w) / ia.width);
          const hb = Math.round((ib.height * w) / ib.width);
          const h = Math.max(ha, hb);
          const draw = (img, ih) => {
            const c = document.createElement("canvas");
            c.width = w; c.height = h;
            const g = c.getContext("2d");
            g.fillStyle = "#fff"; g.fillRect(0, 0, w, h);
            g.drawImage(img, 0, 0, w, ih);
            return g.getImageData(0, 0, w, h).data;
          };
          const pa = draw(ia, ha), pb = draw(ib, hb);
          const oc = document.createElement("canvas");
          oc.width = w; oc.height = h;
          const og = oc.getContext("2d");
          const od = og.createImageData(w, h);
          let bad = 0;
          for (let i = 0; i < pa.length; i += 4) {
            const d = Math.abs(pa[i] - pb[i]) + Math.abs(pa[i + 1] - pb[i + 1]) + Math.abs(pa[i + 2] - pb[i + 2]);
            const grey = (pa[i] + pa[i + 1] + pa[i + 2]) / 3;
            if (d > dist) { bad++; od.data.set([255, 0, 64, 255], i); } else od.data.set([grey, grey, grey, 70], i);
          }
          og.putImageData(od, 0, 0);
          return { bad, w, h, ha, hb, png: oc.toDataURL("image/png") };
        },
        [`data:image/png;base64,${b64(pngA)}`, `data:image/png;base64,${b64(pngB)}`, distance],
      );
      return {
        ratio: res.bad / (res.w * res.h),
        mismatchPx: res.bad,
        w: res.w,
        h: res.h,
        heightA: res.ha,
        heightB: res.hb,
        heightDelta: res.ha - res.hb,
        diffPng: Buffer.from(res.png.split(",")[1], "base64"),
      };
    },

    /** Downscale any image buffer to at most maxW px wide and re-encode as JPEG. */
    async jpeg(buf, { maxW = 520, quality = 0.6 } = {}) {
      const mime = buf[0] === 0x89 ? "image/png" : "image/jpeg";
      const out = await page.evaluate(
        async ([src, mw, q]) => {
          const img = await new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = src; });
          const k = Math.min(1, mw / img.width);
          const c = document.createElement("canvas");
          c.width = Math.max(1, Math.round(img.width * k));
          c.height = Math.max(1, Math.round(img.height * k));
          const g = c.getContext("2d");
          g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
          g.drawImage(img, 0, 0, c.width, c.height);
          return c.toDataURL("image/jpeg", q);
        },
        [`data:${mime};base64,${b64(buf)}`, maxW, quality],
      );
      return Buffer.from(out.split(",")[1], "base64");
    },

    async close() {
      await ctx.close();
    },
  };
}
