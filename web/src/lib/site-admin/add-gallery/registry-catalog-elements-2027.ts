/**
 * registry-catalog-elements-2027.ts — Add Gallery cards for the BUILDER 2027
 * P2A native element kinds.
 *
 * Two families:
 *   - the four NATIVE header widgets, which sit beside the older
 *     `section_embed` cards for the same four frozen curated sections. Both
 *     ship together (exactly as WS7 shipped `conn-hero-search-native` beside
 *     the curated hero) so existing shells keep working, new ones get the
 *     native kind, and the bridge can be deleted later without a migration;
 *   - the four ANCHOR primitives, which are ordinary authoring elements (no
 *     data source, no shell context) and so belong in the generic library
 *     rather than behind the Connected tab.
 *
 * Split out of `registry-catalog-elements.ts` for the 800-line file cap; it is
 * spread back into `ADD_GALLERY_ELEMENT_ITEMS` there, so nothing downstream
 * needs to know this file exists.
 */
import type { AddGalleryItem } from "./types";
import { el } from "./registry-helpers";

export const ADD_GALLERY_BUILDER_2027_ITEMS: ReadonlyArray<AddGalleryItem> = [

  // ── BUILDER 2027 · P2A — NATIVE header widgets ──────────────────────────
  // The four cards above insert a `section_embed` bridge into the FROZEN
  // curated header sections. These four insert the NATIVE BuilderNode kind
  // instead: a real node in the tree, selectable, inspectable, styleable, and
  // renderable by the shared renderer. Both sets ship side by side exactly as
  // WS7 shipped `conn-hero-search-native` beside the curated hero, so existing
  // shells keep working while new ones get the native kind — and the bridge can
  // be deleted later without a migration.
  el({
    id: "el-header-search-native",
    label: "Header Search",
    description:
      "The header's search control: an icon linking to your directory, or an inline search field.",
    category: "header-widgets",
    icon: "search",
    insertMethod: "nativeNode",
    nativeKind: "header_search",
    searchTerms: [
      "header_search",
      "search",
      "directory",
      "header widget",
      "find talent",
      "native",
    ],
  }),
  el({
    id: "el-header-account-native",
    label: "Header Account",
    description:
      "The header's account control. Signed-out visitors see a sign-in link; signed-in visitors get their account menu.",
    category: "header-widgets",
    icon: "account",
    insertMethod: "nativeNode",
    nativeKind: "header_account",
    searchTerms: [
      "header_account",
      "account",
      "login",
      "sign in",
      "profile",
      "header widget",
      "native",
    ],
  }),
  el({
    id: "el-header-inquiry-native",
    label: "Header Inquiry",
    description:
      "The header's inquiry control, with a live count of what a visitor has saved.",
    category: "header-widgets",
    icon: "inquiry",
    insertMethod: "nativeNode",
    nativeKind: "header_inquiry",
    searchTerms: [
      "header_inquiry",
      "inquiry",
      "cart",
      "shortlist",
      "header widget",
      "native",
    ],
  }),
  el({
    id: "el-header-language-native",
    label: "Header Language",
    description:
      "The header's language switcher. It hides itself on a single-language site rather than showing a dead toggle.",
    category: "header-widgets",
    icon: "globe",
    insertMethod: "nativeNode",
    nativeKind: "header_language",
    searchTerms: [
      "header_language",
      "language",
      "locale",
      "translate",
      "spanish",
      "english",
      "en es",
      "header widget",
      "native",
    ],
  }),

  // ── BUILDER 2027 · P2A — anchor-design primitives ───────────────────────
  // Ordinary authoring elements: no data source, no shell context, so they
  // belong in the generic element library rather than behind the Connected tab.
  el({
    id: "el-marquee",
    label: "Marquee",
    description:
      "A continuously scrolling strip of text or tags. Used for press lines, partner names and value statements.",
    category: "interactive",
    icon: "text-link",
    insertMethod: "nativeNode",
    nativeKind: "marquee",
    searchTerms: [
      "marquee",
      "ticker",
      "scrolling",
      "strip",
      "press",
      "partners",
      "loop",
      "kinetic",
    ],
  }),
  el({
    id: "el-sticky-scroll",
    label: "Sticky Scroll",
    description:
      "A picture that stays pinned while the copy blocks beside it scroll past.",
    category: "layout",
    icon: "columns",
    insertMethod: "nativeNode",
    nativeKind: "sticky_scroll",
    searchTerms: [
      "sticky",
      "scroll",
      "pinned",
      "steps",
      "how it works",
      "process",
    ],
  }),
  el({
    id: "el-reveal",
    label: "Reveal",
    description:
      "Wrap any blocks so they animate into view as the visitor scrolls. Content stays visible if animation is off.",
    category: "utility",
    icon: "container",
    insertMethod: "nativeNode",
    nativeKind: "reveal",
    searchTerms: [
      "reveal",
      "animate",
      "scroll",
      "fade",
      "rise",
      "entrance",
      "motion",
      "wrapper",
    ],
  }),
  el({
    id: "el-stats",
    label: "Stats",
    description:
      "Oversized numbers with labels, counting up as they scroll into view.",
    category: "interactive",
    icon: "grid",
    insertMethod: "nativeNode",
    nativeKind: "stats",
    searchTerms: [
      "stats",
      "numbers",
      "counter",
      "metrics",
      "figures",
      "credibility",
      "count up",
    ],
  }),
  el({
    id: "el-before-after",
    label: "Before and After",
    description:
      "Two images with a slider between them, so a visitor can drag to compare.",
    category: "media",
    icon: "image-grid",
    insertMethod: "nativeNode",
    nativeKind: "before_after",
    searchTerms: [
      "before",
      "after",
      "slider",
      "compare",
      "drag",
      "transformation",
    ],
  })
];
