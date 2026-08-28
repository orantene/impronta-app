/**
 * StylePanel — style-domain enum option arrays (W4-F1 domain split).
 *
 * Extracted verbatim from style-panel.tsx: every `Segmented` picker in the
 * Style inspector reads its choices from one of these `SegmentedOption`
 * arrays. Grouping them here (typography, spacing, layout, effects, …) keeps
 * the 9.8k-line panel focused on composition, not on option tables. Pure data
 * — no component scope, no side effects — so the move is byte-for-byte
 * behavior-preserving; the panel imports these names unchanged.
 */

import type { SegmentedOption } from "../../kit/segmented";

export const ALIGN_OPTIONS: ReadonlyArray<SegmentedOption<string>> = [
  { value: "", label: "Default" },
  { value: "left", label: "Left" },
  { value: "center", label: "Center" },
  { value: "right", label: "Right" },
];

export const SIZE_OPTIONS: ReadonlyArray<SegmentedOption<string>> = [
  { value: "", label: "Default" },
  { value: "sm", label: "S" },
  { value: "md", label: "M" },
  { value: "lg", label: "L" },
  { value: "xl", label: "XL" },
  // STYLE-2 — display tier: storefront-grade headline scale above XL (clamp 3.5–6rem).
  { value: "display", label: "Display" },
];

/*
 * The text-size tiers used to live here as a label-only option list. They now
 * render from `field-kit/preset-values.ts` (`TEXT_SIZE_PRESETS`), which derives
 * the same ids from the renderer's own `TEXT_SIZE_CLAMP` AND carries the px
 * range each tier resolves to. A second table with the ids but none of the
 * numbers could only drift, so it is gone rather than kept as a fallback.
 */

export const TONE_OPTIONS: ReadonlyArray<SegmentedOption<string>> = [
  { value: "", label: "Default" },
  { value: "muted", label: "Muted" },
  { value: "strong", label: "Strong" },
];

export const BUILDER_NODE_TONE_OPTIONS: ReadonlyArray<SegmentedOption<string>> = [
  { value: "", label: "Default" },
  { value: "muted", label: "Muted" },
  { value: "strong", label: "Strong" },
];

export const BUILDER_NODE_WIDTH_OPTIONS: ReadonlyArray<SegmentedOption<string>> = [
  { value: "", label: "Auto" },
  { value: "narrow", label: "Narrow" },
  { value: "reading", label: "Read" },
  { value: "wide", label: "Wide" },
  { value: "full", label: "Full" },
];

export const BUILDER_NODE_SPACING_OPTIONS: ReadonlyArray<SegmentedOption<string>> = [
  { value: "", label: "Default" },
  { value: "none", label: "0" },
  { value: "s", label: "S" },
  { value: "m", label: "M" },
  { value: "l", label: "L" },
];

export const BUILDER_NODE_BACKGROUND_OPTIONS: ReadonlyArray<SegmentedOption<string>> = [
  { value: "", label: "Default" },
  { value: "none", label: "None" },
  { value: "surface", label: "Surface" },
  { value: "contrast", label: "Dark" },
];

export const BUILDER_NODE_RADIUS_OPTIONS: ReadonlyArray<SegmentedOption<string>> = [
  { value: "", label: "Default" },
  { value: "none", label: "Sharp" },
  { value: "sm", label: "S" },
  { value: "md", label: "M" },
  { value: "lg", label: "L" },
  { value: "pill", label: "Pill" },
];

export const BUILDER_NODE_FIT_OPTIONS: ReadonlyArray<SegmentedOption<string>> = [
  { value: "", label: "Default" },
  { value: "cover", label: "Cover" },
  { value: "contain", label: "Contain" },
];

export const BUILDER_NODE_RATIO_OPTIONS: ReadonlyArray<SegmentedOption<string>> = [
  { value: "", label: "Auto" },
  { value: "1:1", label: "1:1" },
  { value: "4:3", label: "4:3" },
  { value: "3:4", label: "3:4" },
  { value: "16:9", label: "16:9" },
  { value: "21:9", label: "21:9" },
];

export const BUILDER_BUTTON_TONE_OPTIONS: ReadonlyArray<SegmentedOption<string>> = [
  { value: "", label: "Default" },
  { value: "primary", label: "Primary" },
  { value: "secondary", label: "Secondary" },
];

// The full CSS weight ladder. 100–300 and 800–900 became loadable when the
// font pipeline went usage-aware (fonts-catalog.ts) — an explicit weight here
// is collected per family and requested from Google (or matched against an
// uploaded face), so every step actually renders instead of faux-bolding.
export const BUILDER_NODE_FONT_WEIGHT_OPTIONS: ReadonlyArray<SegmentedOption<string>> = [
  { value: "", label: "Auto" },
  { value: "100", label: "100" },
  { value: "200", label: "200" },
  { value: "300", label: "300" },
  { value: "400", label: "400" },
  { value: "500", label: "500" },
  { value: "600", label: "600" },
  { value: "700", label: "700" },
  { value: "800", label: "800" },
  { value: "900", label: "900" },
];

