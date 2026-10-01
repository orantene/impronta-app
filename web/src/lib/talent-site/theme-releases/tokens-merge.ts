/**
 * THEME RELEASES: three-way merge of a Design's token defaults (plan §1.4).
 *
 * base = defaults at the pinned version, theirs = defaults at the target,
 * ours = `design_tokens_draft`. Per key the release changed:
 *   - ours has no value      untouched: theirs is WRITTEN (render-time defaults
 *                            come from code, so authored versions must land)
 *   - ours equals the base   (or hashes to `theme_token_origin`) untouched:
 *                            take theirs (a removed default removes the key)
 *   - ours differs           the talent's value: kept
 * A critical item forces theirs. Pure.
 */
import { isPaletteTokenKey } from "../theme-catalog/look-layer";
import { paletteItemKey, parsePaletteItemKey } from "./palette-keys";
import { hashString } from "./origin";
import type { AllowFn } from "./policy";
import type { MergeEntry, DesignMergeReport } from "./types";

export interface TokenMergeInput {
  base: Readonly<Record<string, string>>;
  ours: Readonly<Record<string, string>>;
  theirs: Readonly<Record<string, string>>;
  origin?: Readonly<Record<string, string>>;
  allow: AllowFn;
  report: DesignMergeReport;
  nextSeq: () => number;
}

export function mergeTokenDefaults(input: TokenMergeInput): Record<string, string> {
  const { base, ours, theirs, origin, allow, report, nextSeq } = input;
  const out: Record<string, string> = { ...ours };
  const keys = [...new Set([...Object.keys(base), ...Object.keys(theirs)])].sort();
  for (const key of keys) {
    const hadBase = key in base;
    const hasTheirs = key in theirs;
    if (hadBase === hasTheirs && base[key] === theirs[key]) continue;
    const allowance = allow("token", key);
    const entry = (extra: Partial<MergeEntry>): MergeEntry => ({
      seq: nextSeq(),
      change: "token",
      key,
      ...(allowance.itemId ? { itemId: allowance.itemId } : {}),
      ...(allowance.itemType ? { itemType: allowance.itemType } : {}),
      ...extra,
    });
    if (!allowance.ok) {
      report.pending.push(entry({ reason: "not_in_release" }));
      continue;
    }
    const hasOurs = key in ours;
    if (!hasOurs) {
      // Untouched (no own value). Write the new default explicitly: render-time
      // design defaults come from CODE, so an editor-authored version would
      // otherwise never reach this site. A removed default stays absent.
      if (hasTheirs) {
        out[key] = theirs[key]!;
        report.applied.push(
          entry({
            reason: "inherits_default",
            changes: [{ path: key, hadBefore: false, hasAfter: true, after: theirs[key] }],
          }),
        );
      } else {
        report.applied.push(entry({ reason: "inherits_default" }));
      }
      continue;
    }
    const untouched =
      (hadBase && ours[key] === base[key]) ||
      (origin?.[key] !== undefined && origin[key] === hashString(ours[key]!));
    if (!untouched && !allowance.critical) {
      report.kept.push(entry({ reason: "edited" }));
      continue;
    }
    if (hasTheirs) out[key] = theirs[key]!;
    else delete out[key];
    report.applied.push(
      entry({
        ...(untouched ? {} : { reason: "critical" }),
        changes: [
          {
            path: key,
            hadBefore: true,
            before: ours[key],
            hasAfter: hasTheirs,
            ...(hasTheirs ? { after: theirs[key] } : {}),
          },
        ],
      }),
    );
  }
  return out;
}

export interface PaletteMergeInput {
  key: string;
  base: Readonly<Record<string, string>>;
  theirs: Readonly<Record<string, string>>;
  tokens: Readonly<Record<string, string>>;
  allow: AllowFn;
  report: DesignMergeReport;
  nextSeq: () => number;
}

/**
 * Palette colour edits for a site on palette `key`. Per colour the release
 * changed: no own value or still the old palette colour = untouched, the new
 * colour is written; any other value is the talent's (custom colours, kept).
 * The allow key is the release item key `palette:<key>:<token>`. Pure.
 */
export function mergePaletteTokens(input: PaletteMergeInput): Record<string, string> {
  const { key: palette, base, theirs, tokens, allow, report, nextSeq } = input;
  const out: Record<string, string> = { ...tokens };
  const keys = [...new Set([...Object.keys(base), ...Object.keys(theirs)])].filter((k) => isPaletteTokenKey(k)).sort();
  for (const key of keys) {
    if (base[key] === theirs[key]) continue;
    const itemKey = paletteItemKey(palette, key);
    const allowance = allow("token", itemKey);
    const entry = (extra: Partial<MergeEntry>): MergeEntry => ({
      seq: nextSeq(),
      change: "token",
      key: itemKey,
      ...(allowance.itemId ? { itemId: allowance.itemId } : {}),
      ...(allowance.itemType ? { itemType: allowance.itemType } : {}),
      ...extra,
    });
    if (!allowance.ok) {
      report.pending.push(entry({ reason: "not_in_release" }));
      continue;
    }
    const hasOurs = key in out;
    const untouched = !hasOurs || out[key] === base[key];
    if (!untouched && !allowance.critical) {
      report.kept.push(entry({ reason: "edited" }));
      continue;
    }
    const hasTheirs = key in theirs;
    const before = out[key];
    if (hasTheirs) out[key] = theirs[key]!;
    else delete out[key];
    report.applied.push(
      entry({
        ...(untouched ? {} : { reason: "critical" }),
        changes: [
          {
            path: key,
            hadBefore: hasOurs,
            ...(hasOurs ? { before } : {}),
            hasAfter: hasTheirs,
            ...(hasTheirs ? { after: theirs[key] } : {}),
          },
        ],
      }),
    );
  }
  return out;
}

/** Undo token entries whose value is still what the update wrote. */
export function reverseTokenEntries(
  entries: ReadonlyArray<MergeEntry>,
  tokens: Readonly<Record<string, string>>,
): { tokens: Record<string, string>; reverted: MergeEntry[]; kept: MergeEntry[] } {
  const out: Record<string, string> = { ...tokens };
  const reverted: MergeEntry[] = [];
  const kept: MergeEntry[] = [];
  for (const entry of entries) {
    const change = entry.changes?.[0];
    if (entry.change !== "token" || !change) continue;
    // Palette entries are keyed `palette:<p>:<token>`; the site token is the change path.
    const tk = parsePaletteItemKey(entry.key) ? change.path : entry.key;
    const has = tk in out;
    const still = change.hasAfter ? has && out[tk] === change.after : !has;
    if (!still) {
      kept.push(entry);
      continue;
    }
    if (change.hadBefore && typeof change.before === "string") out[tk] = change.before;
    else delete out[tk];
    reverted.push(entry);
  }
  return { tokens: out, reverted, kept };
}
