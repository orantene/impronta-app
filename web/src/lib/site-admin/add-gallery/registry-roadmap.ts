import type { AddGalleryItem } from "./types";
import { roadmap } from "./registry-helpers";

/** Roadmap items — hidden unless the panel expands “More coming soon”. */
export const ADD_GALLERY_ROADMAP_ITEMS: ReadonlyArray<AddGalleryItem> = [
  roadmap({
    id: "el-list",
    label: "List",
    description: "Bulleted or numbered list.",
    category: "text",
    icon: "list",
    tab: "blocks",
  }),
  roadmap({
    id: "el-whatsapp",
    label: "WhatsApp Button",
    description: "Opens a WhatsApp chat.",
    category: "buttons",
    icon: "whatsapp",
    tab: "blocks",
  }),
  roadmap({
    id: "sec-hero-video",
    label: "Hero Video",
    description: "Hero with background or inline video.",
    category: "hero",
    icon: "hero-video",
    tab: "designs",
    previewType: "image-card",
  }),
  roadmap({
    id: "conn-talent-card",
    label: "Talent Card",
    description: "Single bound talent profile card.",
    category: "talent",
    icon: "talent-card",
    tab: "data",
    itemKind: "connected",
    connectedSource: "Talent Collection",
  }),
  roadmap({
    id: "conn-dynamic-text",
    label: "Dynamic Text",
    description: "Text bound to any data source.",
    category: "dynamic",
    icon: "dynamic-text",
    tab: "data",
    itemKind: "connected",
    connectedSource: "Any Source",
  }),
  roadmap({
    id: "conn-repeater",
    label: "Repeater",
    description: "Repeat items from a collection.",
    category: "dynamic",
    icon: "repeater",
    tab: "data",
    itemKind: "connected",
    connectedSource: "Any Source",
  }),
];
