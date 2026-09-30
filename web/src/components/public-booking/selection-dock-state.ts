/**
 * AUD-044 — services-catalog selection dock state.
 *
 * Pure reducer + copy for the frosted selection dock that replaces the old
 * "Elige tu servicio / Continuar" card. Multi-select: the FRONT item is the
 * first picked; ✕ removes only the front one and remembers it for Undo.
 * No React, no DOM — unit-tested in selection-dock-state.test.ts.
 */

/**
 * Multi-service booking is OFF until the combined-appointment engine ships
 * (Website Settings Foundation rule: multi-service ships only with the
 * combined-appointment program). Booking takes ONE offering, so letting a
 * client pick two and then book only the first would silently drop a service.
 * With this false, picking a second service REPLACES the first (with Undo).
 * The stacked-thumbs / count / "N servicios" paths stay in the code, reachable
 * only when this flips to true alongside the combined-appointment engine.
 */
export const MULTI_SERVICE_ENABLED = false;

export type DockPick = {
  id: string;
  /** Options line from the sheet (variant / extras), when the sheet set it. */
  bits: string | null;
  /** Total in cents for this pick (base or sheet total). */
  totalCents: number;
  currency: string;
  /**
   * Catalog-row price label (#2388 catalogBarPriceLabel: "A cotizar" / "Desde $X").
   * Set for a straight catalog pick; null when the sheet supplied a real total.
   */
  priceLabel?: string | null;
};

export type DockState = {
  picked: DockPick[];
  /**
   * Last pick taken out (✕-removed, or replaced by a switch) + where it sat,
   * for Undo. `replacedBy` is the id that took its place on a switch.
   * Cleared by any other action.
   */
  lastRemoved: { pick: DockPick; index: number; replacedBy?: string } | null;
};

export type DockAction =
  | { type: "toggle"; pick: DockPick }
  /** Sheet-originated select (`tulala:maison-selected`): upsert, never toggles off. */
  | { type: "upsert"; pick: DockPick }
  | { type: "remove_front" }
  | { type: "undo" }
  | { type: "clear" };

export const EMPTY_DOCK: DockState = { picked: [], lastRemoved: null };

/** Reducer factory; `multi` is MULTI_SERVICE_ENABLED in the product. */
export function makeDockReducer(multi: boolean) {
  return function reduce(state: DockState, action: DockAction): DockState {
    return dockReduce(state, action, multi);
  };
}

/** True when picking `id` would REPLACE the current selection (single mode). */
export function dockPickSwitches(state: DockState, id: string, multi = MULTI_SERVICE_ENABLED): boolean {
  return !multi && state.picked.length > 0 && !state.picked.some((p) => p.id === id);
}

function dockReduce(state: DockState, action: DockAction, multi: boolean): DockState {
  switch (action.type) {
    case "toggle": {
      const on = state.picked.some((p) => p.id === action.pick.id);
      if (!on && dockPickSwitches(state, action.pick.id, multi)) {
        return {
          picked: [action.pick],
          lastRemoved: { pick: state.picked[0], index: 0, replacedBy: action.pick.id },
        };
      }
      return {
        picked: on
          ? state.picked.filter((p) => p.id !== action.pick.id)
          : [...state.picked, action.pick],
        lastRemoved: null,
      };
    }
    case "upsert": {
      const i = state.picked.findIndex((p) => p.id === action.pick.id);
      if (i === -1 && !multi) return { picked: [action.pick], lastRemoved: null };
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
      const next = r.replacedBy
        ? state.picked.filter((p) => p.id !== r.replacedBy)
        : state.picked.slice();
      next.splice(Math.min(r.index, next.length), 0, r.pick);
      return { picked: next, lastRemoved: null };
    }
    case "clear":
      return EMPTY_DOCK;
  }
}

export const dockReducer = makeDockReducer(MULTI_SERVICE_ENABLED);

/** TO-1: the toast kinds. `removed` and `switched` carry Undo; the rest are plain confirmations. */
export type DockToastKind = "added" | "removed" | "switched";
export type DockToast = { kind: DockToastKind; name: string };

export function dockToastHasUndo(kind: DockToastKind): boolean {
  return kind === "removed" || kind === "switched";
}

/** 2.6 s for a confirmation, 5 s when the toast offers Undo (the mockup's two timings). */
export function dockToastMs(kind: DockToastKind): number {
  return dockToastHasUndo(kind) ? 5000 : 2600;
}

export type DockCopy = {
  region: string;
  services: (n: number) => string;
  remove: (name: string) => string;
  added: (name: string) => string;
  removed: (name: string) => string;
  switched: (name: string) => string;
  undo: string;
  ask: string;
  askMany: string;
  continueLabel: string;
};

const EN: DockCopy = {
  region: "Your selection",
  services: (n) => `${n} services`,
  remove: (name) => `Remove ${name}`,
  added: (name) => `${name} in your booking`,
  removed: (name) => `Removed ${name}`,
  switched: (name) => `Switched to ${name}`,
  undo: "Undo",
  ask: "Ask about this service",
  askMany: "Ask about these services",
  continueLabel: "Continue",
};

const ES: DockCopy = {
  region: "Tu selección",
  services: (n) => `${n} servicios`,
  remove: (name) => `Quitar ${name}`,
  added: (name) => `${name} en tu cita`,
  removed: (name) => `Quitaste ${name}`,
  switched: (name) => `Cambiaste a ${name}`,
  undo: "Deshacer",
  ask: "Preguntar por este servicio",
  askMany: "Preguntar por estos servicios",
  continueLabel: "Continuar",
};

export function selectionDockCopy(locale: string): DockCopy {
  return locale.toLowerCase().startsWith("es") ? ES : EN;
}

/** The toast line for a toast (copy lives here so the dock and its tests share it). */
export function dockToastText(copy: DockCopy, toast: DockToast): string {
  return copy[toast.kind](toast.name);
}

/**
 * Dock headline + sub line. Single: name / "options · price" (options omitted
 * when none). Multi: "N servicios" / "A + B · $total".
 */
export function dockSummary(
  items: Array<{ title: string; bits: string | null; totalCents: number; priceLabel?: string | null }>,
  locale: string,
  formatPrice: (cents: number) => string,
): { name: string; line: string } {
  const copy = selectionDockCopy(locale);
  if (items.length === 0) return { name: "", line: "" };
  if (items.length === 1) {
    const one = items[0];
    return {
      name: one.title,
      line: (() => {
        const price = one.priceLabel ?? formatPrice(one.totalCents);
        return one.bits ? `${one.bits} · ${price}` : price;
      })(),
    };
  }
  const total = items.reduce((s, i) => s + i.totalCents, 0);
  return {
    name: copy.services(items.length),
    line: `${items.map((i) => i.title).join(" + ")} · ${formatPrice(total)}`,
  };
}
