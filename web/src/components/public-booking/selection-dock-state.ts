/**
 * AUD-044 — services-catalog selection dock state.
 *
 * Pure reducer + copy for the frosted selection dock that replaces the old
 * "Elige tu servicio / Continuar" card. Multi-select: the FRONT item is the
 * first picked; ✕ removes only the front one and remembers it for Undo.
 * No React, no DOM — unit-tested in selection-dock-state.test.ts.
 */

export type DockPick = {
  id: string;
  /** Options line from the sheet (variant / extras), when the sheet set it. */
  bits: string | null;
  /** Total in cents for this pick (base or sheet total). */
  totalCents: number;
  currency: string;
};

export type DockState = {
  picked: DockPick[];
  /** Last ✕-removed pick + where it sat, for Undo. Cleared by any other action. */
  lastRemoved: { pick: DockPick; index: number } | null;
};

export type DockAction =
  | { type: "toggle"; pick: DockPick }
  /** Sheet-originated select (`tulala:maison-selected`): upsert, never toggles off. */
  | { type: "upsert"; pick: DockPick }
  | { type: "remove_front" }
  | { type: "undo" }
  | { type: "clear" };

export const EMPTY_DOCK: DockState = { picked: [], lastRemoved: null };

export function dockReducer(state: DockState, action: DockAction): DockState {
  switch (action.type) {
    case "toggle": {
      const on = state.picked.some((p) => p.id === action.pick.id);
      return {
        picked: on
          ? state.picked.filter((p) => p.id !== action.pick.id)
          : [...state.picked, action.pick],
        lastRemoved: null,
      };
    }
    case "upsert": {
      const i = state.picked.findIndex((p) => p.id === action.pick.id);
      if (i === -1) return { picked: [...state.picked, action.pick], lastRemoved: null };
      const next = state.picked.slice();
      next[i] = action.pick;
      return { picked: next, lastRemoved: null };
    }
    case "remove_front": {
      const [front, ...rest] = state.picked;
      if (!front) return state;
      return { picked: rest, lastRemoved: { pick: front, index: 0 } };
    }
    case "undo": {
      const r = state.lastRemoved;
      if (!r || state.picked.some((p) => p.id === r.pick.id)) {
        return { ...state, lastRemoved: null };
      }
      const next = state.picked.slice();
      next.splice(Math.min(r.index, next.length), 0, r.pick);
      return { picked: next, lastRemoved: null };
    }
    case "clear":
      return EMPTY_DOCK;
  }
}

export type DockCopy = {
  region: string;
  services: (n: number) => string;
  remove: (name: string) => string;
  removed: (name: string) => string;
  undo: string;
  ask: string;
  askMany: string;
  continueLabel: string;
};

const EN: DockCopy = {
  region: "Your selection",
  services: (n) => `${n} services`,
  remove: (name) => `Remove ${name}`,
  removed: (name) => `Removed ${name}`,
  undo: "Undo",
  ask: "Ask about this service",
  askMany: "Ask about these services",
  continueLabel: "Continue",
};

const ES: DockCopy = {
  region: "Tu selección",
  services: (n) => `${n} servicios`,
  remove: (name) => `Quitar ${name}`,
  removed: (name) => `Quitaste ${name}`,
  undo: "Deshacer",
  ask: "Preguntar por este servicio",
  askMany: "Preguntar por estos servicios",
  continueLabel: "Continuar",
};

export function selectionDockCopy(locale: string): DockCopy {
  return locale.toLowerCase().startsWith("es") ? ES : EN;
}

/**
 * Dock headline + sub line. Single: name / "options · price" (options omitted
 * when none). Multi: "N servicios" / "A + B · $total".
 */
export function dockSummary(
  items: Array<{ title: string; bits: string | null; totalCents: number }>,
  locale: string,
  formatPrice: (cents: number) => string,
): { name: string; line: string } {
  const copy = selectionDockCopy(locale);
  if (items.length === 0) return { name: "", line: "" };
  if (items.length === 1) {
    const one = items[0];
    return {
      name: one.title,
      line: one.bits ? `${one.bits} · ${formatPrice(one.totalCents)}` : formatPrice(one.totalCents),
    };
  }
  const total = items.reduce((s, i) => s + i.totalCents, 0);
  return {
    name: copy.services(items.length),
    line: `${items.map((i) => i.title).join(" + ")} · ${formatPrice(total)}`,
  };
}
