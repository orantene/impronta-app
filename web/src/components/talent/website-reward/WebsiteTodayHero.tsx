"use client";

/**
 * Today's website surfaces (mockup SCREENS.tc_new / tc_new_saved /
 * tc_new_ready, F23 / F34). All read useWebsiteFlow, the same state as the
 * top pill and the My presence card, so one number and one next step show
 * everywhere.
 *
 *  - WebsiteTodayHero: ready / preview. Big ✓ card + "Website preview · Ready".
 *  - WebsiteSetupToday: first-day Today. notReady → "N of 6 done" setup card
 *    (the website checklist, next step first) + "Website preview · Draft";
 *    ready / preview → the hero.
 */

import { useDashboardText } from "@/components/admin/shell/internal/dashboard-i18n";
import { useAdminShell } from "@/components/admin/shell/internal/state";
import { useWebsiteFlow } from "@/components/talent/website-reward/useWebsiteFlow";
import { useOpenWebsiteSlice } from "@/components/talent/website-reward/useOpenWebsiteSlice";
import {
  firstMissingWebsiteSlice,
  websiteSliceProgressSuffix,
  type WebsiteSliceKey,
} from "@/lib/talent/website-eligibility";

const SLICE_LABEL: Record<WebsiteSliceKey, string> = {
  who: "Your name and what you do",
  photos: "Photos of your work",
  offer: "Things clients can book or ask about",
  intro: "A short intro",
  when: "When you are available",
  where: "Where you work",
};

function WebsitePreviewCard({ canBook, ready }: { canBook: boolean; ready: boolean }) {
  const copy = useDashboardText();
  const { bridgeTalentSelfProfile: p } = useAdminShell();
  const T = (en: string, es: string) => (copy.isSpanish ? es : en);
  const tradeCity = [p?.primaryTypeLabel, p?.homeCity?.split(",")[0]].filter(Boolean).join(" · ");
  return (
    <section data-testid="website-today-preview" className="overflow-hidden rounded-2xl border border-admin-border-soft bg-white font-admin-body">
      <div className="flex items-center gap-2 border-b border-admin-border-soft px-4 py-3">
        <span className="flex-1 text-[15px] font-semibold text-admin-ink">{T("Website preview", "Vista previa del sitio")}</span>
        <span className="rounded-full bg-black/[0.06] px-2.5 py-0.5 text-[12px] font-bold text-admin-ink-muted">
          {ready ? T("Ready", "Listo") : T("Draft", "Borrador")}
        </span>
      </div>
      <div
        className="relative h-[200px] bg-stone-200 bg-cover lg:h-[230px]"
        style={p?.headshotUrl ? { backgroundImage: `url(${p.headshotUrl})`, backgroundPosition: "center 30%" } : undefined}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-transparent from-30% to-black/60" />
        <div className="absolute inset-x-4 bottom-3.5 text-white">
          <div className="text-[22px] font-bold">{p?.displayName}</div>
          {tradeCity ? <div className="text-[13.5px] opacity-90">{tradeCity}</div> : null}
          <span className="mt-2.5 inline-flex h-9 items-center rounded-full bg-white px-4 text-[13.5px] font-semibold text-black">
            {canBook ? T("Book a time", "Reservar hora") : T("Request a booking", "Solicitar reserva")}
          </span>
        </div>
      </div>
      <p className="px-4 py-3 text-[13.5px] leading-snug text-admin-ink-muted">
        {canBook
          ? T("Clients can pick a time from your availability.", "Las clientas pueden elegir una hora de tu disponibilidad.")
          : T(
              "Clients can only send a request until you set your availability.",
              "Las clientas solo pueden enviar una solicitud hasta que definas tu disponibilidad.",
            )}
      </p>
    </section>
  );
}

