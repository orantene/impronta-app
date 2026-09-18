"use client";

/**
 * F07 Your details: the client's own name (editable). Email and
 * phone are read-only from the inquiry. Not a thread card. Writes
 * through messagingClientRename (token identity).
 */

import { useState } from "react";

import type { Translator } from "@/i18n/interpolate";
import { messagingClientRename } from "@/lib/server-actions/messaging-client";

import { FONT, type Palette } from "./mini-chat-styles";

export type GuestDockDetailsCardProps = {
  name: string;
  email: string | null;
  phone: string | null;
  token: string | null;
  accent: string;
  accentInk: string;
  C: Palette;
  t: Translator;
  onSaved?: (name: string) => void;
};

export function GuestDockDetailsCard({ name, email, phone, token, accent, accentInk, C, t, onSaved }: GuestDockDetailsCardProps) {
  const [value, setValue] = useState(name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = value.trim() !== name.trim() && value.trim().length > 0;

  const save = async () => {
    if (!token || !dirty) return;
    setBusy(true);
    setError(null);
    const result = await messagingClientRename({ token, name: value.trim() });
    setBusy(false);
    if (!result.ok) {
      setError(result.reason === "expired" ? t("public.guestChat.detailsExpired") : t("public.guestChat.detailsFailed"));
      return;
    }
    onSaved?.(result.name);
  };

  return (
    <div
      data-guest-dock-details
      style={{
        padding: "13px 14px",
        borderRadius: 14,
        border: `1px solid ${C.borderSoft}`,
        background: C.surface,
        fontFamily: FONT,
        boxShadow: "0 1px 2px rgba(16,18,29,0.04)",
      }}
    >
      <div style={{ fontSize: 13.5, fontWeight: 600, color: C.ink, marginBottom: 8 }}>{t("public.guestChat.detailsTitle")}</div>
      <label htmlFor="guest-dock-details-name" style={{ display: "block", fontSize: 11.5, color: C.inkMuted, marginBottom: 4 }}>
        {t("public.guestChat.detailsName")}
      </label>
      <input
        id="guest-dock-details-name"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={busy || !token}
        autoComplete="name"
        style={{
          width: "100%",
          boxSizing: "border-box",
          padding: "10px 12px",
          borderRadius: 10,
          border: `1px solid ${C.borderSoft}`,
          fontFamily: FONT,
          fontSize: 14,
          color: C.ink,
          background: C.surfaceFaint ?? C.surface,
          minHeight: 44,
        }}
      />
      <div style={{ marginTop: 10, fontSize: 12, color: C.inkDim }}>
        <div>
          {t("public.guestChat.detailsEmail")}: {email?.trim() || t("public.guestChat.detailsEmpty")}
        </div>
        <div>
          {t("public.guestChat.detailsPhone")}: {phone?.trim() || t("public.guestChat.detailsEmpty")}
        </div>
      </div>
      {error ? <div style={{ marginTop: 8, fontSize: 12, color: C.inkMuted }}>{error}</div> : null}
      {dirty && token ? (
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy}
          style={{
            marginTop: 10,
            minHeight: 44,
            width: "100%",
            border: "none",
            borderRadius: 10,
            background: accent,
            color: accentInk,
            fontFamily: FONT,
            fontSize: 13.5,
            fontWeight: 600,
            cursor: busy ? "wait" : "pointer",
          }}
        >
          {busy ? t("public.guestChat.detailsSaving") : t("public.guestChat.detailsSave")}
        </button>
      ) : null}
    </div>
  );
}
