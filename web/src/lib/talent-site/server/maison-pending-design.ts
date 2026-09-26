/**
 * Live-site pending_design (A4 / W67–W70, W73–W74).
 * Never-published Undo remains `MaisonPendingUndo` (source "apply") in
 * maison-design-snapshot.ts. Live changes write ONLY this shape until Publish.
 */
import type { MaisonPaletteKey } from "@/lib/talent-site/theme-catalog/maison/seed";
import type { MaisonPreviewContentMode } from "@/lib/talent-site/theme-catalog/maison/preview-hydration";
import type { MaisonCustomPaletteStored } from "@/lib/talent-site/theme-catalog/maison/maison-custom-palette";
import type { MaisonDraftSnapshot } from "./maison-design-snapshot";

export type MaisonLivePendingSource =
  | "live_change"
  | "colors_only"
  | "restore"
  | "reset_colors"
  | "reapply_layout";

export type MaisonLiveProposed = {
  designSlug: string;
  lookSlug: string | null;
  paletteKey: MaisonPaletteKey | null;
  contentMode: MaisonPreviewContentMode;
  demoSlug: string;
  customPalette?: MaisonCustomPaletteStored | null;
  menuStyle?: string | null;
  /** Full draft trees when restoring a published revision (W70). */
  draftSnapshot?: MaisonDraftSnapshot | null;
};

export type MaisonLiveBaseline = {
  theme_look_slug: string | null;
  custom_palette: unknown;
  design_tokens_draft: unknown;
  menu_style: string | null;
  theme_design_slug: string | null;
};

export type MaisonLivePending = {
  kind: "live_pending";
  source: MaisonLivePendingSource;
  created_at: string;
  proposed: MaisonLiveProposed;
  liveBaseline: MaisonLiveBaseline;
  /** Draft before restore/reset/reapply — Undo / Discard can put it back (W70/W73). */
  undoDraft?: MaisonDraftSnapshot | null;
};

export function isMaisonLivePending(raw: unknown): raw is MaisonLivePending {
  if (!raw || typeof raw !== "object") return false;
  const o = raw as Record<string, unknown>;
  if (o.kind !== "live_pending") return false;
  if (typeof o.source !== "string" || typeof o.created_at !== "string") return false;
  if (!o.proposed || typeof o.proposed !== "object") return false;
  if (!o.liveBaseline || typeof o.liveBaseline !== "object") return false;
  return true;
}

/** True when pending has unpublished design changes (W73 — Discard only then). */
export function hasMaisonLivePending(raw: unknown): boolean {
  return isMaisonLivePending(raw);
}
