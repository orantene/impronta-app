/**
 * Phase 5 — Starter Kit manifest contract.
 *
 * Starter kits are opinionated, platform-authored sets of pages + sections
 * + branding + navigation that a tenant can import. M0 ships only the
 * contract (type + Zod validator); M7 wires the import UI and overwrite
 * semantics.
 *
 * Locked rules:
 *   - kits are NOT templates: a kit materializes tenant-owned *copies*.
 *   - no silent overwrite: the importer surfaces every collision for
 *     confirmation (overwrite | skip | rename).
 *   - a kit's `overwriteBehavior` declares the default resolution strategy.
 */

import { z } from "zod";

export const STARTER_KIT_MODES = ["empty_site", "additive", "reset"] as const;
export type StarterKitMode = (typeof STARTER_KIT_MODES)[number];

export const STARTER_KIT_OVERWRITE_BEHAVIORS = [
  "skip_existing",
  "rename_incoming",
  "overwrite_with_confirmation",
] as const;
export type StarterKitOverwriteBehavior =
  (typeof STARTER_KIT_OVERWRITE_BEHAVIORS)[number];

export const starterKitManifestSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  description: z.string(),
  version: z.number().int().positive(),
  targetMode: z.enum(STARTER_KIT_MODES),
  overwriteBehavior: z.enum(STARTER_KIT_OVERWRITE_BEHAVIORS),
  /** Optional launch checklist surfaced post-import. */
  launchChecklist: z
    .array(
      z.object({
        label: z.string(),
        href: z.string().optional(),
      }),
    )
    .optional(),
  /** Preview imagery for the picker. */
  previewMedia: z
    .array(
      z.object({
        label: z.string(),
        url: z.string().url(),
      }),
    )
    .optional(),
  pages: z
    .array(
      z.object({
        templateKey: z.string(),
        slug: z.string(),
        locale: z.string(),
        title: z.string(),
        payload: z.record(z.string(), z.unknown()),
        sections: z
          .array(
            z.object({
              sectionTypeKey: z.string(),
              slotKey: z.string(),
              sortOrder: z.number().int(),
              name: z.string(),
              propsJson: z.record(z.string(), z.unknown()),
            }),
          )
          .optional(),
      }),
    )
    .optional(),
  branding: z.record(z.string(), z.unknown()).optional(),
  navigation: z
    .array(
      z.object({
        label: z.string(),
        href: z.string(),
        parent: z.string().optional(),
        sortOrder: z.number().int(),
      }),
    )
    .optional(),
});

export type StarterKitManifest = z.infer<typeof starterKitManifestSchema>;
