import Link from "next/link";
import { ArrowRight, Check, Circle } from "lucide-react";

import type { SeoLang, SeoScore } from "@/lib/talent/seo-score";

const UI = {
  en: { title: "How findable you are", of: "of 100", next: "Fix next", done: "All set" },
  es: { title: "Qué tan fácil te encuentran", of: "de 100", next: "Arreglar ahora", done: "Todo listo" },
} as const;

export function SeoScoreCard({ seo, lang }: { seo: SeoScore; lang: SeoLang }) {
  const t = UI[lang];
  const r = 34;
  const c = 2 * Math.PI * r;
  return (
    <section aria-label={t.title} className="mx-auto max-w-2xl space-y-5 p-6">
      <div className="flex items-center gap-5">
        <div className="relative h-20 w-20 shrink-0">
          <svg viewBox="0 0 80 80" className="h-20 w-20 -rotate-90" aria-hidden="true">
            <circle cx="40" cy="40" r={r} fill="none" strokeWidth="7" className="stroke-neutral-200" />
            <circle
              cx="40"
              cy="40"
              r={r}
              fill="none"
              strokeWidth="7"
              strokeLinecap="round"
              strokeDasharray={c}
              strokeDashoffset={c * (1 - seo.score / 100)}
              className="stroke-neutral-900"
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-xl font-semibold">
            {seo.score}
          </span>
        </div>
        <div className="space-y-1">
          <h2 className="text-xl font-semibold">{t.title}</h2>
          <p className="text-sm text-neutral-500">
            {seo.score} {t.of}
          </p>
        </div>
      </div>
      <ul className="divide-y divide-neutral-100 rounded-2xl border border-neutral-200">
        {seo.items.map((it) => (
          <li key={it.id} className="flex items-start gap-3 px-4 py-3 text-sm">
            {it.done ? (
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
            ) : (
              <Circle className="mt-0.5 h-4 w-4 shrink-0 text-neutral-500" aria-hidden="true" />
            )}
            <div className="min-w-0 flex-1">
              <p className={it.done ? "text-neutral-500" : "font-medium"}>{it.label}</p>
              {it.done ? null : (
                <Link href={it.href} className="text-neutral-500 underline">
                  {it.fix}
                </Link>
              )}
            </div>
          </li>
        ))}
      </ul>
      {seo.next ? (
        <Link
          href={seo.next.href}
          className="inline-flex items-center gap-2 rounded-full bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white"
        >
          {t.next}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      ) : (
        <p className="text-sm font-medium text-emerald-700">{t.done}</p>
      )}
    </section>
  );
}
