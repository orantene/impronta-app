/**
 * Deterministic normalization of extracted facts (Phase 9).
 *
 * The bake-off showed every model, including the best, echoing hours as the
 * person said them ("de lunes a sábado", "martes a domingo de 1 a 11 de la
 * noche", a list of day names). The hours preset, the arrival sentence and
 * the site all want one shape. Shaping is not the model's job; it is this
 * file's. Pure, locale-agnostic, never invents: a phrase it cannot read is
 * left exactly as it came.
 */

import type { FactInput } from "./brief-store";

const DAY_INDEX: Record<string, number> = {
  // en
  mon: 0, monday: 0, tue: 1, tues: 1, tuesday: 1, wed: 2, wednesday: 2, thu: 3, thur: 3, thurs: 3, thursday: 3,
  fri: 4, friday: 4, sat: 5, saturday: 5, sun: 6, sunday: 6,
  // es (accents stripped)
  lun: 0, lunes: 0, mar: 1, martes: 1, mie: 2, miercoles: 2, jue: 3, jueves: 3, vie: 4, viernes: 4,
  sab: 5, sabado: 5, dom: 6, domingo: 6,
};
const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function strip(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function dayIndex(word: string): number | null {
  const w = strip(word).replace(/[^a-z]/g, "");
  return w in DAY_INDEX ? DAY_INDEX[w] : null;
}

/** "9", "9am", "9:30", "1 de la tarde", "11 de la noche", "7pm", "19:00" → "HH:MM", or null. */
function parseClock(raw: string, hint: "am" | "pm" | null): string | null {
  const m = strip(raw).match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm|h)?/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2] ?? "00";
  if (h > 24) return null;
  const suffix = (m[3] as "am" | "pm" | "h" | undefined) ?? null;
  const pm = suffix === "pm" || hint === "pm";
  const am = suffix === "am" || hint === "am";
  if (pm && h < 12) h += 12;
  if (am && h === 12) h = 0;
  return `${String(h).padStart(2, "0")}:${min}`;
}

/**
 * One hours phrase → "Mon-Sat 09:00-19:00", "Tue-Sun 13:00-23:00",
 * "Mon-Sat", "Every day 10:00-20:00", or null when unreadable.
 */
export function normalizeHoursPhrase(phrase: string): string | null {
  const s = strip(phrase).replace(/\s+/g, " ").trim();
  if (!s) return null;
  if (/^(mon|tue|wed|thu|fri|sat|sun|every day)(-| )/.test(s) && /\d{2}:\d{2}-\d{2}:\d{2}$/.test(s)) return phrase.trim(); // already canonical
  if (/by appointment|con cita|previa cita/.test(s)) return "By appointment";

  // Days: "de lunes a sabado", "lunes a sabado", "mon to sat", "mon-sat", "todos los dias", "every day"
  let days: string | null = null;
  if (/todos los dias|every ?day|diario|all week|toda la semana/.test(s)) days = "Every day";
  const range = s.match(/(?:de |from )?([a-z]+)\s*(?:a|to|-|–|hasta)\s*([a-z]+)/);
  if (!days && range) {
    const a = dayIndex(range[1]);
    const b = dayIndex(range[2]);
    if (a != null && b != null) days = a === b ? DAY_SHORT[a] : `${DAY_SHORT[a]}-${DAY_SHORT[b]}`;
  }
  if (!days) {
    // A list of day names ("lunes, martes, miercoles, jueves, viernes, sabado")
    const found = s.split(/[^a-z]+/).map(dayIndex).filter((d): d is number => d != null);
    if (found.length >= 2) {
      const uniq = [...new Set(found)].sort((x, y) => x - y);
      const contiguous = uniq.every((d, i) => i === 0 || d === uniq[i - 1] + 1);
      if (contiguous) days = uniq.length === 7 ? "Every day" : `${DAY_SHORT[uniq[0]]}-${DAY_SHORT[uniq[uniq.length - 1]]}`;
      else days = uniq.map((d) => DAY_SHORT[d]).join(", ");
    } else if (found.length === 1) {
      days = DAY_SHORT[found[0]];
    }
  }

  // Times: "de 9 a 7", "9 a 19", "from 9 to 7pm", "de 1 a 11 de la noche", "09:00-19:00"
  let time: string | null = null;
  const t = s.match(/(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*(?:a|to|-|–|hasta)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)(?:\s*(de la (?:tarde|noche)|pm|de la manana|am))?/);
  if (t) {
    const tail = t[3] ? strip(t[3]) : "";
    const closeHint: "am" | "pm" | null = /tarde|noche|pm/.test(tail) ? "pm" : /manana|am/.test(tail) ? "am" : null;
    const open = parseClock(t[1], null);
    let close = parseClock(t[2], closeHint);
    if (open && close) {
      // "9 a 7" with no marker: a close before the open is the afternoon.
      if (close <= open && !/am|pm|tarde|noche|manana/.test(t[2] + tail)) {
        const h = Number(close.slice(0, 2)) + 12;
        if (h < 24) close = `${String(h).padStart(2, "0")}${close.slice(2)}`;
      }
      // "de 1 a 11 de la noche": the open hour is the afternoon too.
      if (closeHint === "pm" && Number(open.slice(0, 2)) < 8) {
        const h = Number(open.slice(0, 2)) + 12;
        return finish(days, `${String(h).padStart(2, "0")}${open.slice(2)}-${close}`);
      }
      time = `${open}-${close}`;
    }
  }
  return finish(days, time);
}

