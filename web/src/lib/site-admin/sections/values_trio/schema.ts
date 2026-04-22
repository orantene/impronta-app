import { z } from "zod";

import { sectionPresentationSchema } from "../shared/presentation";

/**
 * Values trio — 3 numbered cards. Used on About pages ("Three principles
 * our members agree on" in Muse Bridal).
 */
const itemSchema = z.object({
  numberLabel: z.string().max(10).optional(),
  title: z.string().min(1).max(140),
  detail: z.string().max(360).optional(),
});

export const valuesTrioSchemaV1 = z.object({
  eyebrow: z.string().max(60).optional(),
  headline: z.string().max(200).optional(),
  items: z.array(itemSchema).min(2).max(5),
  variant: z.enum(["numbered-cards", "iconed"]).default("numbered-cards"),
  numberStyle: z
    .enum(["serif-italic", "sans-large", "roman", "none"])
    .default("serif-italic"),
  presentation: sectionPresentationSchema,
});

export type ValuesTrioV1 = z.infer<typeof valuesTrioSchemaV1>;
export type ValuesTrioItem = z.infer<typeof itemSchema>;

export const valuesTrioSchemasByVersion = { 1: valuesTrioSchemaV1 } as const;
