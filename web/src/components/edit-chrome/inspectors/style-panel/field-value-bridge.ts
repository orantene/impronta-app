/**
 * StylePanel ⇄ field kit — the SLOT BRIDGE.
 *
 * The kit's `FieldValue` is a three-state union (unset / preset / custom). The
 * builder node's style is not: a field with presets stores its token in one key
 * and its exact length in ANOTHER (`radius` + `borderRadius`, `maxWidth` +
 * `maxWidthFree`, `paddingX` + `paddingLeft`/`paddingRight`, …). `preset-state`
 * deliberately refuses to guess which is which — "P2 wires each section's two
 * slots; the kit never guesses" — so this module is that wiring, in one place,
 * as pure functions that can be unit-tested without mounting a panel.
 *
 * Two slot shapes exist and both are here:
 *
 *   TWO-SLOT   token key + free key. Reading prefers the FREE value, because
 *              the renderer layers free after token (free always wins), so the
 *              free length is what the operator is actually looking at. A row
 *              that lit the token chip while a free override was in effect
 *              would be the panel lying about the page.
 *
 *   ONE-SLOT   a single free-length key whose presets are shortcuts into it
 *              (`gap`). Clicking a chip writes that preset's own CSS, and the
 *              chip re-lights by matching the stored length back to the table —
 *              which is why the match normalises `rem` to `px` first: the
 *              renderer's gap scale is written in `rem` (`0.75rem`) while the
 *              honest caption, and therefore the preset's `numeric`, is `px`.
 *              Without the normalisation every gap chip would sit dark beside a
 *              number it had itself just written.
 */

import { remToPx, type PresetTable } from "../field-kit";
import {
  UNSET_FIELD_VALUE,
  type FieldValue,
  type NumericValue,
} from "../field-kit";
import { formatLength } from "../../kit/number-unit";
import { parseCssLength } from "./length-utils";

/** `rem` lengths compared against a table whose numerics are px. */
function toPx(numeric: NumericValue): NumericValue {
  return numeric.unit === "rem"
    ? { value: remToPx(numeric.value), unit: "px" }
    : numeric;
}

// ── Two-slot fields (token key + free key) ───────────────────────────────────

/**
 * What the row should render, given both slots.
 *
 * The free length wins when present, exactly as it does in the renderer.
 */
export function twoSlotFieldValue(
  token: string | undefined,
  free: string | undefined,
): FieldValue {
  const parsed = parseCssLength(free);
  if (parsed) return { kind: "custom", numeric: parsed };
  if (token) return { kind: "preset", id: token };
  return UNSET_FIELD_VALUE;
}

/**
 * The patch a two-slot field writes. ALWAYS clears the slot it is not using —
 * leaving a stale free length behind a freshly clicked token chip is precisely
 * the "I clicked it and nothing changed" class of bug, because the renderer
 * would keep applying the free value.
 */
export function twoSlotPatch(next: FieldValue): {
  token: string | undefined;
  free: string | undefined;
} {
  switch (next.kind) {
    case "unset":
      return { token: undefined, free: undefined };
    case "preset":
      return { token: next.id, free: undefined };
    case "custom":
      return { token: undefined, free: formatLength(next.numeric) };
  }
}

// ── One-slot fields (a free length whose presets are shortcuts) ──────────────

/** What the row renders when the only storage is one free-length key. */
export function oneSlotFieldValue(
  free: string | undefined,
  presets: PresetTable,
): FieldValue {
  const parsed = parseCssLength(free);
  if (!parsed) return UNSET_FIELD_VALUE;
  const px = toPx(parsed);
  const hit = presets.find(
    (p) => p.numeric !== null && p.numeric.value === px.value && p.numeric.unit === px.unit,
  );
  if (hit) return { kind: "preset", id: hit.id };
  return { kind: "custom", numeric: parsed };
}

/** The CSS string a one-slot field writes, or undefined to clear it. */
export function oneSlotPatch(
  next: FieldValue,
  presets: PresetTable,
): string | undefined {
  switch (next.kind) {
    case "unset":
      return undefined;
    case "preset": {
      const hit = presets.find((p) => p.id === next.id);
      // The preset's own CSS, not its px caption: the renderer's scale is
      // authored in rem and re-rounding it to px would quietly re-scale the
      // page at any root font size other than 16.
      return hit ? hit.css : undefined;
    }
    case "custom":
      return formatLength(next.numeric);
  }
}
