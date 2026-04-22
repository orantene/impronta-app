import { z } from "zod";

import { sectionPresentationSchema } from "../shared/presentation";

/**
 * Process / how-it-works block — N numbered cards. Variants control whether
 * numbers are serif italic (editorial), sans large (modern), or roman (formal).
 */

const stepSchema = z.object({
  label: z.string().min(1).max(80),
  detail: z.string().max(320).optional(),
});

export const processStepsSchemaV1 = z.object({
  eyebrow: z.string().max(60).optional(),
  headline: z.string().max(200).optional(),
  copy: z.string().max(320).optional(),
  steps: z.array(stepSchema).min(2).max(6),
  variant: z
    .enum(["numbered-column", "horizontal-timeline", "alternating-image"])
    .default("numbered-column"),
  numberStyle: z
    .enum(["serif-italic", "sans-large", "roman", "none"])
    .default("serif-italic"),
  presentation: sectionPresentationSchema,
});

export type ProcessStepsV1 = z.infer<typeof processStepsSchemaV1>;
export type ProcessStepsStep = z.infer<typeof stepSchema>;

export const processStepsSchemasByVersion = {
  1: processStepsSchemaV1,
} as const;
