import { recordTemplateUsage } from "@/lib/site-admin/builder-core/templates/template-usage-actions";

import { evaluateDirectoryAddCapForTenant, resolveAddGalleryInsertAction } from "./insert";
import { getAddGalleryItemById } from "./registry";
import type { AddGalleryItem } from "./types";

/** D7 — the source builder_templates.id for a template-backed insert (else null). */
function sourceTemplateIdForItem(item: AddGalleryItem): string | null {
  if (item.insertMethod === "dbTemplate") return item.dbTemplateId ?? null;
  if (item.insertMethod === "sectionTemplate") return item.sectionTemplateId ?? null;
  return null;
}

/** Optional context for the D7 usage tally (tenant / surface / page). */
export interface AddGalleryInsertContext {
  tenantId?: string | null;
  surface?: string | null;
  pageRef?: string | null;
}

export interface AddGalleryInsertDeps {
  insertBuilderNode: (
    parentId: string | null,
    kind: import("@/lib/site-admin/builder-node/types").BuilderNode["kind"],
    index?: number,
  ) => Promise<{ ok: boolean; error?: string; nodeId?: string }>;
  insertBuilderSectionEmbed: (
    parentId: string | null,
    sectionTypeKey: string,
    index?: number,
  ) => Promise<{ ok: boolean; error?: string; nodeId?: string }>;
  insertBuilderComponent: (
    parentId: string | null,
    subtreeJson: string,
    index?: number,
  ) => Promise<{ ok: boolean; error?: string; nodeId?: string }>;
}

export async function performAddGalleryInsert(
  item: AddGalleryItem,
  target: { parentId: string | null; index?: number },
  deps: AddGalleryInsertDeps,
  context: AddGalleryInsertContext = {},
): Promise<{ ok: boolean; error?: string; nodeId?: string }> {
  // Directory plan-gating cap — enforced at the add path, before the insert
  // executes, so a tenant cannot place more directory section instances than its
  // plan allows. No-op (no DB touched) for every non-directory item; fail-open
  // on any auth/scope/query error (see evaluateDirectoryAddCapForTenant).
  const directoryCap = await evaluateDirectoryAddCapForTenant(item);
  if (!directoryCap.ok) {
    return { ok: false, error: directoryCap.error };
  }

  const action = resolveAddGalleryInsertAction(item);
  const { parentId, index } = target;

  switch (action.type) {
    case "noop":
      return { ok: false, error: "This item is not available yet." };
    case "nativeNode":
    case "sectionTemplate":
    case "dbTemplate": {
      const result = await deps.insertBuilderComponent(
        parentId,
        JSON.stringify(action.node),
        index,
      );
      // D7 — on a successful template-backed insert, append a usage-tally row.
      // Best-effort / fire-and-forget: the record action never throws, so a
      // lost tally row can't fail the insert the user just performed.
      if (result.ok) {
        const templateId = sourceTemplateIdForItem(item);
        if (templateId) {
          void recordTemplateUsage({
            templateId,
            tenantId: context.tenantId ?? null,
            surface: context.surface ?? null,
            pageRef: context.pageRef ?? null,
          });
        }
      }
      return result;
    }
    case "sectionEmbed":
    case "connectedNode":
      return deps.insertBuilderSectionEmbed(
        parentId,
        action.sectionTypeKey,
        index,
      );
    default:
      return { ok: false, error: "Unsupported insert action." };
  }
}

export async function performAddGalleryInsertById(
  itemId: string,
  target: { parentId: string | null; index?: number },
  deps: AddGalleryInsertDeps,
  context: AddGalleryInsertContext = {},
): Promise<{ ok: boolean; error?: string; nodeId?: string }> {
  const item = getAddGalleryItemById(itemId);
  if (!item) {
    return { ok: false, error: "Gallery item not found." };
  }
  return performAddGalleryInsert(item, target, deps, context);
}
