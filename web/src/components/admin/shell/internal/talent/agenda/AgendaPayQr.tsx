"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

import { encodeQr } from "@/lib/links/qr";
import { toBitmap, toSvg } from "@/lib/links/qr/render";
import { useAgendaCopy } from "./use-agenda-copy";

const PNG_SCALE = 12;

/** Draw the QR at a whole number of pixels per module and hand back a PNG blob. */
function qrPngBlob(url: string): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      const { size, pixels } = toBitmap(encodeQr(url).matrix, PNG_SCALE);
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve(null);
      const image = ctx.createImageData(size, size);
      for (let i = 0; i < pixels.length; i += 1) {
        const v = pixels[i] ? 0 : 255;
        image.data[i * 4] = v;
        image.data[i * 4 + 1] = v;
        image.data[i * 4 + 2] = v;
        image.data[i * 4 + 3] = 255;
      }
      ctx.putImageData(image, 0, 0);
      canvas.toBlob((blob) => resolve(blob), "image/png");
    } catch {
      resolve(null);
    }
  });
}

function saveBlob(blob: Blob, filename: string) {
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(href), 1000);
}

/**
 * Show QR (mockup mc_req_qr): a popover with the code large, the amount, and a
 * Download button. The code encodes the real pay link the writer returned.
 * Escape closes just the popover, not the panel behind it.
 */
export function PayQrPopover({ url, caption }: { url: string; caption?: string }) {
  const copy = useAgendaCopy();
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const popRef = useRef<HTMLDivElement | null>(null);
  const id = useId();

  const svg = useMemo(() => {
    try {
      return toSvg(encodeQr(url).matrix, { size: 220 });
    } catch {
      return null;
    }
  }, [url]);

  useEffect(() => {
    if (!open) return;
    popRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Capture phase: close the popover first and keep the panel open.
      e.stopPropagation();
      setOpen(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open]);

  async function download() {
    setFailed(false);
    const png = await qrPngBlob(url);
    if (png) return saveBlob(png, "payment-qr.png");
    if (svg) return saveBlob(new Blob([svg], { type: "image/svg+xml" }), "payment-qr.svg");
    setFailed(true);
  }

  if (!svg) return null;

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        className="min-h-[44px] rounded-full border border-black/10 bg-white px-4 text-[13px] font-semibold text-[var(--tc-primary)]"
      >
        {copy.t("Show QR")}
      </button>
      {open ? (
        <div
          id={id}
          ref={popRef}
          tabIndex={-1}
          role="dialog"
          aria-label={copy.t("QR code for the payment link")}
          className="mt-2 flex flex-col items-center gap-3 rounded-2xl border border-black/10 bg-white p-4 shadow-lg outline-none"
        >
          <div
            role="img"
            aria-label={copy.t("QR code for the payment link")}
            className="max-w-full rounded-xl bg-white p-1"
            dangerouslySetInnerHTML={{ __html: svg }}
          />
          {caption ? <p className="text-center text-[15px] font-semibold text-[var(--tc-primary)]">{caption}</p> : null}
          <p className="text-center text-[12.5px] text-[var(--tc-muted)]">{copy.t("Show this only when the client is with you.")}</p>
          {failed ? (
            <p role="alert" className="text-[12.5px] text-[var(--tc-risk)]">
              {copy.t("Could not create the image")}
            </p>
          ) : null}
          <div className="flex w-full gap-2">
            <button
              type="button"
              onClick={() => void download()}
              className="min-h-[44px] flex-1 rounded-full bg-[var(--tc-action)] hover:bg-[var(--tc-action-hover)] px-4 text-[13.5px] font-semibold text-white"
            >
              {copy.t("Download")}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="min-h-[44px] flex-1 rounded-full border border-black/10 bg-white px-4 text-[13.5px] font-semibold text-[var(--tc-primary)]"
            >
              {copy.t("Close")}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
