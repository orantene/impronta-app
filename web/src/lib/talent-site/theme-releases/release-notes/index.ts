/**
 * THEME RELEASES: the authored-notes registry, keyed by design then by the
 * release's TO version. The release manager reads it to prefill a draft
 * release: `notes` is the summary, `codeNotes` feed `diffDesignPayloads`,
 * `byItemId` maps a generated candidate id to its EN/ES note, and (when
 * present) `criticalIds` lists candidates the admin flags critical, with
 * `criticalKeys` naming the design keys that critical item must cover (so a
 * site that removed the block still gets the fix).
 */
import {
  MAISON_V2_RELEASE_2_1,
  MAISON_V2_RELEASE_2_2,
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
}

const MAISON_V2: Readonly<Record<number, AuthoredRelease>> = {
  15: MAISON_V2_RELEASE_2_1,
  16: MAISON_V2_RELEASE_2_2,
};

const REGISTRY: Readonly<Record<string, Readonly<Record<number, AuthoredRelease>>>> = {
  "maison-v2": MAISON_V2,
};

/** The authored release that lands a design on `toVersion`, if any. */
export function authoredRelease(design: string, toVersion: number): AuthoredRelease | null {
  return REGISTRY[design]?.[toVersion] ?? null;
}
