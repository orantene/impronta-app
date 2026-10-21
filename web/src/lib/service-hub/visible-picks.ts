/**
 * TUL-1591 (e): the owner picks who stays visible when the roster is over the plan cap.
 * Pure, no I/O.
 *
 * The pick is its own state, `agency_talent_roster.keep_visible` (TUL-1693). It never
 * touches `agency_visibility = 'featured'`, which themes also show as a badge and which
 * drives featured listings. Over the cap, the public directory shows the owner's picks
 * first, then the longest-standing members; the rest are hidden from the public list and
 * never removed.
 * This screen ships with the same flag as that directory wiring
 * (HUB_PLAN_CAP_PICKS_ENABLED=1, default OFF), so it never offers a choice the public site
 * would ignore.
 */

export function visiblePicksEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.HUB_PLAN_CAP_PICKS_ENABLED === "1";
}

/**
 * TUL-1687: the Settings link to this screen shows only with the flag on AND for someone
 * who may edit the roster (the same capability the pick action checks).
 */
export function visiblePicksLinkShown(input: { flagOn: boolean; canEditRoster: boolean }): boolean {
  return input.flagOn === true && input.canEditRoster === true;
}

export type KeepVisibleDecision = { ok: true; next: boolean | null } | { ok: false; reason: "not_public" };

/**
 * What a "keep visible" toggle writes to `keep_visible`. Only a member who is already
 * public (`site_visible` or `featured`) can be picked (making someone public has its own
 * publish checklist on the roster screen). Dropping a pick always works. `next: null` =
 * nothing to change. `agency_visibility` is read only, never written.
 */
export function nextKeepVisible(row: { agencyVisibility: string | null | undefined; keepVisible: boolean }, keep: boolean): KeepVisibleDecision {
  if (keep) {
    if (row.agencyVisibility !== "site_visible" && row.agencyVisibility !== "featured") return { ok: false, reason: "not_public" };
    return { ok: true, next: row.keepVisible ? null : true };
  }
  return { ok: true, next: row.keepVisible ? false : null };
}

export type PicksSummary = { unlimited: boolean; overCap: boolean; hiddenCount: number; tooManyPicks: boolean };

export function picksSummary(input: { cap: number | null; memberCount: number; pickedCount: number }): PicksSummary {
  if (input.cap == null) return { unlimited: true, overCap: false, hiddenCount: 0, tooManyPicks: false };
  const cap = Math.max(0, Math.trunc(input.cap));
  const members = Math.max(0, Math.trunc(input.memberCount));
  const hiddenCount = Math.max(0, members - cap);
  return { unlimited: false, overCap: hiddenCount > 0, hiddenCount, tooManyPicks: hiddenCount > 0 && input.pickedCount > cap };
}

type Copy = {
  title: string;
  intro: string;
  unlimited: string;
  withinCap: string;
  overCap: (hidden: number, cap: number) => string;
  tooManyPicks: (cap: number) => string;
  keep: string;
  kept: string;
  notPublic: string;
  saveError: string;
  notReady: string;
  loadError: string;
  back: string;
  empty: string;
  settingsLinkDesc: string;
  open: string;
};

export const VISIBLE_PICKS_COPY: Record<"en" | "es", Copy> = {
  en: {
    title: "Who stays visible",
    intro: "Your plan shows a set number of people on your public site. Pick who always stays visible. Nobody is removed: hidden people keep their profile, their jobs and their place on your team.",
    unlimited: "Your plan shows everyone. There is nothing to pick.",
    withinCap: "Everyone fits in your plan. Your picks will matter if your team grows past it.",
    overCap: (hidden, cap) => `${hidden} ${hidden === 1 ? "person is" : "people are"} hidden from your public site. The people you pick fill the ${cap} places first, then the people who joined earliest.`,
    tooManyPicks: (cap) => `You picked more people than your ${cap} places. The ones who joined earliest stay visible.`,
    keep: "Keep visible",
    kept: "Saved",
    notPublic: "Show this person on your site first, from their profile.",
    saveError: "Could not save. Try again.",
    notReady: "Keeping people visible is not available yet. Nothing was changed.",
    loadError: "We could not load your team. Try again in a moment.",
    back: "Back to settings",
    empty: "Nobody is shown on your public site yet.",
    settingsLinkDesc: "Pick who stays on your public site when your team is over your plan's limit.",
    open: "Open",
  },
  es: {
    title: "Quién se queda visible",
    intro: "Tu plan muestra un número fijo de personas en tu sitio público. Elige quién se queda siempre visible. Nadie se elimina: las personas ocultas conservan su perfil, sus trabajos y su lugar en tu equipo.",
    unlimited: "Tu plan muestra a todas las personas. No hay nada que elegir.",
    withinCap: "Todas las personas caben en tu plan. Tu elección contará si tu equipo crece.",
    overCap: (hidden, cap) => `${hidden} ${hidden === 1 ? "persona está oculta" : "personas están ocultas"} en tu sitio público. Las personas que elijas ocupan los ${cap} lugares primero y luego quienes llegaron antes.`,
    tooManyPicks: (cap) => `Elegiste más personas que tus ${cap} lugares. Se quedan visibles quienes llegaron antes.`,
    keep: "Mantener visible",
    kept: "Guardado",
    notPublic: "Primero muestra a esta persona en tu sitio, desde su perfil.",
    saveError: "No se pudo guardar. Intenta de nuevo.",
    notReady: "Mantener personas visibles todavía no está disponible. No se cambió nada.",
    loadError: "No pudimos cargar tu equipo. Intenta de nuevo en un momento.",
    back: "Volver a ajustes",
    empty: "Todavía no hay nadie visible en tu sitio público.",
    settingsLinkDesc: "Elige quién se queda en tu sitio público cuando tu equipo pasa el límite de tu plan.",
    open: "Abrir",
  },
};
