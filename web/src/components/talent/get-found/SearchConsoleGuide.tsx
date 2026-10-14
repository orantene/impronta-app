"use client";

import { useState, useTransition } from "react";
import { Check, Copy, ExternalLink, Info, Link2, Map } from "lucide-react";

import { saveGoogleSiteVerificationAction } from "@/lib/talent/google-site-verification-actions";
import type { GscGuide, GscLang } from "@/lib/talent/search-console-guide";

const UI = {
  en: {
    title: "Google Search Console",
    sub: "Verify your site so Google reports how people find you.",
    cta: "Open Search Console",
    copy: "Copy",
    copied: "Copied",
    site: "Your site URL",
    sitemap: "Your sitemap URL",
    missing: "Publish your site first",
    steps: "Steps",
    tagLabel: "Verification tag or code",
    tagHint: "Paste the meta tag or just the content code Google gives you.",
    save: "Save",
    saved: "Saved",
    invalid: "That does not look like a Google verification code.",
    failed: "Could not save. Try again.",
  },
  es: {
    title: "Google Search Console",
    sub: "Verifica tu sitio para que Google te diga cómo te encuentra la gente.",
    cta: "Abrir Search Console",
    copy: "Copiar",
    copied: "Copiado",
    site: "La URL de tu sitio",
    sitemap: "La URL de tu sitemap",
    missing: "Publica tu sitio primero",
    steps: "Pasos",
    tagLabel: "Etiqueta o código de verificación",
    tagHint: "Pega la etiqueta meta o solo el código content que te da Google.",
    save: "Guardar",
    saved: "Guardado",
    invalid: "Eso no parece un código de verificación de Google.",
    failed: "No se pudo guardar. Intenta de nuevo.",
  },
} as const;

export function SearchConsoleGuide({ guide, lang, initialToken = null }: { guide: GscGuide; lang: GscLang; initialToken?: string | null }) {
  const t = UI[lang];
  const [tag, setTag] = useState(initialToken ?? "");
  const [msg, setMsg] = useState<"saved" | "invalid" | "failed" | null>(null);
  const [pending, startSave] = useTransition();
  const save = () =>
    startSave(async () => {
      const r = await saveGoogleSiteVerificationAction(tag);
      if (r.ok) {
        setTag(r.token ?? "");
        setMsg("saved");
      } else setMsg(r.error === "invalid_token" ? "invalid" : "failed");
    });
  const [done, setDone] = useState<string | null>(null);
  const copy = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setDone(key);
      setTimeout(() => setDone((d) => (d === key ? null : d)), 1500);
    } catch {
      /* clipboard blocked: the value stays visible and selectable */
    }
  };
  const rows = [
    { key: "site", label: t.site, value: guide.siteUrl, Icon: Link2 },
    { key: "sitemap", label: t.sitemap, value: guide.sitemapUrl, Icon: Map },
  ];

  return (
    <section aria-label={t.title} className="mx-auto max-w-2xl space-y-5 p-6">
      <header className="space-y-1">
        <h2 className="text-xl font-semibold">{t.title}</h2>
        <p className="text-sm text-neutral-500">{t.sub}</p>
      </header>
      <a
        href={guide.addPropertyUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 rounded-full bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white"
      >
        {t.cta}
        <ExternalLink size={14} aria-hidden />
      </a>
      <ul className="divide-y divide-neutral-200 rounded-xl border border-neutral-200">
        {rows.map(({ key, label, value, Icon }) => (
          <li key={key} className="flex items-center gap-3 p-3">
            <Icon size={18} className="shrink-0 text-neutral-500" aria-hidden />
            <div className="min-w-0 flex-1">
              <div className="text-xs text-neutral-500">{label}</div>
              {value ? <div className="truncate text-sm">{value}</div> : <div className="text-sm text-amber-700">{t.missing}</div>}
            </div>
            {value ? (
              <button
                type="button"
                onClick={() => copy(key, value)}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-100"
                aria-label={`${t.copy}: ${label}`}
              >
                {done === key ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
                {done === key ? t.copied : t.copy}
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      <ol aria-label={t.steps} className="space-y-3">
        {guide.steps.map((s, i) => (
          <li key={s.id} className="flex items-start gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-xs font-medium">{i + 1}</span>
            <div className="flex items-center gap-1 text-sm">
              {s.title}
              <span title={s.hint} aria-label={s.hint} role="img" tabIndex={0} className="text-neutral-400">
                <Info size={12} aria-hidden />
              </span>
            </div>
          </li>
        ))}
      </ol>
      <div className="space-y-1.5">
        <label htmlFor="gsc-tag" className="flex items-center gap-1 text-xs text-neutral-500">
          {t.tagLabel}
          <span title={t.tagHint} aria-label={t.tagHint} role="img" tabIndex={0} className="text-neutral-400">
            <Info size={12} aria-hidden />
          </span>
        </label>
        <div className="flex items-center gap-2">
          <input
            id="gsc-tag"
            value={tag}
            onChange={(e) => {
              setTag(e.target.value);
              setMsg(null);
            }}
            spellCheck={false}
            autoComplete="off"
            className="min-w-0 flex-1 rounded-md border border-neutral-200 px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="rounded-full bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {msg === "saved" ? t.saved : t.save}
          </button>
        </div>
        {msg === "invalid" || msg === "failed" ? (
          <p role="alert" className="text-xs text-amber-700">{msg === "invalid" ? t.invalid : t.failed}</p>
        ) : null}
      </div>
    </section>
  );
}
