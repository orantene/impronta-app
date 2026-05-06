"use client";

// Clipboard-copy button for the Site page hero URL row.
// Renders inline with the Open ↗ anchor; shows a brief "Copied!" confirmation.

import { useState, useCallback } from "react";

const FONT = '"Inter", system-ui, sans-serif';

export function CopyUrlButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      const t = setTimeout(() => setCopied(false), 1800);
      return () => clearTimeout(t);
    }).catch(() => {
      // Fallback: textarea trick
      try {
        const ta = document.createElement("textarea");
        ta.value = url;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      } catch { /* ignore */ }
    });
  }, [url]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      style={{
        fontSize: 11,
        padding: "3px 9px",
        borderRadius: 999,
        border: "1px solid rgba(255,255,255,0.30)",
        background: copied ? "rgba(255,255,255,0.15)" : "transparent",
        color: "#fff",
        fontFamily: FONT,
        cursor: "pointer",
        transition: "background 150ms",
      }}
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}
