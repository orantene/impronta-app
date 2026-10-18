"use client";

import { useMemo, useState } from "react";

import { flagEmojiForIso } from "@/lib/data/country-dial-codes";

import {
  guestCountryOptions,
  guestDefaultPhoneIso,
  joinGuestPhone,
  sanitizeGuestPhone,
  splitGuestPhone,
} from "./guest-phone";

/**
 * TUL-923 / TUL-929: country select + national number. The default country
 * is read from THIS browser when the field mounts (the sheet only renders on
 * the client after an open event), so a cached server render never decides it.
 */
function CatalogWhoPhone({
  es, locale, fallbackCountry, value, onChange, onBlur, invalid,
}: {
  es: boolean;
  locale: string;
  fallbackCountry: string | null;
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  invalid: boolean;
}) {
  const [iso, setIso] = useState<string>(() =>
    guestDefaultPhoneIso({
      languages: typeof navigator !== "undefined" ? navigator.languages : null,
      fallbackCountry,
      timeZone: typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : null,
      locale,
    }),
  );
  const options = useMemo(() => guestCountryOptions(locale), [locale]);
  const parts = splitGuestPhone(value, iso);
  const shownIso = parts.iso ?? iso;
  return (
    <div className="jb-phone" data-catalog-phone="">
      <select
        value={shownIso}
        onChange={(e) => {
          setIso(e.target.value);
          onChange(joinGuestPhone(e.target.value, parts.national));
        }}
        aria-label={es ? "País del número" : "Number country"}
        data-testid="cb-phone-country"
      >
        {options.map((o) => (
          <option key={o.iso} value={o.iso}>
            {`${flagEmojiForIso(o.iso)} ${o.dial} ${o.label}`}
          </option>
        ))}
      </select>
      <input
        value={parts.national}
        onChange={(e) => onChange(joinGuestPhone(shownIso, sanitizeGuestPhone(e.target.value)))}
        onBlur={onBlur}
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        placeholder={es ? "Para avisarte de cualquier cambio" : "If we need to reach you"}
        aria-invalid={invalid}
        aria-label={es ? "WhatsApp (opcional)" : "WhatsApp (optional)"}
        aria-required={false}
        data-testid="cb-phone"
      />
    </div>
  );
}

/** The who-step contact fields of the catalog booking sheet (split out for max-lines). */
export function CatalogWhoContact({
  es, locale, fallbackCountry, name, phone, email, setName, setPhone, setEmail, onBlur,
  touched, nameValid, phoneValid, emailValid, askAttempted, chatPhoneValid,
}: {
  es: boolean;
  locale: string;
  /** TUL-923: the talent's country, used only when the browser names no region. */
  fallbackCountry: string | null;
  name: string;
  phone: string;
  email: string;
  setName: (v: string) => void;
  setPhone: (v: string) => void;
  setEmail: (v: string) => void;
  onBlur?: () => void;
  touched: boolean;
  nameValid: boolean;
  phoneValid: boolean;
  emailValid: boolean;
  askAttempted: boolean;
  chatPhoneValid: boolean;
}) {
  return (
    <>
      <label className="jb-field">
        <span>{es ? "Nombre" : "Name"} <i data-testid="cb-name-required">{es ? "(obligatorio)" : "(required)"}</i></span>
        <input
          aria-required
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={onBlur}
          placeholder={es ? "Tu nombre" : "Your name"}
          aria-invalid={touched && !nameValid}
          data-testid="cb-name"
        />
        {touched && !nameValid ? <em role="alert">{es ? "Escribe tu nombre para confirmar." : "Enter your name to confirm."}</em> : null}
      </label>
      <div className="jb-field" role="group" aria-label={es ? "WhatsApp (opcional)" : "WhatsApp (optional)"}>
        {/* TUL-842: the field is optional for a booking; the label says so in words, not only in the aria text. */}
        <span data-testid="cb-phone-label">
          WhatsApp <i>{es ? "(opcional)" : "(optional)"}</i>
        </span>
        <CatalogWhoPhone
          es={es} locale={locale} fallbackCountry={fallbackCountry} value={phone} onChange={setPhone}
          onBlur={onBlur} invalid={touched && !phoneValid}
        />
        {touched && !phoneValid ? <em role="alert">{es ? "Revisa el número." : "Check the number."}</em> : null}
        {askAttempted && !chatPhoneValid ? <em role="alert">{es ? "WhatsApp hace falta para chatear." : "WhatsApp is needed to chat."}</em> : null}
      </div>
      <label className="jb-field">
        <span>{es ? "Correo" : "Email"} <i data-testid="cb-email-required">{es ? "(obligatorio)" : "(required)"}</i></span>
        <input
          aria-required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onBlur={onBlur}
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder={es ? "Para enviarte la confirmación" : "For the confirmation"}
          aria-invalid={touched && !emailValid}
          data-testid="cb-email"
        />
        {touched && !emailValid ? <em role="alert">{es ? "Necesitamos un correo válido." : "We need a valid email."}</em> : null}
      </label>
    </>
  );
}
