/**
 * Phase 5 — section registry.
 *
 * Platform-owned catalog of section types. Tenants instantiate these via
 * cms_sections rows; homepage composer references instances via
 * cms_page_sections. New types ship as a new directory + PR entry here.
 */

import type { SectionRegistryEntry } from "./types";
import { heroMeta } from "./hero/meta";
import { heroMigrations } from "./hero/migrations";
import { heroSchemasByVersion, type HeroV1 } from "./hero/schema";
import { HeroComponent } from "./hero/Component";
import { HeroEditor } from "./hero/Editor";

export const heroSection: SectionRegistryEntry<HeroV1> = {
  meta: heroMeta,
  currentVersion: 1,
  schemasByVersion: heroSchemasByVersion,
  migrations: heroMigrations,
  Component: HeroComponent,
  Editor: HeroEditor,
};

export const SECTION_REGISTRY = {
  hero: heroSection,
} as const;

export type SectionTypeKey = keyof typeof SECTION_REGISTRY;

export function getSectionType(key: string): SectionRegistryEntry | null {
  if (!(key in SECTION_REGISTRY)) return null;
  return SECTION_REGISTRY[key as SectionTypeKey] as SectionRegistryEntry;
}

export function listAgencyVisibleSections(): ReadonlyArray<SectionRegistryEntry> {
  return Object.values(SECTION_REGISTRY).filter(
    (s) => s.meta.visibleToAgency,
  ) as ReadonlyArray<SectionRegistryEntry>;
}
