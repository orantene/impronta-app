import { z } from "zod";

import { sectionPresentationSchema } from "../shared/presentation";

/**
 * Trust strip — a small band of positioning value-props. Three layout
 * variants (`icon-row` with big serif numerals, `metrics-row` with stats,
 * `logo-row` with publication/client names). Every brand vertical uses
 * this section, only the variant changes.
 */

const trustItemSchema = z.object({
  label: z.string().min(1).max(80),
  detail: z.string().max(200).optional(),
  /** For `metrics-row` variant: the number/stat (e.g. "12", "98%"). */
  stat: z.string().max(40).optional(),
});

export const trustStripSchemaV1 = z.object({
  /** Optional eyebrow above the band. */
  eyebrow: z.string().max(60).optional(),
  /** Optional headline / positioning line. */
  headline: z.string().max(140).optional(),
  items: z.array(trustItemSchema).min(1).max(6),
  variant: z
    .enum(["icon-row", "metrics-row", "logo-row"])
    .default("icon-row"),
  /** Section background: neutral | champagne | espresso-deep. */
  background: z
    .enum(["neutral", "champagne", "espresso", "ivory"])
    .default("neutral"),
  /** Vertical padding density. Overrides theme default when set. */
  density: z.enum(["tight", "standard", "airy"]).optional(),
  /** M8 — shared presentation controls (background / padding / align / ...). */
  presentation: sectionPresentationSchema,
});

export type TrustStripV1 = z.infer<typeof trustStripSchemaV1>;
export type TrustStripItem = z.infer<typeof trustItemSchema>;

export const trustStripSchemasByVersion = {
  1: trustStripSchemaV1,
} as const;