export const BUILDER_NODE_TEXT_TRANSFORM_OPTIONS: ReadonlyArray<SegmentedOption<string>> = [
  { value: "", label: "Default" },
  { value: "none", label: "None" },
  { value: "uppercase", label: "AA" },
  { value: "lowercase", label: "aa" },
  { value: "capitalize", label: "Aa" },
];

export const BUILDER_NODE_FONT_STYLE_OPTIONS: ReadonlyArray<SegmentedOption<string>> = [
  { value: "", label: "Default" },
  { value: "normal", label: "Normal" },
  { value: "italic", label: "Italic" },
];

export const BUILDER_NODE_TEXT_DECORATION_OPTIONS: ReadonlyArray<SegmentedOption<string>> = [
  { value: "", label: "Default" },
  { value: "none", label: "None" },
  { value: "underline", label: "Under" },
  { value: "line-through", label: "Strike" },
];

export const BUILDER_NODE_TEXT_WRAP_OPTIONS: ReadonlyArray<SegmentedOption<string>> = [
  { value: "", label: "Default" },
  { value: "balance", label: "Balance" },
  { value: "pretty", label: "Pretty" },
  { value: "nowrap", label: "No wrap" },
];

export const BUILDER_NODE_WHITE_SPACE_OPTIONS: ReadonlyArray<SegmentedOption<string>> = [
  { value: "", label: "Default" },
  { value: "normal", label: "Normal" },
  { value: "nowrap", label: "No wrap" },
  { value: "pre-wrap", label: "Pre-wrap" },
];

export const BUILDER_NODE_POSITION_OPTIONS: ReadonlyArray<SegmentedOption<string>> = [
  { value: "", label: "Default" },
  { value: "relative", label: "Relative" },
  { value: "absolute", label: "Absolute" },
  { value: "sticky", label: "Sticky" },
];

// Wave 6B (#23) — sticky-pin self-anchor: which edge the node pins to as the
// page scrolls. "" clears the convenience back to a plain (un-pinned) sticky.
export const BUILDER_NODE_STICKY_ANCHOR_OPTIONS: ReadonlyArray<SegmentedOption<string>> = [
  { value: "", label: "None" },
  { value: "top", label: "Pin top" },
  { value: "bottom", label: "Pin bottom" },
];

export const BUILDER_NODE_OVERFLOW_OPTIONS: ReadonlyArray<SegmentedOption<string>> = [
  { value: "", label: "Default" },
  { value: "visible", label: "Visible" },
  { value: "hidden", label: "Hidden" },
  { value: "auto", label: "Auto" },
  { value: "scroll", label: "Scroll" },
];

export const BUILDER_NODE_ALIGN_SELF_OPTIONS: ReadonlyArray<SegmentedOption<string>> = [
  { value: "", label: "Auto" },
  { value: "start", label: "Start" },
  { value: "center", label: "Center" },
  { value: "end", label: "End" },
  { value: "stretch", label: "Stretch" },
];

// Container layout (children) — how a flex/grid node distributes its OWN children
// on the main axis (justify), cross axis (align), and whether rows wrap.
export const BUILDER_NODE_JUSTIFY_CONTENT_OPTIONS: ReadonlyArray<SegmentedOption<string>> = [
  { value: "", label: "Default" },
  { value: "flex-start", label: "Start" },
  { value: "center", label: "Center" },
  { value: "flex-end", label: "End" },
  { value: "space-between", label: "Between" },
  { value: "space-around", label: "Around" },
  { value: "space-evenly", label: "Evenly" },
];

export const BUILDER_NODE_ALIGN_ITEMS_OPTIONS: ReadonlyArray<SegmentedOption<string>> = [
  { value: "", label: "Default" },
  { value: "flex-start", label: "Start" },
  { value: "center", label: "Center" },
  { value: "flex-end", label: "End" },
  { value: "stretch", label: "Stretch" },
  { value: "baseline", label: "Baseline" },
];

export const BUILDER_NODE_FLEX_WRAP_OPTIONS: ReadonlyArray<SegmentedOption<string>> = [
  { value: "", label: "Default" },
  { value: "nowrap", label: "No wrap" },
  { value: "wrap", label: "Wrap" },
  { value: "wrap-reverse", label: "Reverse" },
];

export const BUILDER_NODE_GRID_AUTO_FLOW_OPTIONS: ReadonlyArray<SegmentedOption<string>> = [
  { value: "", label: "Default" },
  { value: "row", label: "Row" },
  { value: "column", label: "Column" },
  { value: "row dense", label: "Row dense" },
  { value: "column dense", label: "Col dense" },
];

export const BUILDER_NODE_CURSOR_OPTIONS: ReadonlyArray<SegmentedOption<string>> = [
  { value: "", label: "Default" },
  { value: "pointer", label: "Pointer" },
  { value: "grab", label: "Grab" },
  { value: "move", label: "Move" },
  { value: "zoom-in", label: "Zoom" },
  { value: "not-allowed", label: "Blocked" },
  { value: "text", label: "Text" },
  { value: "none", label: "Hide" },
];