function finish(days: string | null, time: string | null): string | null {
  if (days && time) return `${days} ${time}`;
  if (days) return days;
  return null;
}

/** Whole `business.hours` value (string or list) → canonical lines; unreadable lines kept verbatim. */
export function normalizeHoursValue(value: unknown): unknown {
  const lines = Array.isArray(value) ? value.map(String) : typeof value === "string" ? [value] : null;
  if (!lines) return value;
  // A list of bare day names is one phrase, not seven.
  if (lines.length >= 2 && lines.every((l) => dayIndex(l) != null)) {
    return [normalizeHoursPhrase(lines.join(", ")) ?? lines.join(", ")];
  }
  const out = lines.map((l) => normalizeHoursPhrase(l) ?? l.trim()).filter((l) => l.length > 0);
  return [...new Set(out)];
}

/** Digits with a country code → E.164; a bare 10-digit number gets +52 only when the same batch says MX. */
export function normalizePhoneValue(value: unknown, countryHint: string | null): unknown {
  if (typeof value !== "string") return value;
  const digits = value.replace(/[^\d+]/g, "");
  if (/^\+\d{8,15}$/.test(digits)) return digits;
  const bare = digits.replace(/^\+/, "").replace(/^00/, "");
  if (/^52\d{10}$/.test(bare)) return `+${bare}`;
  if (/^\d{10}$/.test(bare) && countryHint && countryHint.toUpperCase() === "MX") return `+52${bare}`;
  return value;
}

/** Trim, dedupe (accent- and case-insensitive), capitalize the first letter. */
export function normalizeServiceList(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of value) {
    const s = String(raw).trim().replace(/\s+/g, " ");
    if (!s) continue;
    const key = strip(s);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s.charAt(0).toUpperCase() + s.slice(1));
  }
  return out;
}

export function normalizeExtractedFacts(facts: FactInput[]): FactInput[] {
  const country = facts.find((f) => f.factKey === "person.country" || f.factKey === "business.country");
  const countryHint = typeof country?.value === "string" ? country.value : null;
  return facts.map((f) => {
    if (f.factKey === "business.hours") return { ...f, value: normalizeHoursValue(f.value) };
    if (f.factKey === "presence.whatsapp" || f.factKey === "presence.phone") return { ...f, value: normalizePhoneValue(f.value, countryHint) };
    if (f.factKey === "work.services" || f.factKey === "menu.categories") return { ...f, value: normalizeServiceList(f.value) };
    return f;
  });
}
