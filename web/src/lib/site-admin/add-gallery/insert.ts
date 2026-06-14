import {
  createBuilderNode,
  createButton,
  createHeading,
  createImage,
  createParagraph,
  makeId,
  randomUuid,
} from "@/lib/site-admin/builder-node/create";
import { cloneNodeWithFreshIds } from "@/lib/site-admin/builder-node/operations";
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";

import { buildAddGallerySectionTemplate } from "./section-templates";
import type { AddGalleryInsertMethod, AddGalleryItem, AddGalleryNativeVariant } from "./types";

const FORBIDDEN_INSERT_METHODS: ReadonlySet<AddGalleryInsertMethod> = new Set([
  "legacyCompositionSlot",
  "cmsPageSectionSlot",
]);

export class AddGalleryForbiddenInsertError extends Error {
  constructor(method: AddGalleryInsertMethod, itemId: string) {
    super(
      `[AddGallery] Forbidden insertion method "${method}" for item "${itemId}". ` +
        "Agency Add Gallery must insert into builderTree only.",
    );
    this.name = "AddGalleryForbiddenInsertError";
  }
}

/** Developer guard — fails loudly if a registry item targets legacy composition. */
export function assertAddGalleryBuilderTreeOnly(
  item: Pick<AddGalleryItem, "id" | "insertMethod">,
): void {
  if (!FORBIDDEN_INSERT_METHODS.has(item.insertMethod)) return;
  throw new AddGalleryForbiddenInsertError(item.insertMethod, item.id);
}

export function createNativeNodeForGalleryItem(item: AddGalleryItem): BuilderNode {
  assertAddGalleryBuilderTreeOnly(item);
  if (item.insertMethod !== "nativeNode" || !item.nativeKind) {
    throw new Error(`Item "${item.id}" is not a nativeNode insert.`);
  }
  const variant = item.nativeVariant ?? "default";
  return applyNativeVariant(createBuilderNode(item.nativeKind), variant);
}

/**
 * Build the editable freeform node for a `dbTemplate` gallery item.
 *
 * The published row's `builder_tree` is a freeform `BuilderNode[]`. Every node
 * id is RE-MINTED (`cloneNodeWithFreshIds`) so the inserted subtree never
 * collides with the source row or any other inserted copy — each landed node
 * keeps a brand-new `data-builder-node-id` and is immediately editable.
 *
 * Shape:
 *   - single root  → that root, re-minted, is inserted directly.
 *   - 0 or 2+ roots → wrapped in ONE re-minted freeform `container` (stack) so
 *     a whole page template lands as one editable container subtree (never a
 *     locked page).
 *
 * The result is a pure freeform `BuilderNode` — it carries NO `section_embed`
 * locking, NO composition slot. It routes through `insertBuilderComponent`
 * exactly like a `sectionTemplate`, so the editor's own insert path validates
 * + selects it.
 */
export function createDbTemplateNodeForGalleryItem(
  item: AddGalleryItem,
): BuilderNode {
  assertAddGalleryBuilderTreeOnly(item);
  if (item.insertMethod !== "dbTemplate") {
    throw new Error(`Item "${item.id}" is not a dbTemplate insert.`);
  }
  const tree = item.dbTemplateTree;
  if (!tree || tree.length === 0) {
    // An empty published tree still yields an editable (empty) container so the
    // insert never throws — the operator can build inside it.
    return {
      id: makeId("container"),
      kind: "container",
      props: {
        layout: "stack",
        gap: "m",
        align: "stretch",
        layerLabel: item.label,
      },
      children: [],
    } as BuilderNode;
  }

  if (tree.length === 1) {
    return cloneNodeWithFreshIds(tree[0]!);
  }

  // Multiple roots → wrap in one freeform container, then re-mint the whole
  // wrapped subtree (the wrapper gets a fresh id too).
  const wrapper: BuilderNode = {
    id: makeId("container"),
    kind: "container",
    props: {
      layout: "stack",
      gap: "m",
      align: "stretch",
      layerLabel: item.label,
    },
    children: tree.map((node) => node),
  } as BuilderNode;
  return cloneNodeWithFreshIds(wrapper);
}

