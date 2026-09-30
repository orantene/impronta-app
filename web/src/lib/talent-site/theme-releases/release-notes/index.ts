/**
 * THEME RELEASES: generated release items = payload diff + authored release
 * notes (pure). A design + version with a module in `MODULES` gets its code
 * notes as `code` items, its per-item notes prefilled (EN/ES) and its release
 * summary; the two layout candidates in `layoutKeys` (one talent-facing change
 * such as the hero inset, which shows up as a removal plus a keyed
 * replacement) collapse into ONE item that covers both keys.
 */
import type { DesignPayload } from "../../theme-catalog/types";
import { diffDesignPayloads, type CandidateItem } from "../diff-payload";
import type { ReleaseItem, ReleaseNotes } from "../types";
import { MAISON_V2_RELEASE_2_1, type ReleaseNote } from "./maison-v2";

export interface ReleaseNoteModule {
  design: string;
  toVersion: number;
  notes: ReleaseNote;
  codeNotes: ReadonlyArray<ReleaseNote>;
  byItemId: Readonly<Record<string, ReleaseNote>>;
  /** Candidate ids that together are ONE talent-facing layout change. */
  layoutKeys: ReadonlyArray<string>;
}

const MODULES: ReadonlyArray<ReleaseNoteModule> = [MAISON_V2_RELEASE_2_1];

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

export function generateReleaseItems(
  design: string,
  from: { payload: DesignPayload; version: number },
  to: { payload: DesignPayload; version: number },
): { items: ReleaseItem[]; notes: ReleaseNotes } {
  const mod = releaseNotesFor(design, to.version);
  let items: CandidateItem[] = diffDesignPayloads(design, from, to, mod?.codeNotes ?? []);
  if (!mod) return { items, notes: {} };
  if (mod.layoutKeys.length > 0) items = groupLayoutItems(items, mod.layoutKeys, `layout:${design}:hero-inset`);
  const groupNote = mod.layoutKeys.map((k) => mod.byItemId[k]).find(Boolean);
  const filled = items.map((it): CandidateItem => {
    const grouped = it.id === `layout:${design}:hero-inset`;
    const note = (it.id ? mod.byItemId[it.id] : undefined) ?? (grouped ? groupNote : undefined);
    return note && !it.note ? { ...it, note: { en: note.en, es: note.es } } : it;
  });
  return { items: filled, notes: { en: mod.notes.en, es: mod.notes.es } };
}
