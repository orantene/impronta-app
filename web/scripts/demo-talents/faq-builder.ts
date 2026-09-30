/**
 * FAQ for the demo sites whose theme has an FAQ section (Maison, Maison v2,
 * Ledger, Route, Nest). Every answer is assembled from the demo's own workbook
 * facts (its services, prices, durations, booking modes, place, hours and
 * notice), so it is true to the trade and to the person, in each site language.
 * No promises, no outcomes, no credentials, no invented policies (deposits,
 * refunds and cancellation terms are not in the workbook, so they are not
 * mentioned). Pure: no I/O.
 */
import type { FoundationDemo, FoundationService, SiteLocale } from "./foundation-load";

export type FaqLocale = SiteLocale;
export type Faq = { question: Record<FaqLocale, string>; answer: Record<FaqLocale, string> };

const T = {
  es: {
    days: ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"],
    and: " y ",
    from: "desde",
    quoted: "se cotiza según el trabajo",
    free: "sin costo",
    min: "min",
    hour: "h",
  },
  en: {
    days: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
    and: " and ",
    from: "from",
    quoted: "quoted per job",
    free: "free",
    min: "min",
    hour: "h",
  },
} as const;

const PLACE: Record<string, Record<FaqLocale, string>> = {
  studio: { es: "en mi estudio", en: "at my studio" },
  client_home: { es: "en tu casa", en: "at your home" },
  on_location: { es: "en el lugar del trabajo", en: "on location" },
  online: { es: "en línea", en: "online" },
  venue: { es: "en el lugar del evento", en: "at your venue" },
};

function join(list: string[], l: FaqLocale): string {
  if (list.length <= 1) return list[0] ?? "";
  return `${list.slice(0, -1).join(", ")}${T[l].and}${list[list.length - 1]}`;
}

const name = (s: FoundationService, l: FaqLocale) => (l === "en" ? s.nameEn : s.name);

function money(s: FoundationService, l: FaqLocale): string {
  const n = s.price.toLocaleString(l === "en" ? "en-US" : "es-MX");
  return s.currency === "USD" ? `US$${n}` : `$${n} MXN`;
}

function priceText(s: FoundationService, l: FaqLocale): string {
  if (s.mode === "quote" || s.priceDisplay === "quote") return T[l].quoted;
  if (s.price <= 0) return T[l].free;
  return s.priceDisplay === "from" ? `${T[l].from} ${money(s, l)}` : money(s, l);
}

function duration(s: FoundationService, l: FaqLocale): string {
  const m = s.durationMin;
  if (!m || m <= 0) return "";
  if (m % 60 === 0) return ` (${m / 60} ${T[l].hour})`;
  return ` (${m} ${T[l].min})`;
}

