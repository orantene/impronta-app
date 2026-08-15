"use client";

/**
 * media-download-row.tsx — the download control on the Media page detail rail.
 *
 * The originals policy (plan §9 decision 2) is owner-only, and the ONE thing
 * this component must never do is hand someone a quietly smaller file. So the
 * button asks the server what the caller is entitled to, opens whatever comes
 * back, and prints the server's sentence underneath it — grant or refusal.
 * "Never a silent absence" is the standing rule for every lock in this program.
 *
 * Lives outside `components/admin/shell/**` on purpose: that tree is frozen
 * against new inline styles, and this is new UI.
 */

import { useState } from "react";

import { useT } from "@/i18n/use-t";
import {
  actionGetMediaDownloadLink,
  type MediaDownloadLink,
} from "@/lib/server-actions/media-download";

export function MediaDownloadRow({ assetId }: { assetId: string }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<MediaDownloadLink | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    setLink(null);
    try {
      const res = await actionGetMediaDownloadLink({ assetId });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setLink(res.data);
      window.open(res.data.url, "_blank", "noopener,noreferrer");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={() => void run()}
        disabled={busy}
        className="rounded-md border border-white/15 bg-white/10 px-3 py-1.5 text-left text-xs font-semibold text-white/90 hover:bg-white/15 disabled:opacity-50"
      >
        {busy
          ? t("dashboard.adminMedia.downloadWorking")
          : t("dashboard.adminMedia.downloadOriginal")}
      </button>
      {link ? (
        <p className="text-[11px] leading-snug text-white/55">
          {link.level === "original"
            ? t("dashboard.adminMedia.downloadGotOriginal")
            : t("dashboard.adminMedia.downloadGotWebSize")}{" "}
          {link.message}
        </p>
      ) : null}
      {/*
        B17 — the row explained original-vs-web-size and never said a word
        about watermarks, so a downloader could not tell whether the file
        carries a mark. Watermarking is a RELEASE condition baked into a
        separate derivative; downloads here always hand back the workspace's
        own unmarked file. Say it once, up front.
      */}
      {link ? (
        <p className="text-[11px] leading-snug text-white/40">
          {t("dashboard.adminMedia.downloadWatermarkNote")}
        </p>
      ) : null}
      {error ? <p className="text-[11px] leading-snug text-white/70">{error}</p> : null}
    </div>
  );
}
