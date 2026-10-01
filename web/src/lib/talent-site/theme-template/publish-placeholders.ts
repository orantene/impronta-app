/**
 * S7 stand-ins for pieces parallel slices own. Every export here is replaced
 * at integration by a re-export of the real module; keep the signatures.
 *
 *   S2 -> theme-releases/origin.ts: freezeDesignKeys / ensureDesignKeys / designKeyIssues
 *   S3 -> theme-template/drafts.server.ts: loadThemeDraft
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import type { DesignPayload } from "../theme-catalog/types";
import { kidsOf, propsOf } from "../theme-releases/origin";
import type { ThemeDraft, ThemeDraftResult } from "./types";

// PLACEHOLDER: replaced at integration (S2 origin.ts ensureDesignKeys)
export function ensureDesignKeys(tree: ReadonlyArray<BuilderNode>): BuilderNode[] {
  return [...tree];
}

// PLACEHOLDER: replaced at integration (S2 origin.ts freezeDesignKeys)
export function freezeDesignKeys(tree: ReadonlyArray<BuilderNode>): BuilderNode[] {
  return [...tree];
}

// PLACEHOLDER: replaced at integration (S2 origin.ts designKeyIssues)
/** Two siblings with the same explicit slotKey would get order-dependent keys. */
export function designKeyIssues(payload: DesignPayload): string[] {
  const issues: string[] = [];
  const walk = (nodes: ReadonlyArray<BuilderNode>, where: string) => {
    const seen = new Set<string>();
    for (const n of nodes) {
      const k = propsOf(n).slotKey;
      if (typeof k === "string" && k) {
        if (seen.has(k)) issues.push(`${where}: design key "${k}" is used twice.`);
        seen.add(k);
      }
      walk(kidsOf(n), `${where}/${typeof k === "string" && k ? k : n.kind}`);
    }
  };
  walk(payload.shellTree, "shell");
  walk(payload.homeTree, "home");
  return issues;
}

// PLACEHOLDER: replaced at integration (S3 drafts.server.ts loadThemeDraft)
export async function loadThemeDraft(admin: SupabaseClient, design: string): Promise<ThemeDraftResult<ThemeDraft>> {
  const { data, error } = await admin
    .from("talent_theme_drafts")
    .select("id, design, base_version, payload, preview, rev, status, published_version, release_id, updated_at")
    .eq("design", design)
    .eq("status", "open")
    .maybeSingle();
  if (error) return { ok: false, code: "error", error: error.message };
  if (!data) return { ok: false, code: "not_found", error: "No open draft for this design." };
  const r = data as Record<string, unknown>;
  return {
    ok: true,
    value: {
      id: r.id as string,
      design: r.design as string,
      baseVersion: r.base_version as number,
      payload: r.payload as DesignPayload,
      preview: (r.preview as ThemeDraft["preview"]) ?? {},
      rev: r.rev as number,
      status: r.status as ThemeDraft["status"],
      publishedVersion: (r.published_version as number | null) ?? null,
      releaseId: (r.release_id as string | null) ?? null,
      updatedAt: r.updated_at as string,
    },
  };
}