export function WebsiteTodayHero({ canBook }: { canBook: boolean }) {
  const flow = useWebsiteFlow();
  if (!flow.activation?.canManage) return null;
  if (flow.state !== "ready" && flow.state !== "preview") return null;
  return (
    <div
      data-testid="website-today-hero"
      data-flow-state={flow.state}
      className="mb-4 grid gap-4 font-admin-body lg:grid-cols-[minmax(0,1fr)_380px]"
    >
      <section className="flex flex-col gap-4 rounded-2xl border border-admin-border-soft bg-white p-5 sm:flex-row sm:items-center sm:gap-5 sm:p-7">
        <span
          aria-hidden
          className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-emerald-900/10 text-[22px] text-emerald-900 sm:h-16 sm:w-16 sm:text-[28px]"
        >
          ✓
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[20px] font-semibold text-admin-ink sm:text-[22px]">{flow.text.todayTitle}</h2>
          <p className="mt-1 text-[15px] leading-normal text-admin-ink-muted">{flow.text.todaySub}</p>
          {flow.text.todayCta ? (
            <button
              type="button"
              data-testid="website-today-hero-cta"
              onClick={flow.continueSetup}
              className="mt-3.5 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-emerald-900 px-5 text-[15px] font-semibold text-white sm:min-h-11 sm:w-auto"
            >
              {flow.text.todayCta}
            </button>
          ) : null}
        </div>
      </section>
      <WebsitePreviewCard canBook={canBook} ready />
    </div>
  );
}

/** First-day Today (tc_new / tc_new_saved / tc_new_ready). */
export function WebsiteSetupToday({ canBook }: { canBook: boolean }) {
  const copy = useDashboardText();
  const flow = useWebsiteFlow();
  const openSlice = useOpenWebsiteSlice();
  if (flow.state === "ready" || flow.state === "preview") return <WebsiteTodayHero canBook={canBook} />;
  if (flow.state !== "notReady") return null;
  const T = (en: string, es: string) => (copy.isSpanish ? es : en);
  const required = flow.eligibility.slices.filter((s) => s.required);
  const done = required.filter((s) => s.done).length;
  const nextKey = firstMissingWebsiteSlice(required);
  const pct = flow.eligibility.percent ?? 0;
  return (
    <div data-testid="website-setup-today" className="grid gap-4 font-admin-body lg:grid-cols-[minmax(0,1fr)_420px]">
      <section className="rounded-2xl border border-admin-border-soft bg-white p-4 sm:px-6 sm:py-5">
        <div className="mb-4 flex items-center gap-3">
          <span
            aria-hidden
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full border-[3px] border-emerald-900/70 text-[13px] font-bold tabular-nums text-emerald-900"
          >
            {pct}%
          </span>
          <div className="flex-1">
            <div className="text-[18px] font-semibold text-admin-ink">
              {T(`${done} of ${required.length} done`, `${done} de ${required.length} listos`)}
            </div>
            <div className="text-[14px] text-admin-ink-muted">
              {T(
                `Finish all ${required.length} to unlock your free website.`,
                `Completa los ${required.length} para desbloquear tu sitio gratis.`,
              )}
            </div>
          </div>
        </div>
        {nextKey ? (
          <div className="mb-3.5 rounded-xl bg-black/[0.04] p-4">
            <div className="text-[12.5px] font-bold uppercase tracking-[0.06em] text-admin-ink-muted">{T("Next", "Sigue")}</div>
            <div className="mt-1 text-[17px] font-bold text-admin-ink">
              {copy.t(SLICE_LABEL[nextKey])}
              {websiteSliceProgressSuffix(required.find((s) => s.key === nextKey)!)}
            </div>
            <button
              type="button"
              data-testid="website-setup-next"
              onClick={() => openSlice(nextKey)}
              className="mt-3 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-emerald-900 px-5 text-[15px] font-semibold text-white sm:min-h-11 sm:w-auto"
            >
              {T("Open", "Abrir")}
            </button>
          </div>
        ) : null}
        <ul className="flex flex-col gap-1">
          {required
            .filter((s) => s.key !== nextKey)
            .map((s) => (
              <li key={s.key} className="flex min-h-11 items-center gap-3 text-[15px]">
                <span
                  aria-hidden
                  className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[13px] ${s.done ? "bg-emerald-800 text-white" : "border-[1.5px] border-black/20"}`}
                >
                  {s.done ? "✓" : ""}
                </span>
                {s.done ? (
                  <span className="text-admin-ink-muted">{copy.t(SLICE_LABEL[s.key])}</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => openSlice(s.key)}
                    className="flex-1 text-left text-admin-ink underline decoration-black/20 underline-offset-2"
                  >
                    {copy.t(SLICE_LABEL[s.key])}
                    {websiteSliceProgressSuffix(s)}
                  </button>
                )}
              </li>
            ))}
        </ul>
      </section>
      <WebsitePreviewCard canBook={canBook} ready={false} />
    </div>
  );
}