function timeLabel(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

function daysText(days: number[], l: FaqLocale): string {
  const sorted = [...days].sort((a, b) => a - b);
  // Monday-first reads naturally; move Sunday to the end.
  const ordered = [...sorted.filter((d) => d !== 0), ...sorted.filter((d) => d === 0)];
  return join(ordered.map((d) => T[l].days[d]), l);
}

function noticeText(hours: number, l: FaqLocale): string {
  if (hours <= 0) return "";
  if (hours % 24 === 0) {
    const d = hours / 24;
    return l === "en" ? `${d} ${d === 1 ? "day" : "days"}` : `${d} ${d === 1 ? "día" : "días"}`;
  }
  return l === "en" ? `${hours} hours` : `${hours} horas`;
}

/** 3 or 4 Q&As for one demo, in both site languages (the caller stores the ones the site uses). */
export function buildFaq(d: FoundationDemo): Faq[] {
  const out: Faq[] = [];
  const instant = d.services.filter((s) => s.mode === "instant");
  const requestOnly = d.services.filter((s) => s.mode !== "instant");
  const both = (f: (l: FaqLocale) => string) => ({ es: f("es"), en: f("en") });

  // 1. How to book: decided by the real booking modes.
  out.push({
    question: both((l) => (l === "en" ? "How do I book?" : "¿Cómo reservo?")),
    answer: both((l) => {
      if (instant.length && requestOnly.length) {
        const a = join(instant.map((s) => name(s, l)), l);
        const b = join(requestOnly.map((s) => name(s, l)), l);
        return l === "en"
          ? `Pick a service on this page. ${a} can be booked at a time you choose. For ${b}, you send a request with your date and details and I confirm with you.`
          : `Elige un servicio en esta página. ${a} se reserva en el horario que elijas. Para ${b}, me mandas tu solicitud con la fecha y los detalles y lo confirmo contigo.`;
      }
      if (instant.length) {
        return l === "en"
          ? "Pick a service and a time on this page and your booking is set."
          : "Elige un servicio y un horario en esta página y tu reserva queda hecha.";
      }
      return l === "en"
        ? "Pick a service and send a request with your date and details. I confirm the date with you before anything is booked."
        : "Elige un servicio y mándame una solicitud con tu fecha y los detalles. Confirmo la fecha contigo antes de reservar.";
    }),
  });

  // 2. Services and prices, from the workbook.
  const shown = d.services.slice(0, 3);
  out.push({
    question: both((l) => (l === "en" ? "What do you offer and what does it cost?" : "¿Qué ofreces y cuánto cuesta?")),
    answer: both((l) => {
      const parts = shown.map((s) => `${name(s, l)}${duration(s, l)}: ${priceText(s, l)}`);
      const list = parts.join(". ");
      return l === "en"
        ? `${list}. The full menu with descriptions is on this page.`
        : `${list}. El menú completo con descripciones está en esta página.`;
    }),
  });

  // 3. Where the work happens.
  const places = [...new Set(d.services.map((s) => s.location))].filter((k) => PLACE[k]);
  const hood = d.neighbourhood;
  out.push({
    question: both((l) => (l === "en" ? "Where do you work?" : "¿Dónde trabajas?")),
    answer: both((l) => {
      const where = places.length ? join(places.map((k) => PLACE[k][l]), l) : "";
      const base = hood ? `${hood}, ${d.city}` : d.city;
      const travel = d.universal.travelTo.length
        ? l === "en"
          ? ` I also travel to ${join(d.universal.travelTo, l)}.`
          : ` También viajo a ${join(d.universal.travelTo, l)}.`
        : "";
      if (l === "en") return `I am based in ${base}${where ? `, and I work ${where}` : ""}.${travel}`;
      return `Trabajo desde ${base}${where ? `, ${where}` : ""}.${travel}`;
    }),
  });

  // 4. Hours (when the demo has them), else how far ahead to ask (when the workbook says).
  const timed = d.services.filter((s) => s.mode !== "quote");
  const notice = timed.length ? Math.min(...timed.map((s) => s.noticeHours)) : 0;
  if (d.hours) {
    const h = d.hours;
    out.push({
      question: both((l) => (l === "en" ? "What are your hours?" : "¿Cuál es tu horario?")),
      answer: both((l) => {
        const range = `${timeLabel(h.startMin)} - ${timeLabel(h.endMin)}`;
        const n = noticeText(notice, l);
        if (l === "en") return `I book ${daysText(h.days, l)}, ${range}.${n ? ` Please book at least ${n} ahead.` : ""}`;
        return `Atiendo ${daysText(h.days, l)}, de ${timeLabel(h.startMin)} a ${timeLabel(h.endMin)}.${n ? ` Reserva con al menos ${n} de anticipación.` : ""}`;
      }),
    });
  } else if (notice > 0) {
    out.push({
      question: both((l) => (l === "en" ? "How far ahead should I ask?" : "¿Con cuánta anticipación te escribo?")),
      answer: both((l) => {
        const n = noticeText(notice, l);
        return l === "en"
          ? `Send your request at least ${n} before the date you have in mind.`
          : `Mándame tu solicitud con al menos ${n} de anticipación a la fecha que tienes en mente.`;
      }),
    });
  }
  return out;
}
