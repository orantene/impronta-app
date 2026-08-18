/**
 * Builder block presets — localStorage seam (Builder 2026).
 *
 * Self-contained persistence helpers peeled out of edit-context.tsx (MAINT-1).
 * A "block preset" used to be a localStorage list. Save pattern now writes
 * a living component (`cms_builder_components`) via saveBuilderComponent.
 * These helpers remain for any leftover readers; edit-context no longer
 * reads or writes `impronta.builderBlockPresets.v1`.
 */

import {
  BUILDER_NODE_REGISTRY,
  type BuilderNode,
} from "@/lib/site-admin/builder-node";
import { validateStoredBuilderNodeClipboard } from "./builder-node-clipboard-storage";

export const BUILDER_BLOCK_PRESETS_STORAGE_KEY = "impronta.builderBlockPresets.v1";
export const BUILDER_BLOCK_PRESET_LIMIT = 24;

export interface BuilderBlockPreset {
  id: string;
  name: string;
  node: Exclude<BuilderNode, { kind: "section" }>;
  createdAt: string;
}

function builderNodePresetLabel(kind: BuilderNode["kind"]): string {
  return BUILDER_NODE_REGISTRY[kind]?.label ?? kind;
}

export function readStoredBuilderBlockPresets(): BuilderBlockPreset[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(BUILDER_BLOCK_PRESETS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const presets: BuilderBlockPreset[] = [];
    for (const item of parsed) {
      if (typeof item !== "object" || item == null) continue;
      const rawPreset = item as {
        id?: unknown;
        name?: unknown;
        node?: unknown;
        createdAt?: unknown;
      };
      if (
        typeof rawPreset.id !== "string" ||
        typeof rawPreset.name !== "string" ||
        typeof rawPreset.createdAt !== "string"
      ) {
        continue;
      }
      const node = validateStoredBuilderNodeClipboard(rawPreset.node);
      if (!node || node.kind === "section") continue;
      presets.push({
        id: rawPreset.id,
        name:
          rawPreset.name.trim() || `${builderNodePresetLabel(node.kind)} pattern`,
        node,
        createdAt: rawPreset.createdAt,
      });
      if (presets.length >= BUILDER_BLOCK_PRESET_LIMIT) break;
    }
    return presets;
  } catch {
    return [];
  }
}

export function writeStoredBuilderBlockPresets(
  presets: ReadonlyArray<BuilderBlockPreset>,
) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      BUILDER_BLOCK_PRESETS_STORAGE_KEY,
      JSON.stringify(presets.slice(0, BUILDER_BLOCK_PRESET_LIMIT)),
    );
  } catch {
    // Local preset persistence is a convenience layer; editing continues
    // even when browser storage is unavailable.
  }
}
