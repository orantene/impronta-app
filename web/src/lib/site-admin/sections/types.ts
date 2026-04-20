/**
 * Phase 5 — section registry types.
 *
 * Section types are platform-owned. A tenant creates reusable section
 * *instances* from a type (cms_sections row); homepage composition uses
 * cms_page_sections to order section references on a page.
 *
 * Per-type directory structure (locked):
 *   sections/{type-key}/
 *     schema.ts      // Zod schemas per version
 *     migrations.ts  // version-to-version migrators
 *     meta.ts        // SectionMeta object
 *     Component.tsx  // public render
 *     Editor.tsx     // admin edit form
 */

import type { ComponentType } from "react";
import type { z } from "zod";

export type SectionBusinessPurpose =
  | "hero"
  | "conversion"
  | "trust"
  | "promo"
  | "feature"
  | "footer";

export interface SectionMeta {
  key: string;
  label: string;
  description: string;
  /** Business purpose (groups in the section picker). */
  businessPurpose: SectionBusinessPurpose;
  /** Agency-visible when TRUE; platform-internal when FALSE. */
  visibleToAgency: boolean;
}

export interface SectionComponentProps<TShape> {
  props: TShape;
  tenantId: string;
  locale: string;
  preview: boolean;
}

export interface SectionEditorProps<TShape> {
  initial: TShape;
  onChange: (next: TShape) => void;
}

export interface SectionRegistryEntry<TShape = unknown> {
  meta: SectionMeta;
  currentVersion: number;
  schemasByVersion: Record<number, z.ZodType<TShape>>;
  migrations: Record<number, (old: unknown) => unknown>;
  Component: ComponentType<SectionComponentProps<TShape>>;
  Editor: ComponentType<SectionEditorProps<TShape>>;
}

export function migrateSectionPayload(
  registry: SectionRegistryEntry,
  persistedVersion: number,
  persistedPayload: unknown,
): { version: number; payload: unknown } {
  let version = persistedVersion;
  let payload = persistedPayload;
  while (version < registry.currentVersion) {
    const step = registry.migrations[version];
    if (!step) {
      throw new Error(
        `section ${registry.meta.key} missing migration from v${version}`,
      );
    }
    payload = step(payload);
    version += 1;
  }
  return { version, payload };
}
