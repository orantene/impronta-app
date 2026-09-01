/**
 * builder-2027-anchor-fields.ts — the Content-tab field schema for the four
 * ANCHOR-DESIGN primitives (sticky scroll, reveal, stats, before/after).
 *
 * Split out of `builder-2027-fields.ts` purely for the 800-line file cap: this
 * is group DATA only. The control types, the kind list, and the coverage helper
 * stay in that file, which is the one every consumer imports.
 *
 * See `builder-2027-fields.ts` for why the description of the controls is
 * separated from the rendering of them at all.
 */
import type { Builder2027Group } from "./builder-2027-fields";

export const BUILDER_2027_ANCHOR_GROUPS: Readonly<
  Record<
    "sticky_scroll" | "reveal" | "stats" | "before_after",
    ReadonlyArray<Builder2027Group>
  >
> = {
  sticky_scroll: [
    {
      title: "Copy",
      fields: [
        {
          control: "text",
          prop: "eyebrow",
          label: "Eyebrow",
          localizable: true,
        },
        {
          control: "text",
          prop: "headline",
          label: "Headline",
          placeholder: "How it works",
          localizable: true,
        },
      ],
    },
    {
      title: "The pinned picture",
      fields: [
        { control: "text", prop: "imageUrl", label: "Image address" },
        {
          control: "text",
          prop: "imageAlt",
          label: "Image description",
          placeholder: "Describe the picture for screen readers",
        },
        {
          control: "select",
          prop: "side",
          label: "Picture side",
          fallback: "media-left",
          options: [
            { value: "media-left", label: "Left" },
            { value: "media-right", label: "Right" },
          ],
        },
        {
          control: "select",
          prop: "variant",
          label: "Block style",
          fallback: "minimal",
          options: [
            { value: "minimal", label: "Plain" },
            { value: "bordered", label: "With a rule" },
          ],
        },
      ],
    },
  ],
  reveal: [
    {
      title: "Animation",
      fields: [
        {
          control: "select",
          prop: "effect",
          label: "Effect",
          fallback: "rise",
          options: [
            { value: "rise", label: "Rise" },
            { value: "fade", label: "Fade" },
            { value: "scale", label: "Scale up" },
            { value: "blur", label: "Sharpen" },
            { value: "mask-up", label: "Wipe up" },
            { value: "none", label: "None" },
          ],
        },
        {
          control: "select",
          prop: "direction",
          label: "Direction",
          fallback: "up",
          options: [
            { value: "up", label: "From below" },
            { value: "down", label: "From above" },
            { value: "left", label: "From the right" },
            { value: "right", label: "From the left" },
          ],
        },
        {
          control: "number",
          prop: "distance",
          label: "Travel (px)",
          min: 0,
          max: 400,
          fallback: 24,
        },
        {
          control: "number",
          prop: "durationMs",
          label: "Duration (ms)",
          min: 0,
          max: 4000,
          fallback: 600,
        },
        {
          control: "number",
          prop: "delayMs",
          label: "Delay (ms)",
          min: 0,
          max: 4000,
          fallback: 0,
        },
        {
          control: "number",
          prop: "staggerMs",
          label: "Gap between blocks (ms)",
          min: 0,
          max: 1000,
          fallback: 80,
        },
        {
          control: "toggle",
          prop: "once",
          label: "Only animate the first time",
          fallback: true,
        },
      ],
      note: "Blocks inside stay visible for anyone whose device or browser has animation turned off.",
    },
  ],
  stats: [
    {
      title: "Copy",
      fields: [
        {
          control: "text",
          prop: "eyebrow",
          label: "Eyebrow",
          localizable: true,
        },
        {
          control: "text",
          prop: "headline",
          label: "Headline",
          localizable: true,
        },
      ],
    },
    {
      title: "Layout",
      fields: [
        {
          control: "select",
          prop: "variant",
          label: "Layout",
          fallback: "row",
          options: [
            { value: "row", label: "One row" },
            { value: "grid", label: "Grid" },
            { value: "split", label: "Two columns" },
          ],
        },
        {
          control: "select",
          prop: "align",
          label: "Alignment",
          fallback: "center",
          options: [
            { value: "center", label: "Centered" },
            { value: "start", label: "Left" },
          ],
        },
        {
          control: "number",
          prop: "columns",
          label: "Columns",
          min: 1,
          max: 6,
          fallback: 3,
        },
        {
          control: "toggle",
          prop: "animate",
          label: "Count up when it scrolls into view",
          fallback: true,
        },
        {
          control: "number",
          prop: "durationMs",
          label: "Count-up length (ms)",
          min: 0,
          max: 6000,
          fallback: 1200,
        },
      ],
      note: "The finished number is what gets published, so search engines and visitors without animation always read the real figure.",
    },
  ],
  before_after: [
    {
      title: "Copy",
      fields: [
        {
          control: "text",
          prop: "eyebrow",
          label: "Eyebrow",
          localizable: true,
        },
        {
          control: "text",
          prop: "headline",
          label: "Headline",
          localizable: true,
        },
      ],
    },
    {
      title: "The two pictures",
      fields: [
        { control: "text", prop: "beforeUrl", label: "Before image address" },
        {
          control: "text",
          prop: "beforeAlt",
          label: "Before image description",
        },
        { control: "text", prop: "afterUrl", label: "After image address" },
        { control: "text", prop: "afterAlt", label: "After image description" },
        {
          control: "text",
          prop: "beforeLabel",
          label: "Before label",
          placeholder: "Before",
          localizable: true,
        },
        {
          control: "text",
          prop: "afterLabel",
          label: "After label",
          placeholder: "After",
          localizable: true,
        },
      ],
    },
    {
      title: "The slider",
      fields: [
        {
          control: "number",
          prop: "initialPosition",
          label: "Starting position (%)",
          min: 0,
          max: 100,
          fallback: 50,
        },
        {
          control: "select",
          prop: "orientation",
          label: "Direction",
          fallback: "horizontal",
          options: [
            { value: "horizontal", label: "Side to side" },
            { value: "vertical", label: "Top to bottom" },
          ],
        },
        {
          control: "select",
          prop: "ratio",
          label: "Shape",
          fallback: "16/9",
          options: [
            { value: "16/9", label: "Wide" },
            { value: "4/3", label: "Classic" },
            { value: "5/4", label: "Tall" },
            { value: "1/1", label: "Square" },
          ],
        },
        {
          control: "text",
          prop: "sliderLabel",
          label: "Slider description",
          placeholder: "Reveal slider",
          localizable: true,
        },
      ],
      note: "The slider is a real range control, so it works with a keyboard and is announced by screen readers.",
    },
  ]
};
