"use client";

import { GuestCaptchaField, type GuestCaptchaConfig } from "./GuestCaptchaField";
import { useT } from "@/i18n/use-t";

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
  const t = useT();
  return (
    <div className="mt-3 flex flex-col gap-2" data-guest-instant-contact>
      <label className="flex flex-col gap-1 text-xs">
        <span>{t("public.instantBook.guestName")}</span>
        <input
          type="text"
          value={name}
          autoComplete="name"
          onChange={(e) => onName(e.target.value)}
          className="rounded-lg border border-[rgba(24,24,27,0.12)] bg-white px-3 py-2 text-sm"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs">
        <span>{t("public.instantBook.guestEmail")}</span>
        <input
          type="email"
          value={email}
          autoComplete="email"
          onChange={(e) => onEmail(e.target.value)}
          className="rounded-lg border border-[rgba(24,24,27,0.12)] bg-white px-3 py-2 text-sm"
        />
      </label>
      <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" />
      <GuestCaptchaField captcha={captcha} locale={locale} onToken={onCaptchaToken} />
    </div>
  );
}
