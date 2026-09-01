/**
 * builder-2027-fields.ts — the Content-tab field schema for the twelve native
 * BUILDER 2027 · P2A kinds.
 *
 * WHY A SCHEMA RATHER THAN TWELVE HAND-WRITTEN PANELS
 * ───────────────────────────────────────────────────
 * Twelve bespoke panels is ~2,000 lines of near-identical JSX in a file that is
 * already 5,000 lines, and — the part that actually matters — none of it is
 * testable without a DOM. A panel can only be proved by clicking it.
 *
 * Splitting the DESCRIPTION of the controls (this file: pure data, no React, no
 * imports beyond the node types) from the RENDERING of them
 * (`builder-2027-node-content.tsx`) makes the half that can silently go wrong
 * unit-testable: that every kind has an inspector at all, that every control
 * writes a prop the registry schema will actually accept, and that no control
 * writes a prop that does not exist. Those are the three ways an inspector ships
 * dead, and all three are now assertions rather than hopes.
 *
 * The renderer is a single ~150-line component instead of twelve, so a fix to
 * the locked-prop handling or the localizable-text plumbing lands once.
 *
 * WHY IT LIVES IN `lib`, NOT NEXT TO THE INSPECTOR IT DRIVES: this is pure data
 * with no React import, and the tests that prove each control writes a prop the
 * publish schema accepts live in `lib/site-admin/builder-node`. A test there
 * importing from `components/edit-chrome` is a layering inversion the repo
 * guards against (`lib-edit-chrome-cycle-guard`), and rightly so. The dependency
 * runs the correct way round from here: the inspector component in edit-chrome
 * imports this schema, never the reverse.
 */
import type { BuilderNodeKind } from "./types";
import { BUILDER_2027_ANCHOR_GROUPS } from "./builder-2027-anchor-fields";

/** One authoring control. `prop` is the top-level props key it writes. */
export type Builder2027Field =
  | {
      control: "text";
      prop: string;
      label: string;
      placeholder?: string;
      /** Render as a textarea and, for a localizable prop, a multi-line editor. */
      multiline?: boolean;
      /** Wire the per-locale overlay editor for this prop. */
      localizable?: boolean;
    }
  | {
      control: "select";
      prop: string;
      label: string;
      options: ReadonlyArray<{ value: string; label: string }>;
      /** The value used when the prop is unset. */
      fallback: string;
    }
  | {
      control: "toggle";
      prop: string;
      label: string;
      /** The effective value when the prop is unset. */
      fallback: boolean;
    }
  | {
      control: "number";
      prop: string;
      label: string;
      min: number;
      max: number;
      fallback: number;
    };

export interface Builder2027Group {
  title: string;
  fields: ReadonlyArray<Builder2027Field>;
  /** Plain-language note shown under the group. */
  note?: string;
}

/**
 * The kinds this inspector owns. Everything else falls through to the existing
 * per-kind branches in `builder-node-content.tsx`.
 */
export const BUILDER_2027_INSPECTOR_KINDS = [
  "marquee",
  "directory",
  "featured_talent",
  "location_map",
  "header_search",
  "header_account",
  "header_inquiry",
  "header_language",
  "sticky_scroll",
  "reveal",
  "stats",
  "before_after",
] as const satisfies ReadonlyArray<BuilderNodeKind>;

export type Builder2027InspectorKind =
  (typeof BUILDER_2027_INSPECTOR_KINDS)[number];

export function isBuilder2027InspectorKind(
  kind: BuilderNodeKind,
): kind is Builder2027InspectorKind {
  return (BUILDER_2027_INSPECTOR_KINDS as ReadonlyArray<BuilderNodeKind>).includes(
    kind,
  );
}

const HEADER_WIDGET_SHARED: ReadonlyArray<Builder2027Field> = [
  {
    control: "text",
    prop: "label",
    label: "Label",
    placeholder: "Search…",
    localizable: true,
  },
  {
    control: "toggle",
    prop: "showLabel",
    label: "Show the label as text",
    fallback: false,
  },
  {
    control: "text",
    prop: "href",
    label: "Link",
    placeholder: "Leave empty to use the default",
  },
];

export const BUILDER_2027_INSPECTOR_GROUPS: Readonly<
  Record<Builder2027InspectorKind, ReadonlyArray<Builder2027Group>>
