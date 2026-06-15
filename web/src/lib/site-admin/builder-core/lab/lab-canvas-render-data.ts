"use server";

/**
 * Builder Lab — rebuild the in-editor canvas render data against a chosen
 * preview subject (a real talent / workspace) + the LIVE tree being edited.
 *
 * This is what lets the operator switch the preview subject FROM INSIDE the
 * editor and watch connected nodes re-hydrate to the new subject's data without
 * remounting (the design tree survives — `InEditorCanvasRegion` consumes the
 * returned data as a reactive prop). super_admin-only: the Lab is the platform
 * authoring surface and this is its auth boundary (mirrors preview-subject-search).
 */

import { getCachedActorSession } from "@/lib/server/request-cache";
import { isPlatformAdmin } from "@/lib/access/platform-role";
import {
  buildInEditorCanvasRenderData,
  type InEditorCanvasRenderData,
} from "@/lib/site-admin/builder-core/in-editor-canvas-render-data";
import type { BuilderNodeTree } from "@/lib/site-admin/builder-node/types";

export type LabPreviewSubjectInput = {
  kind: "talent" | "workspace";
  id: string;
} | null;

export type BuildLabCanvasRenderDataResult =
  | { ok: true; data: InEditorCanvasRenderData }
  | { ok: false; error: string };

async function requireSuperAdmin(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const session = await getCachedActorSession();
  if (!session.user) return { ok: false, error: "Not signed in." };
  if (!isPlatformAdmin(session.profile)) {
    return { ok: false, error: "Super admin access required." };
  }
  return { ok: true };
}

export async function buildLabCanvasRenderData(input: {
  tenantId: string;
  tree: BuilderNodeTree;
  previewSubject: LabPreviewSubjectInput;
  locale?: string;
}): Promise<BuildLabCanvasRenderDataResult> {
  const gate = await requireSuperAdmin();
  if (!gate.ok) return gate;
  try {
    const data = await buildInEditorCanvasRenderData({
      tree: input.tree,
      tenantId: input.tenantId,
      locale: input.locale ?? "en",
      previewSubject: input.previewSubject ?? null,
    });
    return { ok: true, data };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to load preview data.",
    };
  }
}
