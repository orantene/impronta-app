/**
 * pos-device-mode.ts — which point of sale mode this DEVICE opens by default,
 * and what the top-bar switch shows.
 *
 * TWO THINGS LIVE HERE AND THEY ARE DELIBERATELY SEPARATE.
 *
 *   `posSwitchModel` is PURE. It takes the platform switch, the person's rank,
 *   the workspace's enabled modes and whatever this device remembers, and
 *   answers what the control renders. No storage, no window, no clock — so a
 *   test can drive every gate with real inputs, which is the thing the first
 *   cut of the phone's More sheet could not do (its POS row was gated on a
 *   hardcoded `false` AND on `workspaceEnabledModes: []`, both constant, so
 *   the row was structurally unreachable behind a green suite).
 *
 *   `readDevicePosMode` / `writeDevicePosMode` touch `localStorage`. They are
 *   the impure half and they are tiny on purpose.
 *
 * HYDRATION. What this device remembers is NOT available during a server
 * render and must never decide first paint. `posSwitchModel` therefore takes
 * `remembered` as `PosMode | null` and treats `null` as "not read yet",
 * falling back to the first mode the person may use — a value the server can
 * compute identically. The component reads storage in an effect and re-renders;
 * the label may change after hydration, the LAYOUT never does.
 *
 * WHY THE KEY IS PER WORKSPACE. One human works a till at one business and
 * does the books for another. "The mode this device opens" is a fact about a
 * device AT a workspace, so a shared key would make the bar staff's tablet
 * open the accountant's Projects board the moment they switched workspace.
 */

import { modesForPerson, type PosMode, type PosPersonRole } from "@/lib/pos/modes";

/**
 * Where the remembered mode lives.
 *
 * Namespaced under `tulala.` like every other key this product writes, and
 * suffixed with the workspace so two workspaces on one tablet do not share an
 * answer. `null`/empty tenant keys collapse to `default`, which is the
 * standalone prototype's one implicit workspace — the same convention
 * `enabledPosModesFromSettings` uses for the one implicit location.
 */
export function posDeviceModeStorageKey(tenantKey: string | null | undefined): string {
  const scope = (tenantKey ?? "").trim() || "default";
  return `tulala.pos.device-mode.${scope}`;
}

type MaybeStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
} | null;

function browserStorage(): MaybeStorage {
  // Not `typeof window === "undefined"` alone: Safari in private mode has a
  // `localStorage` object whose every method throws, and a browser set to
  // block site data throws on the ACCESSOR itself. Both are caught by the
  // callers' try/catch; this only avoids the server case.
  if (typeof globalThis === "undefined") return null;
  const w = globalThis as { localStorage?: MaybeStorage };
  return w.localStorage ?? null;
}

/**
 * The mode this device remembers, IF the person may still use it.
 *
 * Narrowing by `allowed` is not politeness. A cashier promoted, demoted, or a
 * workspace that switched a mode off leaves a stale value in a browser nobody
 * will ever clear, and honouring it would open a mode the server then refuses
 * — a redirect loop the user sees as a flicker. An unusable remembered value
 * is treated as no value.
 *
 * Returns `null` for "nothing usable remembered", which is also what every
 * failure returns: storage is a convenience, never a source of truth.
 */
export function readDevicePosMode(
  allowed: readonly PosMode[],
  tenantKey: string | null | undefined,
): PosMode | null {
  try {
    const stored = browserStorage()?.getItem(posDeviceModeStorageKey(tenantKey));
    if (!stored) return null;
    return allowed.includes(stored as PosMode) ? (stored as PosMode) : null;
  } catch {
    return null;
  }
}

/** Remember a mode on this device. Silent on any storage failure, by design. */
export function writeDevicePosMode(
  mode: PosMode,
  tenantKey: string | null | undefined,
): void {
  try {
    browserStorage()?.setItem(posDeviceModeStorageKey(tenantKey), mode);
  } catch {
    /* A device that cannot remember still sells. */
  }
}

export type PosSwitchInput = {
  /** `platform_settings.workspace_pos_enabled`, off the shell bridge. */
  readonly posEnabled: boolean;
  /** The signed-in person's tenant rank, raw. */
  readonly role: PosPersonRole;
  /** `agencies.settings.pos.locations.default.modes`, already parsed. */
  readonly workspaceEnabledModes: readonly PosMode[];
  /** What this device remembers. `null` before the effect has run. */
  readonly remembered: PosMode | null;
  /** Is the point of sale the surface currently open. */
  readonly onPos: boolean;
  /**
   * The mode named in the address, when the person is on the point of sale.
   * Null when the address names none or the value is not a mode. Read by the
   * component in an effect, so the first paint does not depend on it.
   */
  readonly urlMode?: PosMode | null;
};

export type PosSwitchModel =
  | { readonly visible: false }
  | {
      readonly visible: true;
      /** Every mode this person may use, in registry order. Never empty. */
      readonly modes: readonly PosMode[];
      /** The mode the POS half of the control names and opens. */
      readonly currentMode: PosMode;
      /** Which half reads as selected. */
      readonly active: "workspace" | "pos";
      /** Is `currentMode` what this device has actually remembered. */
      readonly currentIsRemembered: boolean;
    };

/**
 * What the top-bar switch renders.
 *
 * Invisible in exactly two cases, and they are different facts: the platform
 * has the point of sale switched off for everybody, or this person has no
 * mode they may use here (a read-only rank, or a workspace with every mode
 * off). Either one alone hides it — an owner on a dark platform sees nothing,
 * and so does a viewer on a live one.
 */
export function posSwitchModel(input: PosSwitchInput): PosSwitchModel {
  if (!input.posEnabled) return { visible: false };
  const modes = modesForPerson({
    role: input.role,
    workspaceEnabledModes: input.workspaceEnabledModes,
  });
  const first = modes[0];
  if (!first) return { visible: false };
  const remembered =
    input.remembered !== null && modes.includes(input.remembered) ? input.remembered : null;
  // A person who arrived at /admin/pos?mode=floor by link is ON the floor,
  // whatever this device last remembered. Three mode proofs each reported the
  // pill saying "Counter" over a Tables screen. The address wins while on the
  // point of sale; the remembered mode is what the pill offers everywhere else.
  const fromUrl =
    input.onPos && input.urlMode && modes.includes(input.urlMode) ? input.urlMode : null;
  return {
    visible: true,
    modes,
    // The address while on the point of sale, else the remembered mode once
    // known, else the first allowed one. All three are values the server can
    // produce, so the first paint is stable.
    currentMode: fromUrl ?? remembered ?? first,
    active: input.onPos ? "pos" : "workspace",
    currentIsRemembered: remembered !== null,
  };
}