> = {
  marquee: [
    {
      title: "Motion",
      fields: [
        {
          control: "select",
          prop: "variant",
          label: "Style",
          fallback: "text",
          options: [
            { value: "text", label: "Plain text" },
            { value: "tags", label: "Tags" },
          ],
        },
        {
          control: "select",
          prop: "speed",
          label: "Speed",
          fallback: "medium",
          options: [
            { value: "slow", label: "Slow" },
            { value: "medium", label: "Medium" },
            { value: "fast", label: "Fast" },
          ],
        },
        {
          control: "select",
          prop: "direction",
          label: "Direction",
          fallback: "left",
          options: [
            { value: "left", label: "Right to left" },
            { value: "right", label: "Left to right" },
          ],
        },
        {
          control: "select",
          prop: "separator",
          label: "Separator",
          fallback: "dot",
          options: [
            { value: "dot", label: "Dot" },
            { value: "slash", label: "Slash" },
            { value: "diamond", label: "Diamond" },
            { value: "none", label: "None" },
          ],
        },
        {
          control: "toggle",
          prop: "pauseOnHover",
          label: "Pause when the pointer is over it",
          fallback: true,
        },
      ],
      note: "The strip stops moving for visitors who have asked for reduced motion.",
    },
  ],
  directory: [
    {
      title: "Copy",
      fields: [
        {
          control: "text",
          prop: "eyebrow",
          label: "Eyebrow",
          placeholder: "e.g. The roster",
          localizable: true,
        },
        {
          control: "text",
          prop: "headline",
          label: "Headline",
          placeholder: "The roster",
          localizable: true,
        },
        {
          control: "text",
          prop: "copy",
          label: "Intro",
          multiline: true,
          localizable: true,
        },
        {
          control: "toggle",
          prop: "showHeading",
          label: "Show the heading",
          fallback: true,
        },
        {
          control: "select",
          prop: "headerAlign",
          label: "Heading alignment",
          fallback: "center",
          options: [
            { value: "center", label: "Centered" },
            { value: "left", label: "Left" },
            { value: "split", label: "Split" },
          ],
        },
      ],
    },
    {
      title: "Who appears",
      fields: [
        {
          control: "select",
          prop: "scope",
          label: "Source",
          fallback: "all",
          options: [
            { value: "all", label: "Everyone on the roster" },
            { value: "by_talent_type", label: "By talent type" },
            { value: "by_tag", label: "By tag" },
            { value: "manual", label: "A list I pick" },
          ],
        },
        {
          control: "select",
          prop: "defaultSort",
          label: "Order",
          fallback: "recommended",
          options: [
            { value: "recommended", label: "Recommended" },
            { value: "newest", label: "Newest first" },
            { value: "az", label: "A to Z" },
            { value: "availability", label: "Available first" },
            { value: "curated", label: "The order I set" },
          ],
        },
        {
          control: "toggle",
          prop: "requirePhoto",
          label: "Only show talent with a photo",
          fallback: false,
        },
        {
          control: "toggle",
          prop: "excludeUnavailable",
          label: "Hide unavailable talent",
          fallback: false,
        },
      ],
      note: "This block only ever shows your own roster. It cannot reach another workspace.",
    },
    {
      title: "Layout",
      fields: [
        {
          control: "number",
          prop: "columnsDesktop",
          label: "Columns on desktop",
          min: 1,
          max: 6,
          fallback: 4,
        },
        {
          control: "number",
          prop: "columnsTablet",
          label: "Columns on tablet",
          min: 1,
          max: 4,
          fallback: 3,
        },
        {
          control: "number",
          prop: "columnsMobile",
          label: "Columns on mobile",
          min: 1,
          max: 2,
          fallback: 1,
        },
        {
          control: "number",
          prop: "pageSize",
          label: "People per page",
          min: 6,
          max: 60,
          fallback: 24,
        },
        {
          control: "select",
          prop: "containerWidth",
          label: "Width",
          fallback: "boxed",
          options: [
            { value: "boxed", label: "Boxed" },
            { value: "full", label: "Full width" },
          ],
        },
        {
          control: "select",
          prop: "density",
          label: "Density",
          fallback: "comfortable",
          options: [
            { value: "comfortable", label: "Comfortable" },
            { value: "compact", label: "Compact" },
          ],
        },
      ],
    },
    {
      title: "Controls",
      fields: [
        {
          control: "toggle",
          prop: "filterSearchBox",
          label: "Show the search box",
          fallback: true,
        },
        {
          control: "text",
          prop: "filterPlaceholder",
          label: "Search box wording",
          placeholder: "Search by role, location or fit",
          localizable: true,
        },
        {
          control: "text",
          prop: "filterSubmitLabel",
          label: "Search button",
          placeholder: "Search…",
          localizable: true,
        },
        {
          control: "select",
          prop: "topBarMode",
          label: "Category chips",
          fallback: "talent_type",
          options: [
            { value: "talent_type", label: "By talent type" },
            { value: "field", label: "By field" },
            { value: "none", label: "Hidden" },
          ],
        },
        {
          control: "toggle",
          prop: "showResultCount",
          label: "Show the result count",
          fallback: true,
        },
        {
          control: "toggle",
          prop: "sortControlShow",
          label: "Show the sort control",
          fallback: true,
        },
      ],
    },
    {
      title: "When nobody matches",
      fields: [
        {
          control: "text",
          prop: "emptyStateTitle",
          label: "Title",
          placeholder: "No matches yet",
          localizable: true,
        },
        {
          control: "text",
          prop: "emptyStateText",
          label: "Message",
          multiline: true,
          localizable: true,
        },
        {
          control: "text",
          prop: "emptyStateCtaLabel",
          label: "Button",
          localizable: true,
        },
        { control: "text", prop: "emptyStateCtaHref", label: "Button link" },
      ],
    },
  ],
  featured_talent: [
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
          placeholder: "Featured talent",
          localizable: true,
        },
        {
          control: "text",
          prop: "copy",
          label: "Intro",
          multiline: true,
          localizable: true,
        },
        {
          control: "select",
          prop: "headerAlign",
          label: "Heading alignment",
          fallback: "center",
          options: [
            { value: "center", label: "Centered" },
            { value: "left", label: "Left" },
            { value: "split", label: "Split" },
          ],
        },
      ],
    },
    {
      title: "Who appears",
      fields: [
        {
          control: "select",
          prop: "sourceMode",
          label: "Source",
          fallback: "auto_featured_flag",
          options: [
            { value: "auto_featured_flag", label: "Talent I marked featured" },
            { value: "manual_pick", label: "A list I pick" },
            { value: "auto_by_service", label: "By service" },
            { value: "auto_by_destination", label: "By destination" },
            { value: "auto_recent", label: "Recently added" },
          ],
        },
        {
          control: "number",
          prop: "limit",
          label: "How many cards",
          min: 1,
          max: 15,
          fallback: 6,
        },
        {
          control: "number",
          prop: "columnsDesktop",
          label: "Columns on desktop",
          min: 2,
          max: 4,
          fallback: 3,
        },
        {
          control: "select",
          prop: "variant",
          label: "Layout",
          fallback: "grid",
          options: [
            { value: "grid", label: "Grid" },
            { value: "carousel", label: "Swipeable row" },
          ],
        },
      ],
    },
    {
      title: "Footer link",
      fields: [
        {
          control: "text",
          prop: "footerCtaLabel",
          label: "Button",
          placeholder: "See the whole roster",
          localizable: true,
        },
        { control: "text", prop: "footerCtaHref", label: "Button link" },
        {
          control: "text",
          prop: "emptyStateText",
          label: "When nobody is featured",
          multiline: true,
          localizable: true,
        },
      ],
    },
  ],
  location_map: [
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
          placeholder: "Where we work",
          localizable: true,
        },
        {
          control: "text",
          prop: "subheadline",
          label: "Intro",
          multiline: true,
          localizable: true,
        },
      ],
    },
    {
      title: "The map",
      fields: [
        {
          control: "toggle",
          prop: "showMap",
          label: "Show the map",
          fallback: true,
        },
        {
          control: "select",
          prop: "mapStyle",
          label: "Map style",
          fallback: "editorial",
          options: [
            { value: "editorial", label: "Drawn pins (no third party)" },
            { value: "embed", label: "Embedded map" },
          ],
        },
        {
          control: "text",
          prop: "mapEmbedUrl",
          label: "Embed address",
          placeholder: "https://www.google.com/maps/embed?...",
        },
        {
          control: "select",
          prop: "ratio",
          label: "Shape",
          fallback: "16/9",
          options: [
            { value: "16/9", label: "Wide" },
            { value: "4/3", label: "Classic" },
            { value: "1/1", label: "Square" },
            { value: "21/9", label: "Panorama" },
          ],
        },
      ],
      note: "Embedded maps only accept Google Maps or OpenStreetMap addresses.",
    },
    {
      title: "The panel over the map",
      fields: [
        {
          control: "text",
          prop: "overlayTitle",
          label: "Title",
          localizable: true,
        },
        {
          control: "text",
          prop: "overlayBody",
          label: "Body",
          multiline: true,
          localizable: true,
        },
        {
          control: "text",
          prop: "overlayAddress",
          label: "Address",
          multiline: true,
          localizable: true,
        },
        {
          control: "text",
          prop: "overlayHours",
          label: "Hours",
          localizable: true,
        },
        {
          control: "select",
          prop: "overlaySide",
          label: "Position",
          fallback: "card-left",
          options: [
            { value: "card-left", label: "Left" },
            { value: "card-right", label: "Right" },
            { value: "card-bottom", label: "Bottom" },
          ],
        },
      ],
    },
    {
      title: "The cities",
      fields: [
        {
          control: "select",
          prop: "source",
          label: "Source",
          fallback: "manual",
          options: [
            { value: "roster_cities", label: "Where my roster lives" },
            { value: "manual", label: "Cities I list" },
          ],
        },
        {
          control: "number",
          prop: "maxItems",
          label: "How many cities",
          min: 1,
          max: 24,
          fallback: 8,
        },
        {
          control: "toggle",
          prop: "showCount",
          label: "Show how many people are in each city",
          fallback: true,
        },
        {
          control: "select",
          prop: "layout",
          label: "City list layout",
          fallback: "grid",
          options: [
            { value: "grid", label: "Grid" },
            { value: "list", label: "List" },
            { value: "compact", label: "Compact" },
          ],
        },
        {
          control: "text",
          prop: "emptyStateText",
          label: "When there are no cities",
          multiline: true,
          localizable: true,
        },
      ],
    },
  ],
  header_search: [
    {
      title: "Search control",
      fields: [
        ...HEADER_WIDGET_SHARED,
        {
          control: "toggle",
          prop: "inlineField",
          label: "Show a search field instead of an icon",
          fallback: false,
        },
        {
          control: "text",
          prop: "placeholder",
          label: "Field wording",
          placeholder: "Search talent",
          localizable: true,
        },
      ],
      note: "Leave the link empty and it goes to your directory.",
    },
  ],
  header_account: [
    {
      title: "Account control",
      fields: [
        ...HEADER_WIDGET_SHARED,
        {
          control: "text",
          prop: "signedOutLabel",
          label: "Wording when signed out",
          placeholder: "Sign in",
          localizable: true,
        },
        {
          control: "text",
          prop: "signedInLabel",
          label: "Wording when signed in",
          placeholder: "Account",
          localizable: true,
        },
      ],
      note: "On the live site this becomes the full account menu. On this canvas it shows the link a signed-out visitor sees.",
    },
  ],
  header_inquiry: [
    {
      title: "Inquiry control",
      fields: [
        ...HEADER_WIDGET_SHARED,
        {
          control: "toggle",
          prop: "showCount",
          label: "Show how many items are saved",
          fallback: true,
        },
      ],
      note: "On the live site this opens the inquiry drawer. On this canvas it shows the link.",
    },
  ],
  header_language: [
    {
      title: "Language switcher",
      fields: [
        ...HEADER_WIDGET_SHARED,
        {
          control: "select",
          prop: "display",
          label: "Show",
          fallback: "code",
          options: [
            { value: "code", label: "Short codes (EN, ES)" },
            { value: "name", label: "Full names (English, Espanol)" },
          ],
        },
        { control: "text", prop: "separator", label: "Divider", placeholder: "/" },
      ],
      note: "On a site with one language this control hides itself rather than showing a switch that does nothing.",
    },
  ],
  // The four anchor primitives' groups live in a sibling file for the
  // 800-line cap; they are ordinary entries in this same record.
  ...BUILDER_2027_ANCHOR_GROUPS,

};

/** Every prop any control for `kind` writes. Used by the coverage tests. */
export function builder2027InspectorProps(
  kind: Builder2027InspectorKind,
): string[] {
  return BUILDER_2027_INSPECTOR_GROUPS[kind].flatMap((group) =>
    group.fields.map((field) => field.prop),
  );
}
