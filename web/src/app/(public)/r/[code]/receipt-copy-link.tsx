"use client";

import { useState } from "react";

export function ReceiptCopyLink({
  label,
  copiedLabel,
  tone = "secondary",
}: {
  label: string;
  copiedLabel: string;
  tone?: "primary" | "secondary";
}) {
  const [copied, setCopied] = useState(false);
  const primary = tone === "primary";
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(window.location.href).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 2000);
        });
      }}
      className="inline-flex items-center justify-center rounded-full px-5 py-3 text-sm font-semibold"
      style={
        primary
          ? {
              background: "var(--token-color-primary)",
              color: "var(--token-color-primary-on, var(--primary-foreground))",
              border: "0",
            }
          : {
              background: "transparent",
              color: "var(--token-color-ink)",
              border: "1px solid var(--token-color-line)",
            }
      }
    >
      {copied ? copiedLabel : label}
    </button>
  );
}
