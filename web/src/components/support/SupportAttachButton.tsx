"use client";

import { useRef, useState } from "react";
import { useT } from "@/i18n/use-t";
import { COLORS } from "./support-tokens";
import { uploadSupportAttachment } from "./upload-support-attachment";

const ACCEPT = "image/png,image/jpeg,image/webp,image/gif";
const MAX_BYTES = 5 * 1024 * 1024;

export function SupportAttachButton({
  ticketId,
  disabled,
  tone = "light",
}: {
  ticketId: string | null;
  disabled?: boolean;
  tone?: "light" | "hq";
}) {
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const ink = tone === "hq" ? "#F5F2EB" : COLORS.ink;
  const border = tone === "hq" ? "rgba(255,255,255,0.12)" : COLORS.border;
  const bg = tone === "hq" ? "rgba(255,255,255,0.04)" : COLORS.card;

  const pick = async (file: File | undefined) => {
    if (!file || !ticketId || busy || disabled) return;
    if (file.size > MAX_BYTES) return;
    if (!ACCEPT.split(",").includes(file.type)) return;
    setBusy(true);
    await uploadSupportAttachment(ticketId, file);
    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        hidden
        onChange={(e) => void pick(e.target.files?.[0])}
      />
      <button
        type="button"
        disabled={!ticketId || disabled || busy}
        aria-label={t("dashboard.adminSupport.attachAria")}
        onClick={() => inputRef.current?.click()}
        style={{
          width: 44,
          height: 44,
          flexShrink: 0,
          borderRadius: 10,
          border: `1px solid ${border}`,
          background: bg,
          color: ink,
          cursor: ticketId && !disabled && !busy ? "pointer" : "default",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: busy ? 0.6 : 1,
        }}
      >
        <PaperclipGlyph />
      </button>
    </>
  );
}

function PaperclipGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M21.4 11.2l-9.2 9.2a6 6 0 01-8.5-8.5l9.9-9.9a4 4 0 015.7 5.7l-9.9 9.8a2 2 0 01-2.8-2.8l8.5-8.5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
