/**
 * Phase 5 — template registry.
 *
 * Closed set of tenant-facing page templates. Platform-owned; tenants choose
 * from this list when creating pages. New templates ship via a PR against
 * this module (schema + migrations + meta directory).
 */

import type { TemplateRegistryEntry } from "./types";
import {
  homepageSchemasByVersion,
  type HomepageV1,
} from "./homepage/schema";
import { homepageMeta } from "./homepage/meta";
import { homepageMigrations } from "./homepage/migrations";
import {
  standardPageSchemasByVersion,
  type StandardPageV1,
} from "./standard-page/schema";
import { standardPageMeta } from "./standard-page/meta";
import { standardPageMigrations } from "./standard-page/migrations";

export const homepageTemplate: TemplateRegistryEntry<HomepageV1> = {
  meta: homepageMeta,
  currentVersion: 1,
  schemasByVersion: homepageSchemasByVersion,
  migrations: homepageMigrations,
};

export const standardPageTemplate: TemplateRegistryEntry<StandardPageV1> = {
  meta: standardPageMeta,
  currentVersion: 1,
  schemasByVersion: standardPageSchemasByVersion,
  migrations: standardPageMigrations,
};

export const TEMPLATE_REGISTRY = {
  homepage: homepageTemplate,
  standard_page: standardPageTemplate,
} as const;

export type TemplateKey = keyof typeof TEMPLATE_REGISTRY;

export function getTemplate(key: string): TemplateRegistryEntry | null {
  if (!(key in TEMPLATE_REGISTRY)) return null;
  return TEMPLATE_REGISTRY[key as TemplateKey] as TemplateRegistryEntry;
}

export function listTemplates(): ReadonlyArray<TemplateRegistryEntry> {
  return Object.values(TEMPLATE_REGISTRY);
}