export const BUILDER_NODE_USER_SELECT_OPTIONS: ReadonlyArray<SegmentedOption<string>> = [
  { value: "", label: "Default" },
  { value: "auto", label: "Auto" },
  { value: "text", label: "Text" },
  { value: "all", label: "All" },
  { value: "none", label: "None" },
];

export const BUILDER_NODE_POINTER_EVENTS_OPTIONS: ReadonlyArray<SegmentedOption<string>> = [
  { value: "", label: "Default" },
  { value: "auto", label: "Auto" },
  { value: "none", label: "Pass-through" },
];

export const BUILDER_NODE_SCROLL_SNAP_ALIGN_OPTIONS: ReadonlyArray<SegmentedOption<string>> = [
  { value: "", label: "Default" },
  { value: "start", label: "Start" },
  { value: "center", label: "Center" },
  { value: "end", label: "End" },
  { value: "none", label: "None" },
];

export const BUILDER_NODE_ANIMATION_PRESET_OPTIONS: ReadonlyArray<SegmentedOption<string>> = [
  { value: "", label: "None" },
  { value: "fade-in", label: "Fade" },
  { value: "rise", label: "Rise" },
  { value: "fall", label: "Fall" },
  { value: "zoom-in", label: "Zoom" },
  { value: "slide-left", label: "Slide ←" },
  { value: "slide-right", label: "Slide →" },
  { value: "blur-in", label: "Blur" },
  { value: "flip-in", label: "Flip" },
  { value: "bounce-in", label: "Bounce" },
];

export const BUILDER_NODE_ANIMATION_TRIGGER_OPTIONS: ReadonlyArray<SegmentedOption<string>> = [
  { value: "", label: "On load" },
  { value: "scroll", label: "On scroll" },
];

export const BUILDER_NODE_ANIMATION_EASING_OPTIONS: ReadonlyArray<SegmentedOption<string>> = [
  { value: "", label: "Ease" },
  { value: "linear", label: "Linear" },
  { value: "ease-in", label: "In" },
  { value: "ease-out", label: "Out" },
  { value: "ease-in-out", label: "In-out" },
  { value: "back", label: "Back" },
  { value: "smooth", label: "Smooth" },
];

// Wave 6B (#27) — scroll parallax intensity. "" / "none" = off.
export const BUILDER_NODE_PARALLAX_OPTIONS: ReadonlyArray<SegmentedOption<string>> = [
  { value: "", label: "Off" },
  { value: "subtle", label: "Subtle" },
  { value: "medium", label: "Medium" },
  { value: "strong", label: "Strong" },
];

// Reveal-on-view (2026-06-04) — IntersectionObserver-driven entry trajectory.
// "" = off. Direction variants travel `revealDistance`; fade/zoom don't.
export const BUILDER_NODE_REVEAL_OPTIONS: ReadonlyArray<SegmentedOption<string>> = [
  { value: "", label: "Off" },
  { value: "fade", label: "Fade" },
  { value: "fade-up", label: "Up" },
  { value: "fade-down", label: "Down" },
  { value: "fade-left", label: "Left" },
  { value: "fade-right", label: "Right" },
  { value: "zoom", label: "Zoom" },
];

export const BUILDER_NODE_BORDER_STYLE_OPTIONS: ReadonlyArray<SegmentedOption<string>> = [
  { value: "", label: "None" },
  { value: "solid", label: "Solid" },
  { value: "dashed", label: "Dash" },
  { value: "dotted", label: "Dot" },
];

export const BUILDER_NODE_VISIBILITY_OPTIONS: ReadonlyArray<SegmentedOption<string>> = [
  { value: "", label: "Shown" },
  { value: "hidden", label: "Hidden" },
];

export const BUILDER_NODE_SHADOW_OPTIONS: ReadonlyArray<SegmentedOption<string>> = [
  { value: "", label: "None" },
  { value: "0 1px 2px rgba(18,18,18,0.06), 0 1px 3px rgba(18,18,18,0.10)", label: "S" },
  { value: "0 4px 8px rgba(18,18,18,0.06), 0 6px 16px rgba(18,18,18,0.12)", label: "M" },
  { value: "0 12px 24px rgba(18,18,18,0.10), 0 20px 48px rgba(18,18,18,0.16)", label: "L" },
];

export const BUILDER_NODE_BG_REPEAT_OPTIONS: ReadonlyArray<SegmentedOption<string>> = [
  { value: "no-repeat", label: "None" },
  { value: "repeat", label: "Tile" },
  { value: "repeat-x", label: "X" },
  { value: "repeat-y", label: "Y" },
];

export const BUILDER_NODE_BLEND_OPTIONS: ReadonlyArray<SegmentedOption<string>> = [
  { value: "", label: "Normal" },
  { value: "multiply", label: "Multiply" },
  { value: "screen", label: "Screen" },
  { value: "overlay", label: "Overlay" },
  { value: "darken", label: "Darken" },
  { value: "lighten", label: "Lighten" },
];

export const BUILDER_NODE_BG_CLIP_OPTIONS: ReadonlyArray<SegmentedOption<string>> = [
  { value: "", label: "Off" },
  { value: "text", label: "Through text" },
];
