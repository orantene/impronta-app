"use client";

import { useState } from "react";
import { useDashboardText } from "@/components/admin/shell/internal/dashboard-i18n";

export function AppearStudioTools({ url }: { url: string | null }) {
  const copy = useDashboardText();
  const [shareOpen, setShareOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const exact = url;

  const copyUrl = async () => {
    if (!exact || !navigator.clipboard) return;
    await navigator.clipboard.writeText(exact);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const download = (kind: "svg" | "png" | "pdf") => {
    if (!exact) return;
    if (kind === "svg") {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="120"><text x="12" y="64" font-size="14">${escapeXml(exact)}</text></svg>`;
      saveBlob(new Blob([svg], { type: "image/svg+xml" }), "listing.svg");
      return;
    }
    if (kind === "png") {
      const canvas = document.createElement("canvas");
      canvas.width = 720;
      canvas.height = 240;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, 720, 240);
      ctx.fillStyle = "#0B0B0D";
      ctx.font = "16px sans-serif";
      ctx.fillText(exact, 24, 120);
      canvas.toBlob((blob) => {
        if (blob) saveBlob(blob, "listing.png");
      });
      return;
    }
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<pre>${exact}</pre>`);
    win.document.close();
    win.print();
  };

  return (
    <div className="mt-6 rounded-2xl border border-admin-border-soft bg-white p-4 font-admin-body">
      <h3 className="text-[15px] font-semibold text-admin-ink">{copy.t("Share this listing")}</h3>
      <p className="mt-1 text-[13px] text-admin-ink-muted">
        {copy.t("Stats")} · {copy.t("not shared")}
      </p>
      <ul className="mt-2 list-disc pl-5 text-[12px] text-admin-ink-muted">
        <li>{copy.t("Live listing")}</li>
        <li>{copy.t("Hidden")}</li>
        <li>{copy.t("Pending")}</li>
        <li>{copy.t("Paid placement")}</li>
        <li>{copy.t("Connection unavailable")}</li>
      </ul>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="rounded-full border border-admin-border-soft px-3 py-1.5 text-[13px]" onClick={() => setShareOpen(true)}>
          {copy.t("Share")}
        </button>
        <button type="button" className="rounded-full border border-admin-border-soft px-3 py-1.5 text-[13px]" onClick={() => setQrOpen(true)}>
          {copy.t("QR")}
        </button>
      </div>
      {shareOpen && (
        <div className="mt-3 text-[13px]">
          <p className="break-all text-admin-ink">{exact ?? copy.t("Not available")}</p>
          <button type="button" className="mt-2 font-semibold text-admin-brand" onClick={() => void copyUrl()}>
            {copied ? copy.t("Link copied") : copy.t("Copy link")}
          </button>
        </div>
      )}
      {qrOpen && (
        <div className="mt-3 text-[13px]">
          <p className="text-admin-ink-muted">{copy.t("PNG, PDF and SVG for one exact URL.")}</p>
          <div className="mt-2 flex gap-2">
            <button type="button" className="rounded-full border px-3 py-1" onClick={() => download("png")}>
              PNG
            </button>
            <button type="button" className="rounded-full border px-3 py-1" onClick={() => download("pdf")}>
              PDF
            </button>
            <button type="button" className="rounded-full border px-3 py-1" onClick={() => download("svg")}>
              SVG
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function escapeXml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function saveBlob(blob: Blob, name: string) {
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  a.click();
  URL.revokeObjectURL(href);
}
