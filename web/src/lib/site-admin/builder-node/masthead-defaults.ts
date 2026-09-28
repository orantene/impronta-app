import type { BuilderMastheadNode } from "./types";

/** Default props for a freshly inserted `masthead` (stacked giant words) block. */
export const MASTHEAD_DEFAULT_PROPS: BuilderMastheadNode["props"] = {
  lines: ["{{displayName}}"],
  /** Split a single space-separated line into stacked rows at render. */
  splitWords: true,
  subline: "",
  creditLine: "",
  showCover: true,
  coverFilter: "bw",
  coverSrc: "{{headshotUrl}}",
  useWebsiteTheme: true,
};

export type MastheadCoverFilter = NonNullable<
  BuilderMastheadNode["props"]["coverFilter"]
>;

export const MASTHEAD_COVER_FILTERS: readonly MastheadCoverFilter[] = [
  "bw",
  "none",
] as const;

/** Max authored stack lines (keeps inspector + DOM bounded). */
export const MASTHEAD_LINES_MAX = 8;

/** Fresh props for create / kit stamps (lines cloned). */
export function cloneMastheadDefaultProps(): BuilderMastheadNode["props"] {
  return {
    ...MASTHEAD_DEFAULT_PROPS,
    lines: (MASTHEAD_DEFAULT_PROPS.lines ?? []).slice(),
  };
}
