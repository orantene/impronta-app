/**
 * Zod shape for the admin "create talent profile" form.
 *
 * Split out of `admin-talent.ts` because that module is `"use server"`, where
 * every export must be an action — a schema cannot live there as an export, and
 * keeping it inline pushed the file past its 800-line budget. One shape, one
 * home, importable by both the action and its tests.
 */

import { z } from "zod";

import { pgUuidSchema } from "@/lib/site-admin/validators";

const trimmedField = z
  .string()
  .optional()
  .transform((v) => (typeof v === "string" ? v.trim() : ""));

export const createTalentSchema = z.object({
  display_name: z
    .string()
    .transform((v) => v.trim())
    .pipe(z.string().min(1, "Display name is required.")),
  first_name: trimmedField,
  last_name: trimmedField,
  short_bio: trimmedField,
  phone: trimmedField,
  talent_type_term_id: pgUuidSchema()
    .optional()
    .or(z.literal("").transform(() => undefined)),
  agency_visibility: z
    .enum(["roster_only", "site_visible", "featured"])
    .default("roster_only"),
});
