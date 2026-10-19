"use client";

import { useState } from "react";
import {
  Check,
  Clock,
  Copy,
  ExternalLink,
  Globe,
  Info,
  Link2,
  MapPin,
  Store,
  Tag,
} from "lucide-react";

import type { GbpFieldKey, GbpGuide, GbpLang } from "@/lib/talent/google-business-profile-guide";

const ICONS: Record<GbpFieldKey, typeof Store> = {
  name: Store,
  category: Tag,
  location: MapPin,
  hours: Clock,
  website: Globe,
  booking: Link2,
};

const UI = {
  en: {
    title: "Get found on Google",
    sub: "Your Google Business Profile, pre-filled. Copy each line as you go.",
    cta: "Open Google Business Profile",
    copy: "Copy",
    copied: "Copied",
    missing: "Add this in your profile first",
    steps: "Steps",
  },
  es: {
    title: "Que te encuentren en Google",
    sub: "Tu Perfil de Negocio de Google, ya llenado. Copia cada línea sobre la marcha.",
    cta: "Abrir Perfil de Negocio de Google",
    copy: "Copiar",
    copied: "Copiado",
    missing: "Agrégalo primero en tu perfil",
    steps: "Pasos",
  },
} as const;

export function GoogleBusinessGuide({ guide, lang }: { guide: GbpGuide; lang: GbpLang }) {
  const t = UI[lang];
  const [done, setDone] = useState<string | null>(null);

  const copy = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setDone(key);
      setTimeout(() => setDone((d) => (d === key ? null : d)), 1500);
    } catch {
      /* clipboard blocked: the value is visible and selectable */
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">{t.title}</h1>
        <p className="text-sm text-neutral-500">{t.sub}</p>
      </header>

      <a
        href={guide.claimUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 rounded-full bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white"
      >
        {t.cta}
        <ExternalLink size={14} aria-hidden />
      </a>

      <ul className="divide-y divide-neutral-200 rounded-xl border border-neutral-200">
        {guide.fields.map((f) => {
          const Icon = ICONS[f.key];
          return (
            <li key={f.key} className="flex items-center gap-3 p-3">
              <Icon size={18} className="shrink-0 text-neutral-500" aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1 text-xs text-neutral-500">
                  {f.label}
                  <span title={f.hint} aria-label={f.hint} role="img" tabIndex={0}>
                    <Info size={12} aria-hidden />
                  </span>
                </div>
                {f.value ? (
                  <div className="truncate text-sm">{f.value}</div>
                ) : (
                  <div className="text-sm text-amber-700">{t.missing}</div>
                )}
                {f.alternatives.length > 0 ? (
                  <div className="truncate text-xs text-neutral-600">{f.alternatives.join(", ")}</div>
                ) : null}
              </div>
              {f.value ? (
                <button
                  type="button"
                  onClick={() => copy(f.key, f.value as string)}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-100"
                  aria-label={`${t.copy}: ${f.label}`}
                >
                  {done === f.key ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
                  {done === f.key ? t.copied : t.copy}
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>

      <section aria-label={t.steps}>
        <ol className="space-y-3">
          {guide.steps.map((s, i) => (
            <li key={s.id} className="flex items-start gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-xs font-medium">
                {i + 1}
              </span>
              <div className="flex items-center gap-1 text-sm">
                {s.title}
                <span title={s.hint} aria-label={s.hint} role="img" tabIndex={0} className="text-neutral-600">
                  <Info size={12} aria-hidden />
                </span>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
