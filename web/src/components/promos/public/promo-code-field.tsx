"use client";

import { useState } from "react";

import { publicPromoCopy } from "@/lib/promos/copy/public";
import { normalizeTypedCode, promoCodeMessage, type PromoCodeOutcome } from "@/lib/promos/public-view";

/**
 * "¿Tienes un código?" collapsed link at checkout. Never a big empty field
 * (design E). Trims and upper-cases; the server matches case-insensitively.
 */
export function PromoCodeField({
  locale,
  onApply,
}: {
  locale: string;
  onApply: (code: string) => Promise<PromoCodeOutcome>;
}) {
  const copy = publicPromoCopy(locale);
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  if (!open) {
    return (
      <button type="button" data-promo-code-toggle="" onClick={() => setOpen(true)} style={{ background: "none", border: 0, padding: 0, textDecoration: "underline", cursor: "pointer", color: "inherit" }}>
        {copy.codeToggle}
      </button>
    );
  }

  const submit = async () => {
    const code = normalizeTypedCode(value);
    if (!code || busy) return;
    setBusy(true);
    try {
      const outcome = await onApply(code);
      setMsg({ text: promoCodeMessage(outcome, code, locale), ok: outcome.ok });
    } catch {
      setMsg({ text: copy.codeTryAgain, ok: false });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      data-promo-code-field=""
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}
    >
      <label style={{ flex: "1 1 160px" }}>
        <span className="sr-only">{copy.codeLabel}</span>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          placeholder={copy.codeLabel}
          style={{ width: "100%", padding: "8px 10px", textTransform: "uppercase" }}
        />
      </label>
      <button type="submit" disabled={busy || !value.trim()} style={{ padding: "8px 14px" }}>
        {copy.codeApply}
      </button>
      {msg ? (
        <p role="status" aria-live="polite" data-promo-code-ok={msg.ok ? "" : undefined} style={{ flexBasis: "100%", margin: 0, fontSize: 14 }}>
          {msg.text}
        </p>
      ) : null}
    </form>
  );
}
