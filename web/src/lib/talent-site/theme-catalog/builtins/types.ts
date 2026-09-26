/**
 * Talent theme gallery BUILT-INS: shared shapes for the in-code Design + Look
 * catalog (pure, client-safe; no server imports).
 *
 * A built-in entry carries everything `sync-builtins.server.ts` needs to
 * upsert a `talent_theme_catalog` row EXCEPT the DB-generated fields (id,
 * created_at, updated_at, created_by, updated_by) and `status` /
 * `schema_version` / `source`, which the sync always sets itself
 * (`published` / `TALENT_THEME_SCHEMA_VERSION` / `'builtin'`).
 *
 * `buildPayload()` is a function, not a stored value, so the payload is
 * rebuilt fresh on every sync from the section kit / theme-presets source of
 * truth rather than drifting from it. `sync-builtins.server.ts` hashes the
 * REBUILT payload to decide whether to bump `version` — so `buildPayload`
 * must be deterministic (same slug in, byte-identical payload out) or every
 * sync would look like a change. See `designs/_shared.ts`.
 */
import type {
  DesignPayload,
  LookPayload,
  TalentThemeRequiredTier,
  ThemePreview,
} from "../types";

/** Design category chip shown in the gallery filter row. */
export type BuiltinDesignCategory =
  | "minimal"
  | "editorial"
  | "bold"
  | "classic"
  | "creator";

interface BuiltinEntryBase {
  slug: string;
  title: string;
  summary: string;
  tags: string[];
  required_talent_tier: TalentThemeRequiredTier;
  sort_order: number;
  /** ISO timestamp; the row shows a "New" badge until this instant. */
  is_new_until: string | null;
  preview: ThemePreview;
}

export interface BuiltinDesignEntry extends BuiltinEntryBase {
  kind: "design";
  category: BuiltinDesignCategory;
  buildPayload: () => DesignPayload;
}

export interface BuiltinLookEntry extends BuiltinEntryBase {
  kind: "look";
  /** Looks are not filtered by category today; reserved for a future split. */
  category: string | null;
  /** When set, this Look is valid only for that Design slug (Maison palettes). */
  for_design?: string | null;
  buildPayload: () => LookPayload;
}