function applyNativeVariant(
  node: BuilderNode,
  variant: AddGalleryNativeVariant,
): BuilderNode {
  switch (variant) {
    case "title":
      if (node.kind === "heading") {
        return {
          ...node,
          props: { ...node.props, text: "Title", level: 1 },
        };
      }
      break;
    case "subtitle":
      if (node.kind === "heading") {
        return {
          ...node,
          props: { ...node.props, text: "Subtitle", level: 2 },
        };
      }
      break;
    case "intro":
      if (node.kind === "paragraph") {
        return {
          ...node,
          props: {
            ...node.props,
            text: "Introduce the page or section in one or two sentences.",
          },
        };
      }
      break;
    case "caption":
      if (node.kind === "paragraph") {
        return {
          ...node,
          props: {
            ...node.props,
            text: "Caption text",
            style: { size: "sm", tone: "muted" },
          },
        };
      }
      break;
    case "text-link":
      if (node.kind === "button") {
        return {
          ...node,
          props: { ...node.props, label: "Learn more", tone: "secondary" },
        };
      }
      break;
    case "icon-button":
      if (node.kind === "button") {
        return {
          ...node,
          props: { ...node.props, label: "♥ Save" },
        };
      }
      break;
    case "stack":
      if (node.kind === "container") {
        return {
          ...node,
          props: { ...node.props, layout: "stack" },
          children: [],
        };
      }
      break;
    case "row":
      if (node.kind === "container") {
        return {
          ...node,
          props: { ...node.props, layout: "row" },
          children: [],
        };
      }
      break;
    case "card-group":
      if (node.kind === "container") {
        return {
          ...node,
          props: { ...node.props, layout: "row", gap: "m" },
          children: [
            { id: makeId("card"), kind: "card", props: {}, children: [] },
            { id: makeId("card"), kind: "card", props: {}, children: [] },
          ],
        };
      }
      break;
    case "cover-image":
      if (node.kind === "image") {
        return {
          ...node,
          props: {
            ...node.props,
            style: { aspectRatio: "21:9", objectFit: "cover" },
          },
        };
      }
      break;
    case "logo":
      if (node.kind === "image") {
        return {
          ...node,
          props: {
            ...node.props,
            alt: "Logo",
            style: { maxWidth: "narrow" },
          },
        };
      }
      break;
    case "badge":
      if (node.kind === "icon") {
        return {
          ...node,
          props: {
            ...node.props,
            icon: "sparkle",
            label: "New",
            size: "sm",
          },
        };
      }
      break;
    case "quote":
      if (node.kind === "paragraph") {
        return {
          ...node,
          props: {
            ...node.props,
            text: "“Replace with a client or editorial pull quote.”",
            style: { tone: "muted", size: "lg" },
          },
        };
      }
      break;
    case "grid":
      if (node.kind === "container") {
        return {
          ...node,
          props: {
            ...node.props,
            layout: "grid",
            columns: 3,
            gap: "m",
          },
          children: [],
        };
      }
      break;
    case "download-link":
      if (node.kind === "button") {
        return {
          ...node,
          props: {
            ...node.props,
            label: "Download",
            href: "/files/brochure.pdf",
            tone: "secondary",
          },
        };
      }
      break;
    case "image-card":
      if (node.kind === "card") {
        return {
          ...node,
          props: { ...node.props, variant: "elevated" },
          children: [
            createImage(0),
            createHeading("Card title", 3),
            createParagraph("Supporting copy for this card."),
          ],
        };
      }
      break;
    case "icon-card":
      if (node.kind === "card") {
        return {
          ...node,
          children: [
            createBuilderNode("icon"),
            createHeading("Feature title", 3),
            createParagraph("Short feature description."),
          ],
        };
      }
      break;
    case "profile-card":
      if (node.kind === "card") {
        return {
          ...node,
          children: [
            createImage(1),
            createHeading("Talent name", 3),
            createParagraph("Role or specialty"),
          ],
        };
      }
      break;
    case "service-card":
      if (node.kind === "card") {
        return {
          ...node,
          children: [
            createHeading("Service name", 3),
            createParagraph("What this service includes."),
          ],
        };
      }
      break;
    case "testimonial-card":
      if (node.kind === "card") {
        return {
          ...node,
          children: [
            createParagraph("“A short client quote goes here.”"),
            createParagraph("Client name, Company"),
          ],
        };
      }
      break;
    case "cta-card":
      if (node.kind === "card") {
        return {
          ...node,
          children: [
            createHeading("Ready to start?", 3),
            createButton("Get in touch", "/contact"),
          ],
        };
      }
      break;
    case "breadcrumb":
      if (node.kind === "nav") {
        return {
          ...node,
          props: {
            ...node.props,
            ariaLabel: "Breadcrumb",
            links: [
              { id: randomUuid(), label: "Home", href: "/" },
              { id: randomUuid(), label: "Directory", href: "/directory" },
            ],
          },
        };
      }
      break;
    case "youtube":
      if (node.kind === "embed") {
        return {
          ...node,
          props: {
            ...node.props,
            provider: "youtube",
            title: "YouTube video",
          },
        };
      }
      break;
    default:
      break;
  }
  return node;
}

export type AddGalleryInsertAction =
  | { type: "nativeNode"; node: BuilderNode }
  | { type: "sectionTemplate"; node: BuilderNode }
  | { type: "dbTemplate"; node: BuilderNode }
  | { type: "sectionEmbed"; sectionTypeKey: string }
  | { type: "connectedNode"; sectionTypeKey: string }
  | { type: "noop" };

export function resolveAddGalleryInsertAction(
  item: AddGalleryItem,
): AddGalleryInsertAction {
  assertAddGalleryBuilderTreeOnly(item);

  if (item.insertMethod === "disabledComingSoon") {
    return { type: "noop" };
  }

  switch (item.insertMethod) {
    case "nativeNode":
      return { type: "nativeNode", node: createNativeNodeForGalleryItem(item) };
    case "sectionTemplate": {
      const templateId = item.sectionTemplateId;
      if (!templateId) {
        throw new Error(`sectionTemplate item "${item.id}" is missing sectionTemplateId.`);
      }
      const node = buildAddGallerySectionTemplate(templateId);
      if (!node) {
        throw new Error(`Unknown section template "${templateId}".`);
      }
      return { type: "sectionTemplate", node };
    }
    case "dbTemplate":
      return { type: "dbTemplate", node: createDbTemplateNodeForGalleryItem(item) };
    case "sectionEmbed":
    case "connectedNode": {
      const key = item.sectionEmbedKey;
      if (!key) {
        throw new Error(`Embed item "${item.id}" is missing sectionEmbedKey.`);
      }
      return item.insertMethod === "connectedNode"
        ? { type: "connectedNode", sectionTypeKey: key }
        : { type: "sectionEmbed", sectionTypeKey: key };
    }
    default:
      throw new AddGalleryForbiddenInsertError(item.insertMethod, item.id);
  }
}

export function galleryItemSupportsDrag(item: AddGalleryItem): boolean {
  return (
    item.dragSupported &&
    item.availability === "available" &&
    item.insertMethod !== "disabledComingSoon"
  );
}
