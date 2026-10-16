/**
 * Task picker (W-11): the pure view-model. Turns the authored tasks plus the
 * live offerings into what the island paints: one card per referenced
 * offering (name, price, duration, booking mode) and the fallback card.
 *
 * Offering data is READ here, never stored: a task keeps only an offering id.
 * A task whose offering is missing or no longer publicly eligible is dropped,
 * so a button never recommends a service the visitor cannot book. The booking
 * mode comes from `deriveOfferingCta`, the same derivation the catalog and the
 * profile button use, so the card never promises a path the server refuses.
 */
import { deriveOfferingCta } from "@/lib/talent/offering-cta-derivation";
import { durationLabel } from "@/lib/talent/duration-label";
import { offeringPriceLabel, type TalentOffering } from "@/lib/talent/offerings-types";

import { isPublicEligibleOffering } from "./services-catalog-selection";
import { TASK_PICKER_TASKS_MAX } from "./task-picker-defaults";
import type { BuilderTaskPickerNode } from "./types";

export type TaskPickerMode = "instant" | "request" | "quote" | "inquiry";

export type TaskPickerCard = {
  offeringId: string;
  name: string;
  category: string | null;
  priceLabel: string;
  duration: string | null;
  mode: TaskPickerMode;
  modeLabel: string;
};

export type TaskPickerViewTask = {
  id: string;
  label: string;
  hint: string;
  icon: NonNullable<NonNullable<BuilderTaskPickerNode["props"]["tasks"]>[number]["icon"]> | undefined;
  offeringId: string;
};

export type TaskPickerModel = {
  tasks: TaskPickerViewTask[];
  cards: Record<string, TaskPickerCard>;
  /** Offerings the island needs for the real CTA (referenced ones only). */
  offerings: TalentOffering[];
  fallback: { offeringId: string; kicker: string; hint: string } | null;
};

const MODE_LABELS: Record<TaskPickerMode, { en: string; es: string }> = {
  instant: { en: "Book online", es: "Agenda en línea" },
  request: { en: "Request, confirmed by hand", es: "Solicitud, se confirma a mano" },
  quote: { en: "Quote first", es: "Cotización primero" },
  inquiry: { en: "By chat", es: "Por chat" },
};

const FALLBACK_KICKER = { en: "Start here", es: "Empieza aquí" };
const FALLBACK_HINT = {
  en: "Not sure what it is? Pick what you see and we will tell you what to book. If in doubt, start with this.",
  es: "¿No sabes qué es? Elige lo que ves y te decimos qué pedir. Si te queda duda, empieza por esto.",
};

export function taskPickerMode(
  offering: TalentOffering,
  confirmsByHand: boolean,
  bookingPosture: string,
): TaskPickerMode {
  const d = deriveOfferingCta({ offering, defaults: { bookingPosture }, confirmsByHand });
  if (d.cta === "ask_quote") return "quote";
  if (d.effectiveMode === "inquiry") return "inquiry";
  return d.instant ? "instant" : "request";
}

function pick(es: boolean, en: string | undefined, esText: string | undefined): string {
  const e = (en ?? "").trim();
  const s = (esText ?? "").trim();
  return es ? s || e : e || s;
}

function offeringName(o: TalentOffering, es: boolean): string {
  const map = o.titleI18n ?? {};
  return (es ? map["es"] : map["en"])?.trim() || o.title;
}

export function buildTaskPickerModel(args: {
  props: BuilderTaskPickerNode["props"];
  offerings: readonly TalentOffering[];
  locale: string;
  confirmsByHand?: boolean;
  bookingPosture?: string;
}): TaskPickerModel {
  const { props } = args;
  const es = args.locale.toLowerCase().startsWith("es");
  const confirmsByHand = args.confirmsByHand ?? true;
  const posture = args.bookingPosture ?? "instant";
  const eligible = new Map(args.offerings.filter(isPublicEligibleOffering).map((o) => [o.id, o]));

  const cards: Record<string, TaskPickerCard> = {};
  const used = new Map<string, TalentOffering>();
  const card = (id: string): boolean => {
    if (cards[id]) return true;
    const o = eligible.get(id);
    if (!o) return false;
    const mode = taskPickerMode(o, confirmsByHand, posture);
    cards[id] = {
      offeringId: id,
      name: offeringName(o, es),
      category: o.category?.trim() || null,
      priceLabel: offeringPriceLabel(o, es ? "es" : "en"),
      duration: o.durationMinutes && o.durationMinutes > 0 ? durationLabel(o.durationMinutes, args.locale) : null,
      mode,
      modeLabel: es ? MODE_LABELS[mode].es : MODE_LABELS[mode].en,
    };
    used.set(id, o);
    return true;
  };

  const tasks: TaskPickerViewTask[] = [];
  for (const t of (props.tasks ?? []).slice(0, TASK_PICKER_TASKS_MAX)) {
    const label = pick(es, t.label, t.labelEs);
    const offeringId = (t.offeringId ?? "").trim();
    if (!label || !offeringId || !card(offeringId)) continue;
    tasks.push({ id: t.id, label, hint: pick(es, t.hint, t.hintEs), icon: t.icon, offeringId });
  }

  const fid = (props.defaultOfferingId ?? "").trim();
  const fallback =
    fid && card(fid)
      ? {
          offeringId: fid,
          kicker: pick(es, props.defaultKicker, props.defaultKickerEs) || (es ? FALLBACK_KICKER.es : FALLBACK_KICKER.en),
          hint: pick(es, props.defaultHint, props.defaultHintEs) || (es ? FALLBACK_HINT.es : FALLBACK_HINT.en),
        }
      : null;

  return { tasks, cards, offerings: [...used.values()], fallback };
}
