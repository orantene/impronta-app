"use client";

import { useMemo } from "react";
import { GuestCaptchaField, type GuestCaptchaConfig } from "./GuestCaptchaField";
import { translatorFor } from "@/i18n/use-t";

const INK = "var(--token-color-ink, #0B0B0D)";
const FIELD =
  "rounded-lg border border-[rgba(24,24,27,0.12)] bg-white px-3 py-2 text-sm text-[var(--token-color-ink,#0B0B0D)]";

export function GuestInstantContact({
  name,
  email,
  captcha,
  locale,
  onName,
  onEmail,
  onCaptchaToken,
}: {
  name: string;
  email: string;
  captcha?: GuestCaptchaConfig | null;
  locale: string;
  onName: (v: string) => void;
  onEmail: (v: string) => void;
  onCaptchaToken: (v: string) => void;
}) {
  // Page locale wins (CMS /book band, /book route). useT() reads the dashboard
  // cookie and leaves English labels on a Spanish studio site.
  const t = useMemo(() => translatorFor(locale.startsWith("es") ? "es" : "en"), [locale]);
  return (
    <div className="mt-3 flex flex-col gap-2" data-guest-instant-contact style={{ color: INK }}>
      <label className="flex flex-col gap-1 text-xs" style={{ color: INK }}>
        <span>{t("public.instantBook.guestName")}</span>
        <input
          type="text"
          value={name}
          autoComplete="name"
          onChange={(e) => onName(e.target.value)}
          className={FIELD}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs" style={{ color: INK }}>
        <span>{t("public.instantBook.guestEmail")}</span>
        <input
          type="email"
          value={email}
          autoComplete="email"
          onChange={(e) => onEmail(e.target.value)}
          className={FIELD}
        />
      </label>
      <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" />
      {/*
        `always`: studio booking sits inside themed CMS containers that often
        clip overflow. interaction-only expands when challenged and vanishes
        behind overflow:hidden — Confirm then dead-ends on "complete the
        challenge" with no widget. Catalog overlays keep the default.
      */}
      <GuestCaptchaField
        captcha={captcha}
        locale={locale}
        onToken={onCaptchaToken}
        appearance="always"
        theme="light"
      />
    </div>
  );
}
