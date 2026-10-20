"use client";

import { Building2, Handshake, KeyRound, Network, Users, type LucideIcon } from "lucide-react";
import { useState, useTransition } from "react";

import { saveWorkStyleAction } from "@/lib/server-actions/work-style";
import {
  WORK_STYLE_CHOICES,
  choiceCopy,
  choiceIcon,
  exampleFor,
  presetSummary,
  type ChoiceIcon,
  type WorkStyleChoice,
  type WorkStyleLocale,
} from "@/lib/service-hub/work-style";

const ICONS: Record<ChoiceIcon, LucideIcon> = { network: Network, handshake: Handshake, building: Building2, key: KeyRound, users: Users };

const UI = {
  es: {
    heading: "¿Cómo trabajas con la gente?",
    sub: "Elige una. Lo demás se configura solo y lo cambias cuando quieras en Ajustes.",
    save: "Guardar",
    saving: "Guardando…",
    saved: "Listo. Puedes cambiarlo en Ajustes cuando quieras.",
    unavailable: "Esto aún no está disponible. Inténtalo más tarde.",
    failed: "No se pudo guardar. Inténtalo otra vez.",
    sets: "Esto deja listo:",
  },
  en: {
    heading: "How do you work with people?",
    sub: "Pick one. The rest sets itself up and you can change it anytime in Settings.",
    save: "Save",
    saving: "Saving…",
    saved: "Done. You can change it in Settings anytime.",
    unavailable: "This is not available yet. Please try again later.",
    failed: "Could not save. Please try again.",
    sets: "This sets up:",
  },
} as const;

/** One question, five icon cards. Selecting a card shows what it sets up; Save writes it. */
export function WorkStyleCard({
  initial,
  trade,
  locale,
  onSaved,
}: {
  initial: WorkStyleChoice | null;
  trade: string | null;
  locale: WorkStyleLocale;
  onSaved?: () => void;
}) {
  const t = UI[locale];
  const [choice, setChoice] = useState<WorkStyleChoice | null>(initial);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function save() {
    if (!choice) return;
    setMessage(null);
    start(async () => {
      const res = await saveWorkStyleAction({ choice });
      if (res.ok) {
        setMessage(t.saved);
        onSaved?.();
      } else setMessage(res.reason === "unavailable" ? t.unavailable : t.failed);
    });
  }

  return (
    <section aria-labelledby="work-style-h" className="space-y-4">
      <div>
        <h1 id="work-style-h" className="text-xl font-semibold text-foreground">{t.heading}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t.sub}</p>
      </div>
      <div role="radiogroup" aria-labelledby="work-style-h" className="grid gap-3 sm:grid-cols-2">
        {WORK_STYLE_CHOICES.map((c) => {
          const Icon = ICONS[choiceIcon(c)];
          const copy = choiceCopy(c, locale);
          const on = choice === c;
          return (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setChoice(c)}
              className={`flex min-h-[44px] items-start gap-3 rounded-2xl border p-4 text-left transition ${on ? "border-foreground bg-muted" : "border-border bg-card hover:bg-muted/50"}`}
            >
              <Icon aria-hidden className="mt-0.5 size-5 shrink-0" />
              <span className="space-y-1">
                <span className="block text-sm font-medium text-foreground">{copy.title}</span>
                <span className="block text-xs text-muted-foreground">{copy.line}</span>
                <span className="block text-xs italic text-muted-foreground">{exampleFor(c, trade, locale)}</span>
              </span>
            </button>
          );
        })}
      </div>
      {choice ? (
        <div className="rounded-xl border border-border bg-card p-4 text-sm">
          <p className="mb-2 font-medium text-foreground">{t.sets}</p>
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            {presetSummary(choice, locale).map((line) => <li key={line}>{line}</li>)}
          </ul>
        </div>
      ) : null}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={!choice || pending}
          className="min-h-[44px] rounded-full bg-foreground px-5 text-sm font-medium text-background disabled:opacity-50"
        >
          {pending ? t.saving : t.save}
        </button>
        {message ? <p role="status" className="text-sm text-muted-foreground">{message}</p> : null}
      </div>
    </section>
  );
}
