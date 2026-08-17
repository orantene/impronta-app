/**
 * registry-catalog-backgrounds.ts — the "Backgrounds" story in the Add gallery.
 *
 * WHY A CATEGORY AND NOT A TAB. `AddGalleryTab` is a closed union wired into
 * `CODE_TAB_DEFS`, four hardcoded tab literals in `add-gallery-panel.tsx` /
 * `add-gallery-cards.tsx`, the per-surface `allowedTabs` in
 * `builder-core/config.ts`, the hand-pinned `PARITY_SURFACES` descriptors, and
 * half a dozen governance tests. A new tab would be a large blast radius for
 * what is, in the operator's head, one more shelf on an existing rail. These
 * ship as a CATEGORY on the existing `layout` tab, which is the tab that
 * already holds Container / Section / Grid / Stack / Row — the blocks these
 * cards are pre-dressed versions of.
 *
 * WHY EVERY CARD CARRIES A `nativeVariant`. `resolveKindGovernance`
 * (`kind-governance.ts`) picks the CANONICAL card for a node kind, preferring a
 * card with no variant. `el-container` is that card today. A new no-variant
 * container card here would silently steal canonical status and re-point every
 * Builder Studio prop lock. Each card below names a variant, so it cannot.
 *
 * Each card drops a real, immediately-visible block: a container that is
 * already tall, already centred, already carrying a scrim. An author who drops
 * "Video Background" and sees an empty 24px strip has learned nothing; one who
 * sees a full-bleed dark band with a caption telling them to pick a clip has.
 */
import { el } from "./registry-helpers";
import type { AddGalleryItem } from "./types";

/**
 * Shared shape for every background card: tall enough to read as a band, and
 * centred so whatever the author drops inside lands where they expect.
 *
 * Height is `minHeight` rather than `height` so the block still grows with its
 * content — a background band that CLIPS the paragraph someone just added is
 * the classic version of this feature that gets reverted.
 */
const BACKDROP_STYLE = {
  minHeight: "420px",
  paddingTop: "64px",
  paddingBottom: "64px",
  paddingLeft: "24px",
  paddingRight: "24px",
  justifyContent: "center",
  alignItems: "center",
  maxWidthFree: "100%",
} as const;

export const ADD_GALLERY_BACKGROUND_ITEMS: ReadonlyArray<AddGalleryItem> = [
  el({
    id: "el-bg-video",
    label: "Video Background",
    description: "Full-bleed band with a looping video behind your content.",
    infoTooltip:
      "Drops a tall container ready for a background clip. Open Content and pick a video from your library. It plays muted and looped, and visitors who prefer reduced motion see the poster image instead.",
    tab: "layout",
    category: "backgrounds",
    icon: "video",
    previewType: "image-card",
    previewImageUrl: "/builder-previews/bg-video.svg",
    insertMethod: "nativeNode",
    nativeKind: "container",
    nativeVariant: "bg-video",
    searchTerms: ["background", "video", "loop", "hero", "cinematic", "reel"],
  }),
  el({
    id: "el-bg-youtube",
    label: "YouTube Background",
    description: "Full-bleed band with a YouTube video playing behind content.",
    infoTooltip:
      "Paste any YouTube link in the Content tab. It embeds through youtube-nocookie, plays muted and looped with no controls or branding, and falls back to the video thumbnail under reduced motion.",
    tab: "layout",
    category: "backgrounds",
    icon: "youtube",
    previewType: "image-card",
    previewImageUrl: "/builder-previews/bg-youtube.svg",
    insertMethod: "nativeNode",
    nativeKind: "container",
    nativeVariant: "bg-youtube",
    searchTerms: ["background", "youtube", "video", "embed", "loop"],
  }),
  el({
    id: "el-bg-image",
    label: "Image Background",
    description: "Full-bleed band with a photo behind your content.",
    infoTooltip:
      "A tall container with a cover-cropped photo and a dark scrim so headings stay readable. Swap the image in the Style tab under Background.",
    tab: "layout",
    category: "backgrounds",
    icon: "cover",
    previewType: "image-card",
    previewImageUrl: "/builder-previews/bg-image.svg",
    insertMethod: "nativeNode",
    nativeKind: "container",
    nativeVariant: "bg-image",
    searchTerms: ["background", "image", "photo", "cover", "hero", "banner"],
  }),
  el({
    id: "el-bg-gradient",
    label: "Gradient Background",
    description: "Full-bleed band with a soft brand-coloured gradient.",
    infoTooltip:
      "A tall container carrying a two-stop gradient built from your theme's primary colour, so it restyles itself when the theme changes. Edit the stops in the Style tab.",
    tab: "layout",
    category: "backgrounds",
    icon: "layout",
    previewType: "image-card",
    previewImageUrl: "/builder-previews/bg-gradient.svg",
    insertMethod: "nativeNode",
    nativeKind: "container",
    nativeVariant: "bg-gradient",
    searchTerms: ["background", "gradient", "colour", "color", "mesh", "band"],
  }),
];

/**
 * Style payloads for the four variants, applied by `applyNativeVariant`.
 * Exported so the variant switch reads as data rather than four inlined blobs.
 *
 * The image + gradient values are deliberately THEME-TOKEN based with literal
 * fallbacks (the same rule `shell-variant-seeds.test.ts` enforces on shell
 * trees): a card that hardcodes a colour looks wrong on every tenant but the
 * one it was designed against.
 */
export const BACKGROUND_VARIANT_STYLES = {
  "bg-video": BACKDROP_STYLE,
  "bg-youtube": BACKDROP_STYLE,
  "bg-image": {
    ...BACKDROP_STYLE,
    backgroundImage:
      "linear-gradient(rgba(0,0,0,0.45), rgba(0,0,0,0.45)), url('/talent-templates/demo/impronta-2026/lifestyle-1.jpg')",
    backgroundSize: "cover",
    backgroundPosition: "center",
  },
  "bg-gradient": {
    ...BACKDROP_STYLE,
    backgroundImage:
      "linear-gradient(135deg, var(--token-color-primary, #4c1d95) 0%, var(--token-color-surface-raised, #f6f1e8) 100%)",
  },
} as const;

/** Default background-media value stamped onto the two motion cards. */
export const BACKGROUND_VARIANT_MEDIA = {
  "bg-video": { source: "upload" as const, src: "", overlay: 40 },
  "bg-youtube": { source: "youtube" as const, src: "", overlay: 40 },
};

/**
 * Page Structure layer names. Without these the four cards all land as
 * "Container" and an author with three backdrops on a page cannot tell them
 * apart in the navigator.
 */
export const BACKGROUND_VARIANT_LAYER_LABEL = {
  "bg-video": "Video Background",
  "bg-youtube": "YouTube Background",
  "bg-image": "Image Background",
  "bg-gradient": "Gradient Background",
} as const;
