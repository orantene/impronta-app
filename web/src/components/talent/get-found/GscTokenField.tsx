"use client";

import { useId, useState, useTransition } from "react";

import { saveGoogleSiteVerificationAction } from "@/lib/talent/google-site-verification-actions";
import type { GscLang } from "@/lib/talent/search-console-guide";

const UI = {
  en: {
    summary: "Verify with the HTML tag",
    label: "Search Console verification code",
    help: "Paste the code or the whole meta tag Google gives you. We add it to your site.",
    save: "Save",
    remove: "Remove",
    saved: "Saved",
    removed: "Removed",
    current: "Saved code",
    invalid: "That doesn't look like a Google verification code.",
    failed: "Could not save. Try again.",
  },
  es: {
    summary: "Verificar con la etiqueta HTML",
    label: "Código de verificación de Search Console",
    help: "Pega el código o la etiqueta meta completa que te da Google. Nosotros la agregamos a tu sitio.",
    save: "Guardar",
    remove: "Quitar",
    saved: "Guardado",
    removed: "Quitado",
    current: "Código guardado",
    invalid: "Eso no parece un código de verificación de Google.",
    failed: "No se pudo guardar. Inténtalo de nuevo.",
  },
} as const;

// TUL-1223: 40px minimum target + a visible keyboard focus ring on every control.
const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900";

export function GscTokenField({ initialToken, lang }: { initialToken: string | null; lang: GscLang }) {
  const t = UI[lang];
  // TUL-1224: unique ids (no hard-coded "gsc-token" that could collide).
  const uid = useId();
  const inputId = `${uid}-token`;
  const helpId = `${uid}-help`;
  const errorId = `${uid}-error`;
  const [saved, setSaved] = useState<string | null>(initialToken);
  const [value, setValue] = useState("");
  // TUL-1222: success and error are separate, so an error can be announced and tied to the field.
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (input: string, okMsg: string) => {
    setNotice(null);
    setError(null);
    startTransition(async () => {
      const res = await saveGoogleSiteVerificationAction(input);
      if (res.ok) {
        setSaved(res.token);
        setValue("");
        setNotice(okMsg);
      } else {
        setError(res.error === "invalid_token" ? t.invalid : t.failed);
      }
    });
  };

  return (
    <details className="rounded-xl border border-neutral-200 p-3">
      <summary className={`flex min-h-10 cursor-pointer items-center rounded-md text-sm font-medium ${FOCUS}`}>
        {t.summary}
      </summary>
      <div className="mt-3 min-w-0 space-y-2">
        <label htmlFor={inputId} className="block text-xs text-neutral-500">
          {t.label}
        </label>
        <p id={helpId} className="text-xs text-neutral-500">
          {t.help}
        </p>
        {saved ? (
          // TUL-1224: long tokens wrap instead of being cut off.
          <p className="text-sm break-all">
            <span className="text-neutral-500">{t.current}: </span>
            {saved}
          </p>
        ) : null}
        <input
          id={inputId}
          type="text"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            if (error) setError(null);
          }}
          disabled={pending}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${helpId} ${errorId}` : helpId}
          // TUL-1224: 16px on phones so iOS Safari does not zoom the page on focus.
          className={`min-h-10 w-full min-w-0 rounded-md border px-3 py-2 text-base sm:text-sm ${
            error ? "border-red-600" : "border-neutral-300"
          } ${FOCUS}`}
        />
        {error ? (
          // TUL-1222: announced immediately and linked to the input via aria-describedby.
          <p id={errorId} role="alert" className="text-xs text-red-700">
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={pending || !value.trim()}
            onClick={() => submit(value, t.saved)}
            className={`min-h-10 rounded-full bg-neutral-900 px-4 text-sm font-medium text-white disabled:opacity-50 ${FOCUS}`}
          >
            {t.save}
          </button>
          {saved ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => submit("", t.removed)}
              className={`min-h-10 rounded-full px-4 text-sm text-neutral-600 hover:bg-neutral-100 ${FOCUS}`}
            >
              {t.remove}
            </button>
          ) : null}
          <span role="status" aria-live="polite" className="text-xs text-neutral-500">
            {notice}
          </span>
        </div>
      </div>
    </details>
  );
}
