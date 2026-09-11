/**
 * scan-code.ts — the counter's keyboard-wedge scanner, as pure functions.
 *
 * A barcode or QR scanner in keyboard-wedge mode is a keyboard that types
 * the whole code in a few milliseconds and then presses Enter. Nothing about
 * it is a device the browser can see, so the counter cannot ask "is a
 * scanner connected"; what it can do is watch the document's keystrokes and
 * recognise the SHAPE of a scan: a run of characters arriving faster than a
 * hand can type, closed by Enter, while no text field has focus. This file
 * is that recogniser, plus the rule that turns what was typed into something
 * the catalog can be asked about. No DOM, no React, no I/O: the listener
 * component (`ScannerListener.tsx`) feeds it keystrokes and the route's
 * action resolves the code it hands back.
 *
 * WHAT A CODE CAN BE. `talent_offerings` has no barcode or SKU column
 * (D-POS-12 records this), so the two things a printed code can carry today
 * are the offering's own id (a UUID, which the catalog sells by) and a link
 * code from the QR & Links engine (`/q/<code>`, or the bare code printed
 * under the QR), whose row names the offering in `context.offering_id`.
 * Everything else is "nothing matches", said in a sentence.
 */

/**
 * The links engine's own code grammar, `CODE_PATTERN` in `lib/links/code.ts`,
 * copied by value: that module imports `node:crypto` for its generator, and
 * this file is fed keystrokes from a client component. `scan-code.test.ts`
 * asserts the two are the same regex, so a change there reddens here.
 */
export const LINK_CODE_PATTERN = /^[a-z0-9]([a-z0-9-]{0,30}[a-z0-9])?$/;

/**
 * Keys arriving further apart than this are a person typing, not a scanner.
 * Wedge scanners deliver a character every 1 to 50 ms depending on the
 * model; a fast typist manages one every 120 ms or so, and nothing is
 * focused when this fires (a focused field owns its keys, see
 * `ScannerListener`), so the cost of a person crossing the line is one
 * "nothing matches" toast, never a wrong line. The gap sits above the
 * slowest scanner with room for a busy machine to deliver the events late.
 */
export const SCAN_MAX_GAP_MS = 100;

/** A code shorter than this is a stray keystroke, never a scan. */
export const SCAN_MIN_LENGTH = 4;

export type WedgeState = {
  readonly buffer: string;
  readonly lastAt: number;
};

export const WEDGE_IDLE: WedgeState = { buffer: "", lastAt: 0 };

/**
 * Feed one keystroke. Returns the next state and, when Enter closes a run of
 * fast keystrokes, the code that was scanned. `key` is `KeyboardEvent.key`:
 * printable characters are one character long, everything else (Shift, Tab,
 * Backspace) is a longer name and is ignored rather than buffered.
 */
export function wedgeKey(
  state: WedgeState,
  key: string,
  at: number,
  limits: { maxGapMs?: number; minLength?: number } = {},
): { state: WedgeState; scanned: string | null } {
  const maxGap = limits.maxGapMs ?? SCAN_MAX_GAP_MS;
  const minLength = limits.minLength ?? SCAN_MIN_LENGTH;
  const stale = state.buffer !== "" && at - state.lastAt > maxGap;

  if (key === "Enter") {
    const scanned = !stale && state.buffer.length >= minLength ? state.buffer : null;
    return { state: WEDGE_IDLE, scanned };
  }
  if (key.length !== 1) return { state, scanned: null };

  const buffer = stale ? key : state.buffer + key;
  return { state: { buffer, lastAt: at }, scanned: null };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ScanTarget =
  | { kind: "offering"; offeringId: string }
  | { kind: "link"; code: string };

/**
 * What a scanned string is asking for.
 *
 * A URL is reduced to the code in its `/q/<code>` segment, because a QR
 * printed by the links engine encodes the whole address. A bare UUID is an
 * offering id. Anything else that fits the links engine's own code grammar
 * (`LINK_CODE_PATTERN`, lowercase) is a link code. What fits nothing is `null`,
 * and the caller says "nothing matches" rather than asking the database
 * about a string the database could never hold.
 */
export function scanTarget(raw: string): ScanTarget | null {
  const text = raw.trim();
  if (text === "") return null;
  if (UUID.test(text)) return { kind: "offering", offeringId: text.toLowerCase() };

  const q = /\/q\/([^/?#\s]+)/.exec(text);
  const candidate = (q ? decodeURIComponent(q[1]) : text).toLowerCase();
  if (UUID.test(candidate)) return { kind: "offering", offeringId: candidate };
  if (LINK_CODE_PATTERN.test(candidate)) return { kind: "link", code: candidate };
  return null;
}
