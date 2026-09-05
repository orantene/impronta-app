/**
 * The PURE view of `/events/<slug>` — no I/O, so it can be rendered against a
 * fixture in a script (the Creative Director reviews the DOM at 375 and
 * desktop from files until a real event exists in production) and the data
 * loader in `page.tsx` stays the only place that touches the database.
 *
 * Sizing follows the builder's buckets so a builder hero and an events hero
 * are the same size at every width: title = the `xl` clamp
 * (2rem…4.5rem at 4vw), section headings = the `lg` clamp
 * (1.35rem…2.25rem at 2vw). Creative Director's ruling, 2026-09-06.
 */

import { TicketPickerIsland } from "@/lib/site-admin/builder-node/ticket-picker-island";

export type Locale = "en" | "es";

export const COPY: Record<Locale, Record<string, string>> = {
  en: {
    dateTba: "Date to be announced", doors: "doors", cta: "Get tickets", lineup: "Lineup", tickets: "Tickets",
    pickTicket: "Pick your ticket", with: "With", ageGate: "Ages {n}+", refunds: "Refunds until {h} hours before doors",
  },
  es: {
    dateTba: "Fecha por anunciar", doors: "puertas", cta: "Conseguir entradas", lineup: "Cartel", tickets: "Entradas",
    pickTicket: "Elegí tu entrada", with: "Con", ageGate: "Mayores de {n}", refunds: "Reembolsos hasta {h} horas antes de puertas",
  },
};

export function whenLabel(iso: string | null, timeZone: string, locale: Locale, withTime = true): string {
  if (!iso) return COPY[locale].dateTba;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return COPY[locale].dateTba;
  try {
    return d.toLocaleString(locale === "es" ? "es" : "en", {
      timeZone, weekday: "long", day: "numeric", month: "long",
      ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
    });
  } catch {
    return d.toISOString(); // never silently the reader's zone
  }
}

export type EventPageModel = {
  tenantId: string;
  eventId: string;
  title: string;
  description: string;
  locale: Locale;
  zone: string;
  venueName: string | null;
  nextAt: string | null;
  doorsAtIso: string | null;
  acts: string[];
  coverUrl: string | null;
  ageGate: number | null;
  refundCutoffHours: number | null;
  /** Test-only: seed the island with a loaded state so a static render shows it. */
  islandPreload?: Parameters<typeof TicketPickerIsland>[0]["preload"];
};

export function EventPageView(m: EventPageModel) {
  const t = (k: string) => COPY[m.locale][k] ?? COPY.en[k] ?? k;
  const eyebrow = `${whenLabel(m.nextAt, m.zone, m.locale, false)}${m.venueName ? ` · ${m.venueName}` : ""}`;
  const subLine = m.acts.length === 1 ? `${t("with")} ${m.acts[0]}` : null;
  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-24 sm:px-6 sm:pb-10">
      {/* HERO — 60vh on a venue page, the event's own image the only colour */}
      <section
        className="relative -mx-4 flex min-h-[60vh] flex-col justify-end overflow-hidden rounded-none sm:-mx-6 sm:rounded-2xl"
        style={m.coverUrl ? { backgroundImage: `url(${m.coverUrl})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
      >
        {m.coverUrl ? <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" /> : null}
        <div className={`relative p-6 sm:p-10 ${m.coverUrl ? "text-white" : ""}`}>
          <div className="text-xs uppercase tracking-wide opacity-80">{eyebrow}</div>
          <h1 className="mt-2 text-[clamp(2rem,4vw,4.5rem)] font-semibold leading-[1.05] tracking-tight">{m.title}</h1>
          {subLine ? <p className="mt-2 text-base opacity-90 sm:text-lg">{subLine}</p> : null}
          {m.doorsAtIso ? (
            <p className="mt-1 text-sm opacity-80">{t("doors")} {whenLabel(m.doorsAtIso, m.zone, m.locale).split(", ").pop()}</p>
          ) : null}
          <a
            href="#tickets"
            className="mt-5 inline-block rounded-full bg-black px-5 py-3 text-sm font-semibold text-white max-sm:fixed max-sm:bottom-4 max-sm:left-4 max-sm:right-4 max-sm:z-20 max-sm:text-center"
          >
            {t("cta")}
          </a>
        </div>
      </section>

      {/* LINEUP — only above one act; an empty grid never renders */}
      {m.acts.length > 1 ? (
        <section className="mt-10">
          <h2 className="text-[clamp(1.35rem,2vw,2.25rem)] font-semibold">{t("lineup")}</h2>
          <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {m.acts.map((a) => (
              <li key={a} className="rounded-xl border border-black/10 p-4 text-sm font-medium">{a}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* NOTE — one optional paragraph, no stats */}
      {m.description ? (
        <section className="mt-10">
          <p className="text-base leading-relaxed text-black/70">{m.description}</p>
          {m.ageGate || m.refundCutoffHours ? (
            <p className="mt-2 text-xs text-black/50">
              {m.ageGate ? t("ageGate").replace("{n}", String(m.ageGate)) : null}
              {m.ageGate && m.refundCutoffHours ? " · " : null}
              {m.refundCutoffHours ? t("refunds").replace("{h}", String(m.refundCutoffHours)) : null}
            </p>
          ) : null}
        </section>
      ) : null}

      {/* TICKETS — the picker where the festival's pass cards were */}
      <section id="tickets" className="mt-10 scroll-mt-24">
        <div className="text-xs uppercase tracking-wide text-black/50">{t("tickets")}</div>
        <h2 className="mt-1 text-[clamp(1.35rem,2vw,2.25rem)] font-semibold tracking-tight">{t("pickTicket")}</h2>
        <div className="mt-4 rounded-2xl border border-black/10">
          <TicketPickerIsland tenantId={m.tenantId} eventId={m.eventId} locale={m.locale} preload={m.islandPreload} />
        </div>
      </section>
    </main>
  );
}
