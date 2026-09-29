"use client";

import { useMemo, useState } from "react";
import { encodeQr } from "@/lib/links/qr";
import { toBitmap, toSvg } from "@/lib/links/qr/render";
import {
  displayUrl,
  instagramBioLine,
  qrFileName,
  whatsappShareUrl,
} from "@/lib/talent/presence-placements";
import { usePresenceText } from "./presence-i18n";

/**
 * Share and QR for ONE placement, opened inline under its row (never a sheet
 * on a sheet). Every option is something the product actually does: WhatsApp
 * opens with the message written and sends nothing; there is no "post to
 * Instagram", only a copied bio line.
 */
export function PlacementShareTools({ url, label }: { url: string; label: string }) {
  const { t, es } = usePresenceText();
  const [copied, setCopied] = useState<"link" | "bio" | null>(null);
  const [qrOpen, setQrOpen] = useState(false);
  const canNativeShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  const qrSvg = useMemo(() => {
    if (!qrOpen) return null;
    try {
      return toSvg(encodeQr(url).matrix, { size: 168 });
    } catch {
      return null;
    }
  }, [qrOpen, url]);

  const copy = async (text: string, kind: "link" | "bio") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      window.setTimeout(() => setCopied(null), 1600);
    } catch {
      /* clipboard blocked: the address stays visible to copy by hand */
    }
  };

  const downloadSvg = () => {
    if (!qrSvg) return;
    saveBlob(new Blob([qrSvg], { type: "image/svg+xml" }), qrFileName(url, "svg"));
  };

  const downloadPng = () => {
    try {
      const { matrix } = encodeQr(url);
      const { size, pixels } = toBitmap(matrix, 12);
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const img = ctx.createImageData(size, size);
      for (let i = 0; i < pixels.length; i += 1) {
        const v = pixels[i] === 1 ? 0 : 255;
        img.data[i * 4] = v;
        img.data[i * 4 + 1] = v;
        img.data[i * 4 + 2] = v;
        img.data[i * 4 + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
      canvas.toBlob((blob) => {
        if (blob) saveBlob(blob, qrFileName(url, "png"));
      });
    } catch {
      /* address too long for a printable code: the preview already says so */
    }
  };

  const btn =
    "inline-flex min-h-11 items-center rounded-full border border-admin-border-soft bg-white px-4 text-[13px] font-semibold text-admin-ink disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div className="mt-3 rounded-xl border border-admin-border-soft bg-admin-surface-alt p-3 font-admin-body">
      <p className="text-[12px] text-admin-ink-muted">{t("Share this page")}</p>
      <p className="mt-0.5 break-all text-[13px] font-semibold text-admin-ink">{displayUrl(url)}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className={btn} onClick={() => void copy(url, "link")}>
          {copied === "link" ? t("Link copied") : t("Copy link")}
        </button>
        <a
          className={btn}
          href={whatsappShareUrl(url, t("Book with me"))}
          target="_blank"
          rel="noopener noreferrer"
        >
          {t("Open WhatsApp with the link")}
        </a>
        <button
          type="button"
          className={btn}
          disabled={!canNativeShare}
          onClick={() => void navigator.share?.({ title: label, url }).catch(() => undefined)}
        >
          {t("Share using your device")}
        </button>
        <button type="button" className={btn} onClick={() => void copy(instagramBioLine(url, es), "bio")}>
          {copied === "bio" ? t("Copied to your clipboard") : t("Copy a line for your Instagram bio")}
        </button>
        <button type="button" className={btn} aria-expanded={qrOpen} onClick={() => setQrOpen((v) => !v)}>
          {t("QR code")}
        </button>
      </div>
      <p className="mt-2 text-[12px] text-admin-ink-muted">
        {t("Opening WhatsApp does not send anything. You choose the person and press send.")}
      </p>
      {!canNativeShare && (
        <p className="mt-1 text-[12px] text-admin-ink-muted">{t("This browser has no share sheet. Copy the link instead.")}</p>
      )}
      <p className="mt-1 text-[12px] text-admin-ink-muted">
        {t("Sharing images for a Story are not available yet.")}
      </p>

      {qrOpen && (
        <div className="mt-3 flex flex-wrap items-start gap-4 rounded-xl border border-admin-border-soft bg-white p-3">
          {qrSvg ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(qrSvg)}`}
              width={168}
              height={168}
              alt={t("QR code")}
            />
          ) : (
            <p className="text-[13px] text-admin-ink-muted">{t("This address is too long for a printable code.")}</p>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-[12px] text-admin-ink-muted">{t("This QR opens")}</p>
            <p className="break-all text-[13px] font-semibold text-admin-ink">{displayUrl(url)}</p>
            <p className="mt-2 text-[12px] text-admin-ink-muted">
              {t("Each page has its own code. Printed codes cannot be changed.")}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className={btn} disabled={!qrSvg} onClick={downloadPng}>
                PNG
              </button>
              <button type="button" className={btn} disabled={!qrSvg} onClick={downloadSvg}>
                SVG
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function saveBlob(blob: Blob, name: string) {
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(href), 1000);
}
