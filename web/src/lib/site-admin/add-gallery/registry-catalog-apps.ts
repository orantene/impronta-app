import { el } from "./registry-helpers";
import { APP_REGISTRY, appSearchTerms } from "./apps-registry";
import type { AddGalleryItem } from "./types";

/**
 * Apps tab items, derived from `APP_REGISTRY`. Each app inserts one native
 * builder node, so insert, drag-and-drop, undo and the layer tree behave like
 * any other block. No `connectedSource`: these are self-contained tools.
 */
export const ADD_GALLERY_APP_ITEMS: ReadonlyArray<AddGalleryItem> = APP_REGISTRY.map((app) =>
  el({
    id: app.id,
    label: app.label,
    description: app.description,
    category: "apps",
    icon: app.icon,
    tab: "apps",
    insertMethod: "nativeNode",
    nativeKind: app.nativeKind,
    sourceType: "native-freeform",
    appThumbnail: app.thumbnail,
    searchTerms: appSearchTerms(app),
  }),
);
