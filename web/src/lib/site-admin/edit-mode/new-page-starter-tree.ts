import { makeId } from "@/lib/site-admin/builder-node/create";
import {
  buildLegacySectionBuilderTree,
  type LegacySnapshotSlot,
} from "@/lib/site-admin/builder-node/snapshot-slot-bridge";
import type { BuilderNodeTree } from "@/lib/site-admin/builder-node/types";

export const NEW_PAGE_STARTER_SLOT_KEY = "body";
export const NEW_PAGE_STARTER_SECTION_NAME = "Page content";
export const NEW_PAGE_STARTER_SHELL_MAX_WIDTH_PX = 1120;

/** Centered content shell styles — desktop base + tablet/mobile overrides. */
export function newPageStarterShellStyle() {
  return {
    width: "100%",
    maxWidthFree: `${NEW_PAGE_STARTER_SHELL_MAX_WIDTH_PX}px`,
    marginLeftFree: "auto",
    marginRightFree: "auto",
    marginTopFree: "24px",
    marginBottomFree: "24px",
    paddingTop: "48px",
    paddingBottom: "48px",
    paddingLeft: "40px",
    paddingRight: "40px",
    gap: "24px",
    responsive: {
      tablet: {
        marginTopFree: "20px",
        marginBottomFree: "20px",
        paddingTop: "40px",
        paddingBottom: "40px",
        paddingLeft: "28px",
        paddingRight: "28px",
      },
      mobile: {
        marginTopFree: "16px",
        marginBottomFree: "16px",
        paddingTop: "32px",
        paddingBottom: "32px",
        paddingLeft: "16px",
        paddingRight: "16px",
      },
    },
  } as const;
}

export function buildNewPageStarterBuilderTree(sectionId: string): BuilderNodeTree {
  const slot: LegacySnapshotSlot = {
    slotKey: NEW_PAGE_STARTER_SLOT_KEY,
    sortOrder: 0,
    sectionId,
    sectionTypeKey: "blank_section",
    name: NEW_PAGE_STARTER_SECTION_NAME,
    props: {},
  };
  const [sectionNode] = buildLegacySectionBuilderTree([slot]);
  if (!sectionNode || sectionNode.kind !== "section") {
    return [];
  }

  return [
    {
      ...sectionNode,
      children: [
        {
          id: makeId("container"),
          kind: "container",
          props: {
            layout: "stack",
            align: "stretch",
            style: newPageStarterShellStyle(),
          },
          children: [],
        },
      ],
    },
  ];
}
