/**
 * Playground shared leaves — pure helpers, the status-tone map, and the row
 * drawer state types, split out of `catalog-playground.tsx` so both the view
 * and the extracted `playground-draft-row.tsx` import them WITHOUT a cycle
 * (and to keep catalog-playground.tsx under the 800-line `max-lines` cap).
 */
import type {
  BuilderTemplateKind,
  BuilderTemplateStatus,
  BuilderTemplateTarget,
} from "@/lib/site-admin/builder-core/templates/registry-rows";
import type { BuilderLabTarget } from "./builder-lab-stage";
import { LAB as T } from "./ui";

/** True for the platform-scoped shell (header/footer) template kinds — they
 *  apply to a tenant's site_shell rather than living in the page gallery, so the
 *  UI flags them distinctly. */
export function isShellKind(kind: BuilderTemplateKind): boolean {
  return kind === "shell_header" || kind === "shell_footer";
}

/** builder_templates target_context → the editor's launch target. */
export function targetToLabTarget(t: BuilderTemplateTarget): BuilderLabTarget {
  return t === "talent" || t === "workspace" ? t : "both";
}

export const STATUS_TONE: Record<BuilderTemplateStatus, { bg: string; fg: string }> = {
  draft: { bg: "rgba(255,255,255,0.07)", fg: T.inkMuted },
  in_review: { bg: "rgba(155,168,183,0.16)", fg: "#9BA8B7" },
  published: { bg: "rgba(93,211,160,0.16)", fg: T.accent },
  archived: { bg: "rgba(255,255,255,0.05)", fg: T.inkDim },
};

/** Inline result of a promote attempt — surfaced under the row, never a
 *  toast-and-vanish (admin-edit-UX bar). */
export type PromoteState =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "error"; reasons: string[] }
  | { kind: "done"; version: number };

/** Which sub-panel (if any) is expanded in the Playground row drawer. */
export type DrawerTab = "rollout" | "revisions" | null;

/** Inline async state for rollout save / revision actions inside the drawer. */
export type DrawerActionState =
  | { kind: "idle" }
  | { kind: "running"; label: string }
  | { kind: "error"; msg: string }
  | { kind: "done"; msg: string };
