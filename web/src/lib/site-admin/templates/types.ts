/**
 * Phase 5 — template registry types.
 *
 * Templates describe the shape of a cms_pages row at the page level:
 *   - which fields are editable (title, meta, body, hero, etc.)
 *   - what the current schema version is
 *   - the per-version Zod schemas and migration functions
 *   - which section slots the page exposes (M5 wires these; M3 inert)
 *
 * Locked at plan kickoff: template_schema_version on cms_pages points here.
 */

import type { z } from "zod";

export interface TemplateSlotSpec {
  /** Stable key referenced from cms_page_sections.slot_key. */
  key: string;
  /** Human label for the editor. */
  label: string;
  /** Whether the slot is required at publish time. */
  required: boolean;
  /** Optional allow-list of section type keys (tightens composition). */
  allowedSectionTypes?: readonly string[];
}

export interface TemplateMeta {
  /** Stable key (e.g. "homepage", "standard_page"). */
  key: string;
  /** Display label. */
  label: string;
  /** Short description shown in editor. */
  description: string;
  /** TRUE for platform-owned templates (homepage) that seed is_system_owned pages. */
  systemOwned: boolean;
  /** Slot shape (inert for non-homepage in Phase 5). */
  slots: readonly TemplateSlotSpec[];
}

export interface TemplateRegistryEntry<TShape = unknown> {
  meta: TemplateMeta;
  /** Integer version of the current schema. cms_pages.template_schema_version matches this. */
  currentVersion: number;
  /** Keyed Zod schemas, one per version. currentVersion must be present. */
  schemasByVersion: Record<number, z.ZodType<TShape>>;
  /** Migrations from N → N+1. Keys are the source version. */
  migrations: Record<number, (old: unknown) => unknown>;
}

export function migrateTemplatePayload(
  registry: TemplateRegistryEntry,
  persistedVersion: number,
  persistedPayload: unknown,
): { version: number; payload: unknown } {
  let version = persistedVersion;
  let payload = persistedPayload;
  while (version < registry.currentVersion) {
    const step = registry.migrations[version];
    if (!step) {
      throw new Error(
        `template ${registry.meta.key} missing migration from v${version}`,
      );
    }
    payload = step(payload);
    version += 1;
  }
  return { version, payload };
}
