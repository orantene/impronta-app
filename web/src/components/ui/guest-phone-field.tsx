"use client";

/**
 * GuestPhoneField: the one phone input for every booking and inquiry form.
 * Shows `[flag +dial] [number]`, stores E.164, and keeps a hidden input named
 * `name` so plain form posts carry the E.164 value.
 *
 * Default country order: request IP country, browser language/timezone,
 * the Talent/Profesional's country, MX. A pasted or autofilled international
 * number (+ or 00 prefix) sets the flag and dial code and keeps the national part.
 */
import { useEffect, useId, useMemo, useRef, useState } from "react";

import { COUNTRY_DIAL_CODES, POPULAR_DIAL_ISOS, dialByIso, flagEmojiForIso } from "@/lib/data/country-dial-codes";
import {
  DEFAULT_PHONE_COUNTRY,
  GUEST_PHONE_LABEL,
  detectDefaultCountry,
  normalizeGuestPhone,
  parseIntlPhonePaste,
  toE164,
} from "@/lib/phone/guest-phone";

export { normalizeGuestPhone };

export type GuestPhoneFieldProps = {
  /** E.164 value (or empty). */
  value: string;
  onChange: (e164: string) => void;
  locale?: string;
  id?: string;
  /** Posted with the form as E.164. */
  name?: string;
  /** x-vercel-ip-country, read server-side and passed down. */
  ipCountry?: string | null;
  /** The Talent/Profesional's country (ISO). */
  talentCountry?: string | null;
  invalid?: boolean;
  /** Staff forms: the phone is optional unless the action needs it. */
  optional?: boolean;
  disabled?: boolean;
  onBlur?: () => void;
  testId?: string;
  className?: string;
};

const ORDERED = (() => {
  const popular = POPULAR_DIAL_ISOS.map((iso) => dialByIso(iso)).filter((c): c is NonNullable<typeof c> => !!c);
  const rest = COUNTRY_DIAL_CODES.filter((c) => !POPULAR_DIAL_ISOS.includes(c.iso));
  return { popular, rest };
})();

function splitValue(value: string, fallbackIso: string) {
  const parsed = value ? parseIntlPhonePaste(value) : null;
  return parsed
    ? { iso: parsed.iso, national: parsed.national }
    : { iso: fallbackIso, national: "" };
}

export function GuestPhoneField(props: GuestPhoneFieldProps) {
  const { value, onChange, locale: localeProp, name, ipCountry, talentCountry, invalid, optional, disabled, onBlur, testId, className } = props;
  const locale = localeProp ?? (typeof document !== "undefined" ? document.documentElement.lang : "es");
  const es = (locale || "es").toLowerCase().startsWith("es");
  const autoId = useId();
  const id = props.id ?? autoId;
  const initialIso = detectDefaultCountry({ ipCountry, talentCountry });
  const [iso, setIso] = useState(() => splitValue(value, initialIso).iso);
  const [national, setNational] = useState(() => splitValue(value, initialIso).national);
  const touched = useRef(false);
  const hadInitialValue = useRef(!!value);
  const dial = dialByIso(iso)?.dial ?? dialByIso(DEFAULT_PHONE_COUNTRY)!.dial;

  // Refine from the browser (language, timezone) once mounted, until the guest picks or types.
  useEffect(() => {
    if (touched.current || hadInitialValue.current) return;
    const next = detectDefaultCountry({
      // Server-read x-vercel-ip-country, stamped on <html> by the root layout.
      ipCountry: ipCountry ?? document.documentElement.dataset.ipCountry,
      languages: typeof navigator !== "undefined" ? navigator.languages : null,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      talentCountry,
    });
    setIso(next);
  }, [ipCountry, talentCountry]);

  const emit = (nextIso: string, nextNational: string) => {
    onChange(toE164(dialByIso(nextIso)?.dial ?? dial, nextNational));
  };

  const onNumber = (raw: string) => {
    touched.current = true;
    const intl = parseIntlPhonePaste(raw);
    if (intl) {
      setIso(intl.iso);
      setNational(intl.national);
      emit(intl.iso, intl.national);
      return;
    }
    setNational(raw);
    emit(iso, raw);
  };

  const options = useMemo(
    () => (
      <>
        <optgroup label={es ? "Frecuentes" : "Popular"}>
          {ORDERED.popular.map((c) => (
            <option key={c.iso} value={c.iso}>{`${flagEmojiForIso(c.iso)} ${c.name} ${c.dial}`}</option>
          ))}
        </optgroup>
        <optgroup label={es ? "Todos" : "All"}>
          {ORDERED.rest.map((c) => (
            <option key={c.iso} value={c.iso}>{`${flagEmojiForIso(c.iso)} ${c.name} ${c.dial}`}</option>
          ))}
        </optgroup>
      </>
    ),
    [es],
  );

  const label = es ? GUEST_PHONE_LABEL.es : GUEST_PHONE_LABEL.en;
  return (
    <div
      className={`flex items-stretch gap-2 ${className ?? ""}`}
      data-guest-phone=""
      data-testid={testId ? `${testId}-wrap` : undefined}
    >
      <div className="relative flex min-h-[52px] shrink-0 items-center gap-1.5 rounded-[10px] border border-current/20 px-3 text-base">
        <span aria-hidden>{flagEmojiForIso(iso)}</span>
        <span aria-hidden>{dial}</span>
        <select
          aria-label={es ? "País y código de marcado" : "Country and dial code"}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          value={iso}
          disabled={disabled}
          onChange={(e) => {
            touched.current = true;
            setIso(e.target.value);
            emit(e.target.value, national);
          }}
          data-testid={testId ? `${testId}-country` : undefined}
        >
          {options}
        </select>
      </div>
      <input
        id={id}
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        required={!optional}
        disabled={disabled}
        value={national}
        onChange={(e) => onNumber(e.target.value)}
        onBlur={onBlur}
        aria-label={label}
        aria-invalid={invalid ? true : undefined}
        placeholder="55 1234 5678"
        className="min-h-[52px] min-w-0 flex-1 rounded-[10px] border border-current/20 bg-transparent px-3.5 text-base"
        data-testid={testId}
      />
      {name ? <input type="hidden" name={name} value={value} /> : null}
    </div>
  );
}
