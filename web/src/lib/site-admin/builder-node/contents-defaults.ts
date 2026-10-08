import type { BuilderContentsNode } from "./types";

/** One row in a Contents (chapter index) block. */
export type ContentsItem = {
  /** Visible chapter / section label. */
  label: string;
  /** Target fragment id WITHOUT "#"; normalized on save/render. */
  anchor: string;
  /** Optional small caps credit beside the label (magazine index). */
  credit?: string;
};

/** Default props for a freshly inserted `contents` block. */
export const CONTENTS_DEFAULT_PROPS: BuilderContentsNode["props"] = {
  layout: "index",
  eyebrow: "",
  title: "Contents",
  showNumbers: true,
  numberStyle: "roman",
  items: [
    { label: "Editorial", anchor: "chapter-1" },
    { label: "Lookbook", anchor: "chapter-2" },
    { label: "Portraits", anchor: "chapter-3" },
  ],
  useWebsiteTheme: true,
};

export type ContentsLayout = NonNullable<BuilderContentsNode["props"]["layout"]>;
export type ContentsNumberStyle = NonNullable<
  BuilderContentsNode["props"]["numberStyle"]
>;

export const CONTENTS_LAYOUTS: readonly ContentsLayout[] = ["index", "compact"] as const;

export const CONTENTS_NUMBER_STYLES: readonly ContentsNumberStyle[] = [
  "roman",
  "decimal",
] as const;

/** Max authored TOC rows (keeps inspector + DOM bounded). */
export const CONTENTS_ITEMS_MAX = 24;

/** Fresh props for create / kit stamps (items cloned). */
export function cloneContentsDefaultProps(): BuilderContentsNode["props"] {
  return {
    ...CONTENTS_DEFAULT_PROPS,
    items: (CONTENTS_DEFAULT_PROPS.items ?? []).map((it) => ({ ...it })),
  };
}
