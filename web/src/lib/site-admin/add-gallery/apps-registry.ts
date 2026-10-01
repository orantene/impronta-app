/**
 * Apps registry — the ONE list of interactive mini-tools the talent builder's
 * "Apps" gallery tab offers. Adding an app is one entry here (plus the builder
 * node kind it inserts, wired at the usual four layers); the gallery items, the
 * card thumbnail lookup and the surface gating all derive from this list.
 *
 * Surface gating is not done here: the tab is offered only on surfaces whose
 * `galleryPolicy.allowedTabs` lists "apps" (talent page, theme template), so
 * the agency Studio gallery never sees any entry.
 */
import type { BuilderNodeKind } from "@/lib/site-admin/builder-node/types";

export interface AppRegistryEntry {
  /** Gallery item id (stable, prefixed `app-`). */
  id: string;
  /** The builder node kind inserted on click / drop. */
  nativeKind: BuilderNodeKind;
  /** English source strings; Spanish lives in the editor ES catalog. */
  label: string;
  description: string;
  /** Gallery icon key. */
  icon: string;
  /** Key resolved by the card's thumbnail component. */
  thumbnail: string;
  searchTerms: ReadonlyArray<string>;
}

export const APP_REGISTRY: ReadonlyArray<AppRegistryEntry> = [
  {
    id: "app-nail-designer",
    nativeKind: "app_nail_designer",
    label: "Nail Designer",
    description:
      "Visitors design a manicure nail by nail and send it with their booking request. Drop it in and it works, nothing to set up.",
    icon: "interactive",
    thumbnail: "nail-designer",
    searchTerms: ["nails", "manicure", "polish", "design", "app", "uñas", "manicura", "esmalte"],
  },
];
