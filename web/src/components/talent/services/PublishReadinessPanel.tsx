"use client";

/**
 * TUL-1270 #11: "Ready to publish?" in the Services editor. Lists every
 * required field that is missing (the same list the server refuses on) plus a
 * non-blocking photo tip. Own en + es copy so the shared i18n files stay out
 * of this change.
 */
import { useDashboardText } from "@/components/admin/shell/internal/dashboard-i18n";
import { publishGapLabel, type PublishReadiness } from "@/lib/talent/publish-readiness";

const COPY = {
  en: {
    title: "Ready to publish?",
    yes: "Yes",
    notYet: "Not yet",
    ok: "Clients have everything they need to book it.",
    needs: "Add these before you publish:",
    needsLive: "This item is live and saves as usual. Add these so clients can book it:",
    photo: "Tip: add a photo so it stands out.",
  },
  es: {
    title: "¿Listo para publicar?",
    yes: "Sí",
    notYet: "Todavía no",
    ok: "Tus clientes tienen todo lo que necesitan para reservarlo.",
    needs: "Agrega esto antes de publicar:",
    needsLive: "Este servicio está publicado y se guarda como siempre. Agrega esto para que tus clientes puedan reservarlo:",
    photo: "Consejo: agrega una foto para que destaque.",
  },
} as const;

export function PublishReadinessPanel({ readiness, isLive }: { readiness: PublishReadiness; isLive: boolean }) {
  const copy = useDashboardText();
  const es = copy.isSpanish;
  const t = es ? COPY.es : COPY.en;
  return (
    <div className="rounded-2xl border border-admin-border-soft bg-white px-4 py-4" data-publish-readiness={readiness.ready ? "ready" : "missing"}>
      <div className="flex items-center justify-between">
        <p className="font-admin-body text-[12px] font-medium tracking-[0.1px] text-admin-ink">{t.title}</p>
        <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${readiness.ready ? "tc-status tc-status-ok" : "tc-status tc-status-warn"}`}>
          {readiness.ready ? t.yes : t.notYet}
        </span>
      </div>
      {readiness.ready ? (
        <p className="mt-2 text-[13.5px] leading-snug text-admin-ink">{t.ok}</p>
      ) : (
        <>
          <p className="mt-2 text-[13.5px] leading-snug text-admin-ink">{isLive ? t.needsLive : t.needs}</p>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-[13.5px] text-admin-ink">
            {readiness.missing.map((gap) => (
              <li key={gap} data-missing={gap}>
                {publishGapLabel(gap, es)}
              </li>
            ))}
          </ul>
        </>
      )}
      {readiness.advice.includes("photo") ? <p className="mt-2 text-[12.5px] text-admin-ink-dim">{t.photo}</p> : null}
    </div>
  );
}
