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
    const has = entry.key in out;
    const still = change.hasAfter ? has && out[entry.key] === change.after : !has;
    if (!still) {
      kept.push(entry);
      continue;
    }
    if (change.hadBefore && typeof change.before === "string") out[entry.key] = change.before;
    else delete out[entry.key];
    reverted.push(entry);
  }
  return { tokens: out, reverted, kept };
}
