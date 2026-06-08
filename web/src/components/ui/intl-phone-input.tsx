/**
 * IntlPhoneInput — flag (auto) | country-code field | national number.
 * Typing +52 / +1 / +54 in the code field updates the flag live.
 */
"use client";

import React, { useState } from "react";
import {
  flagEmojiForIso,
  isoForInlineDial,
  parseE164PhoneInput,
} from "@/lib/data/country-dial-codes";

const WA_GREEN = "#25D366";
const NEUTRAL_BORDER = "rgba(11,11,13,0.12)";
const NEUTRAL_BADGE_BG = "rgba(11,11,13,0.04)";

type Variant = "phone" | "whatsapp";

type Props = {
  variant: Variant;
  prefix: string;
  national: string;
  onChange: (next: { prefix: string; national: string }) => void;
  /** Placeholder for the national-number segment only. */
  numberPlaceholder?: string;
  disabled?: boolean;
  fallbackPrefix?: string;
  ariaLabel: string;
  copyFrom?: { prefix: string; national: string };
  copyFromLabel?: string;
  copiedLabel?: string;
};

function variantStyles(variant: Variant) {
  if (variant === "whatsapp") {
    return {
      border: "rgba(37,211,102,0.32)",
      badgeBg: "rgba(37,211,102,0.10)",
      badgeBorder: "rgba(37,211,102,0.32)",
      divider: "rgba(37,211,102,0.22)",
    };
  }
  return {
    border: NEUTRAL_BORDER,
    badgeBg: NEUTRAL_BADGE_BG,
    badgeBorder: NEUTRAL_BORDER,
    divider: NEUTRAL_BORDER,
  };
}

function normalizeDialInput(raw: string, fallback: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return fallback;
  const digits = trimmed.replace(/[^\d+]/g, "");
  if (!digits) return fallback;
  if (digits.startsWith("+")) return digits;
  return `+${digits}`;
}

function flagForDial(dial: string, fallbackIso: string): string {
  const parsed = parseE164PhoneInput(dial, { dial, iso: fallbackIso });
  return flagEmojiForIso(parsed.iso) || "🌐";
}

function CopyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
    </svg>
  );
}

function WhatsAppGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill={WA_GREEN} aria-hidden>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

const inputBase: React.CSSProperties = {
  border: "none",
  outline: "none",
  fontFamily: "inherit",
  fontSize: 13,
  color: "inherit",
  background: "transparent",
  borderRadius: 0,
  padding: "11px 10px",
};

export function IntlPhoneInput({
  variant,
  prefix,
  national,
  onChange,
  numberPlaceholder = "55 1234 5678",
  disabled,
  fallbackPrefix = "+1",
  ariaLabel,
  copyFrom,
  copyFromLabel = "Copy from other number",
  copiedLabel = "Copied",
}: Props) {
  const [copied, setCopied] = useState(false);
  const dial = prefix || fallbackPrefix;
  const fallbackIso = isoForInlineDial(fallbackPrefix);
  const flag = flagForDial(dial, fallbackIso);
  const theme = variantStyles(variant);
  const canCopyFrom = !!copyFrom?.national?.trim() && !disabled;

  const handleDialChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextDial = normalizeDialInput(e.target.value, fallbackPrefix);
    const parsed = parseE164PhoneInput(nextDial, { dial: nextDial, iso: fallbackIso });
    onChange({ prefix: parsed.dial, national });
  };

  const handleNationalChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({ prefix: dial, national: e.target.value });
  };

  const handleCopyFrom = () => {
    if (!copyFrom?.national?.trim()) return;
    onChange({
      prefix: copyFrom.prefix || fallbackPrefix,
      national: copyFrom.national.trim(),
    });
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, opacity: disabled ? 0.65 : 1 }}>
      {copyFrom && (
        <button
          type="button"
          disabled={!canCopyFrom}
          onClick={handleCopyFrom}
          aria-label={copyFromLabel}
          style={{
            alignSelf: "flex-end",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: 0,
            border: "none",
            background: "transparent",
            fontFamily: "inherit",
            fontSize: 12,
            fontWeight: 500,
            color: copied
              ? "#0F4F3E"
              : canCopyFrom
                ? "rgba(11,11,13,0.62)"
                : "rgba(11,11,13,0.28)",
            cursor: canCopyFrom ? "pointer" : "not-allowed",
          }}
        >
          {copied ? (
            <span style={{ fontSize: 12, fontWeight: 700 }} aria-hidden>✓</span>
          ) : (
            <CopyIcon />
          )}
          <span>{copied ? copiedLabel : copyFromLabel}</span>
        </button>
      )}

      <div
        style={{
          display: "flex",
          alignItems: "stretch",
          borderRadius: 8,
          border: `1px solid ${theme.border}`,
          background: "#fff",
          overflow: "hidden",
        }}
      >
        {/* Auto flag */}
        <div
          aria-hidden
          title={dial}
          style={{
            width: 44,
            minHeight: 44,
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: variant === "whatsapp" ? 2 : 0,
            background: theme.badgeBg,
            borderRight: `1px solid ${theme.badgeBorder}`,
          }}
        >
          {variant === "whatsapp" && <WhatsAppGlyph />}
          <span style={{ fontSize: 20, lineHeight: 1 }}>{flag}</span>
        </div>

        {/* Country code */}
        <input
          type="tel"
          inputMode="tel"
          disabled={disabled}
          value={dial}
          onChange={handleDialChange}
          aria-label={`${ariaLabel} country code`}
          placeholder="+52"
          style={{
            ...inputBase,
            width: 58,
            flexShrink: 0,
            textAlign: "center",
            fontWeight: 600,
            letterSpacing: 0.2,
            borderRight: `1px solid ${theme.divider}`,
          }}
        />

        {/* National number */}
        <input
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          disabled={disabled}
          value={national}
          onChange={handleNationalChange}
          aria-label={ariaLabel}
          placeholder={numberPlaceholder}
          style={{
            ...inputBase,
            flex: 1,
            minWidth: 0,
            paddingLeft: 12,
            paddingRight: 12,
          }}
        />
      </div>
    </div>
  );
}
