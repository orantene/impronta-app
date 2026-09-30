/**
 * THEME RELEASES: the authored-notes registry, keyed by design then by the
 * release's TO version. The release manager reads it to prefill a draft
 * release: `notes` is the summary, `codeNotes` feed `diffDesignPayloads`,
 * `byItemId` maps a generated candidate id to its EN/ES note, and (when
 * present) `criticalIds` lists candidates the admin flags critical, with
 * `criticalKeys` naming the design keys that critical item must cover (so a
 * site that removed the block still gets the fix). `layoutKeys` (optional
 * override) lists candidate ids that together are ONE layout choice: a
 * removed key plus its keyed replacement become an atomic swap even where
 * `diffDesignPayloads` did not detect the pair itself.
 */
import { applyItemEdit } from "../manager/items";
import { swapGroupId } from "../swap";
import type { ReleaseItem } from "../types";
import {
  MAISON_V2_RELEASE_2_1,
  MAISON_V2_RELEASE_2_2,
  MAISON_V2_RELEASE_2_3,
  MAISON_V2_RELEASE_2_4,
  type ReleaseNote,
} from "./maison-v2";

export interface AuthoredRelease {
  design: string;
  notes: ReleaseNote;
  codeNotes: ReadonlyArray<ReleaseNote>;
  byItemId: Readonly<Record<string, ReleaseNote>>;
  /** Candidate ids the admin marks critical (forced, announced). */
  criticalIds?: ReadonlyArray<string>;
  /** Candidate id to the design keys its critical item names explicitly. */
  criticalKeys?: Readonly<Record<string, ReadonlyArray<string>>>;
  /** Groups of candidate ids that are one atomic layout choice (override for swap detection). */
  layoutKeys?: ReadonlyArray<ReadonlyArray<string>>;
}

const MAISON_V2: Readonly<Record<number, AuthoredRelease>> = {
  15: MAISON_V2_RELEASE_2_1,
  16: MAISON_V2_RELEASE_2_2,
  17: MAISON_V2_RELEASE_2_3,
  18: MAISON_V2_RELEASE_2_4,
};

const REGISTRY: Readonly<Record<string, Readonly<Record<number, AuthoredRelease>>>> = {
  "maison-v2": MAISON_V2,
};

/** The authored release that lands a design on `toVersion`, if any. */
export function authoredRelease(design: string, toVersion: number): AuthoredRelease | null {
  return REGISTRY[design]?.[toVersion] ?? null;
}

/**
 * Candidate items with their authored EN/ES notes attached and the critical
 * marks applied (`criticalKeys` becomes the item's explicit `keys`, so the
 * engine can restore a block the talent removed). Unknown ids pass through.
 */
export function withAuthoredNotes(
  candidates: ReadonlyArray<ReleaseItem>,
  release: AuthoredRelease,
): ReleaseItem[] {
  const noted = candidates.map((item) => {
    const id = item.id ?? `${item.type}:${item.key}`;
    const note = release.byItemId[id];
    let next: ReleaseItem = note ? { ...item, note: { en: note.en, es: note.es } } : item;
    if (release.criticalIds?.includes(id)) {
      next = applyItemEdit(next, { critical: true });
      const keys = release.criticalKeys?.[id];
      if (keys) next = { ...next, keys: [...keys] };
    }
    return next;
  });
  return applyLayoutGroups(noted, release.layoutKeys ?? []);
}

const idOf = (i: ReleaseItem) => i.id ?? `${i.type}:${i.key}`;

/** The item's design key without its `tree:` prefix. */
function bareKey(i: ReleaseItem): string {
  return i.tree && i.key.startsWith(`${i.tree}:`) ? i.key.slice(i.tree.length + 1) : i.key;
}

/**
 * Authored `layoutKeys` groups: members share one `group`; a removed key plus
 * a new key also get `swap` so the merge treats them as one atomic swap.
 */
export function applyLayoutGroups(
  items: ReadonlyArray<ReleaseItem>,
  groups: ReadonlyArray<ReadonlyArray<string>>,
): ReleaseItem[] {
  let out = [...items];
  for (const ids of groups) {
    const members = out.filter((i) => ids.includes(idOf(i)));
    if (members.length < 2) continue;
    const removed = members.find((i) => idOf(i).endsWith(":removed"));
    const added = members.find((i) => i !== removed && !idOf(i).endsWith(":removed"));
    const swap = removed && added ? { from: bareKey(removed), to: bareKey(added) } : undefined;
    const group = swap ? swapGroupId(removed!.tree ?? "home", swap) : `layout-group:${ids[0]}`;
    out = out.map((i) => (members.includes(i) ? { ...i, group, ...(swap ? { swap } : {}) } : i));
  }
  return out;
}
