"use client";

import { useState, useTransition } from "react";

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

export function GscTokenField({ initialToken, lang }: { initialToken: string | null; lang: GscLang }) {
  const t = UI[lang];
  const [saved, setSaved] = useState<string | null>(initialToken);
  const [value, setValue] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (input: string, okMsg: string) => {
    setStatus(null);
    startTransition(async () => {
      const res = await saveGoogleSiteVerificationAction(input);
      if (res.ok) {
        setSaved(res.token);
        setValue("");
        setStatus(okMsg);
      } else {
        setStatus(res.error === "invalid_token" ? t.invalid : t.failed);
      }
    });
  };

  return (
    <details className="rounded-xl border border-neutral-200 p-3">
      <summary className="cursor-pointer text-sm font-medium">{t.summary}</summary>
      <div className="mt-3 space-y-2">
        <label htmlFor="gsc-token" className="block text-xs text-neutral-500">
          {t.label}
        </label>
        <p className="text-xs text-neutral-500">{t.help}</p>
        {saved ? (
          <p className="truncate text-sm">
            <span className="text-neutral-500">{t.current}: </span>
            {saved}
          </p>
        ) : null}
        <input
          id="gsc-token"
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={pending}
          autoComplete="off"
          spellCheck={false}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={pending || !value.trim()}
            onClick={() => submit(value, t.saved)}
            className="rounded-full bg-neutral-900 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {t.save}
          </button>
          {saved ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => submit("", t.removed)}
              className="rounded-full px-4 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100"
            >
              {t.remove}
            </button>
          ) : null}
          <span role="status" aria-live="polite" className="text-xs text-neutral-500">
            {status}
          </span>
        </div>
      </div>
    </details>
  );
}
