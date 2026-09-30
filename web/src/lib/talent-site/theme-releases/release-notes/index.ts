/**
 * THEME RELEASES: the authored-notes registry and the ONE release-item
 * generator (pure). A design + version with a module in `MODULES` gets:
 *  - its `codeNotes` as `code` items (a renderer fix has no payload diff);
 *  - its per-item notes prefilled (EN/ES) and its release summary;
 *  - the candidates in `layoutKeys` (one talent-facing change, such as the
 *    hero inset or the services layout, which shows up as a removal plus a
 *    keyed replacement) collapsed into ONE item that covers both keys;
 *  - critical marks: candidates in `criticalIds` become `critical` items, and
 *    `criticalKeys` names the design keys each covers explicitly (so a site
 *    that removed the block still gets the fix).
 */
import type { DesignPayload } from "../../theme-catalog/types";
import { applyItemEdit } from "../manager/items";
import { diffDesignPayloads, type CandidateItem } from "../diff-payload";
import type { ReleaseItem, ReleaseNotes } from "../types";
import {
  MAISON_V2_RELEASE_2_1,
  MAISON_V2_RELEASE_2_2,
  MAISON_V2_RELEASE_2_3,
  type ReleaseNote,
} from "./maison-v2";

export interface ReleaseNoteModule {
  design: string;
  toVersion: number;
  notes: ReleaseNote;
  codeNotes: ReadonlyArray<ReleaseNote>;
  byItemId: Readonly<Record<string, ReleaseNote>>;
  /** Candidate ids that together are ONE talent-facing layout change. */
  layoutKeys?: ReadonlyArray<string>;
  /** Id of the collapsed layout item (default `layout:<design>:hero-inset`). */
  layoutGroupId?: string;
  /** Candidate ids the admin marks critical (forced, announced). */
  criticalIds?: ReadonlyArray<string>;
  /** Candidate id to the design keys its critical item names explicitly. */
  criticalKeys?: Readonly<Record<string, ReadonlyArray<string>>>;
}

const MODULES: ReadonlyArray<ReleaseNoteModule> = [
  MAISON_V2_RELEASE_2_1,
  MAISON_V2_RELEASE_2_2,
  MAISON_V2_RELEASE_2_3,
];

export function releaseNotesFor(design: string, toVersion: number): ReleaseNoteModule | null {
  return MODULES.find((m) => m.design === design && m.toVersion === toVersion) ?? null;
}

/** Collapse the candidates named in `layoutKeys` into one layout item. */
export function groupLayoutItems(
  items: ReadonlyArray<CandidateItem>,
  layoutKeys: ReadonlyArray<string>,
  groupId: string,
): CandidateItem[] {
  const hits = items.filter((i) => i.type === "layout" && i.id && layoutKeys.includes(i.id));
  if (hits.length < 2) return [...items];
  const tree = hits.every((h) => h.tree === hits[0]!.tree) ? hits[0]!.tree : undefined;
  const grouped: CandidateItem = {
    id: groupId,
    type: "layout",
    key: hits[0]!.key,
    keys: hits.map((h) => h.key),
    ...(tree ? { tree } : {}),
    layout: "nested-new",
    detail: { layout: "nested-new", grouped: hits.map((h) => h.id) },
  };
  const out: CandidateItem[] = [];
  let placed = false;
  for (const it of items) {
    if (hits.includes(it)) {
      if (!placed) {
        out.push(grouped);
        placed = true;
      }
      continue;
    }
    out.push(it);
  }
  return out;
}

/**
 * Attach the authored notes and apply the critical marks to candidate items.
 * Unknown ids pass through untouched.
 */
export function withAuthoredNotes(
  candidates: ReadonlyArray<ReleaseItem>,
  mod: ReleaseNoteModule,
  groupNote?: ReleaseNote,
): ReleaseItem[] {
  const groupId = mod.layoutGroupId ?? `layout:${mod.design}:hero-inset`;
  return candidates.map((item) => {
    const id = item.id ?? `${item.type}:${item.key}`;
    const note = mod.byItemId[id] ?? (id === groupId ? groupNote : undefined);
    let next: ReleaseItem = note && !item.note ? { ...item, note: { en: note.en, es: note.es } } : item;
    if (mod.criticalIds?.includes(id)) {
      next = applyItemEdit(next, { critical: true });
      const keys = mod.criticalKeys?.[id];
      if (keys) next = { ...next, keys: [...keys] };
    }
    return next;
  });
}

export function generateReleaseItems(
  design: string,
  from: { payload: DesignPayload; version: number },
  to: { payload: DesignPayload; version: number },
): { items: ReleaseItem[]; notes: ReleaseNotes } {
  const mod = releaseNotesFor(design, to.version);
  let items: CandidateItem[] = diffDesignPayloads(design, from, to, mod?.codeNotes ?? []);
  if (!mod) return { items, notes: {} };
  const layoutKeys = mod.layoutKeys ?? [];
  const groupId = mod.layoutGroupId ?? `layout:${design}:hero-inset`;
  if (layoutKeys.length > 0) items = groupLayoutItems(items, layoutKeys, groupId);
  const groupNote = layoutKeys.map((k) => mod.byItemId[k]).find(Boolean);
  return { items: withAuthoredNotes(items, mod, groupNote), notes: { en: mod.notes.en, es: mod.notes.es } };
}
