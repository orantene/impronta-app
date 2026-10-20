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
  describeChanges,
  type Change,
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
    notAllowed: "Solo el dueño o un administrador puede cambiar esto.",
    confirmTitle: "Esto cambiará lo que ya tenías:",
    confirm: "Confirmar cambio",
    cancel: "Cancelar",
    unchanged: "Ya estaba así. No cambió nada.",
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
    notAllowed: "Only the owner or an admin can change this.",
    confirmTitle: "This will change what you already had:",
    confirm: "Confirm change",
    cancel: "Cancel",
    unchanged: "It was already like this. Nothing changed.",
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
  const [changes, setChanges] = useState<Change[] | null>(null);

  function save(confirmed: boolean) {
    if (!choice) return;
    setMessage(null);
    start(async () => {
      const res = await saveWorkStyleAction({ choice, confirmed });
      if (res.ok) {
        setChanges(null);
        setMessage(res.changed ? t.saved : t.unchanged);
        if (res.changed) onSaved?.();
      } else if (res.reason === "confirm_required") setChanges(res.changes);
      else {
        setChanges(null);
        setMessage(res.reason === "unavailable" ? t.unavailable : res.reason === "not_allowed" ? t.notAllowed : t.failed);
      }
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
              onClick={() => { setChoice(c); setChanges(null); setMessage(null); }}
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
      {changes ? (
        <div role="alertdialog" aria-labelledby="work-style-confirm-h" className="rounded-xl border border-foreground bg-card p-4 text-sm" data-testid="work-style-confirm">
          <p id="work-style-confirm-h" className="mb-2 font-medium text-foreground">{t.confirmTitle}</p>
          {changes.length > 0 ? (
            <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
              {describeChanges(changes, locale).map((line) => <li key={line}>{line}</li>)}
            </ul>
          ) : null}
          <div className="mt-3 flex gap-3">
            <button type="button" onClick={() => save(true)} disabled={pending} className="min-h-[44px] rounded-full bg-foreground px-5 text-sm font-medium text-background disabled:opacity-50">{t.confirm}</button>
            <button type="button" onClick={() => setChanges(null)} className="min-h-[44px] rounded-full border border-border px-5 text-sm">{t.cancel}</button>
          </div>
        </div>
      ) : null}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => save(false)}
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
