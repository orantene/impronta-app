import { z } from "zod";

import { sectionPresentationSchema } from "../shared/presentation";

const itemSchema = z.object({
  value: z.string().min(1).max(20),
  label: z.string().min(1).max(80),
  caption: z.string().max(140).optional(),
});

export const statsSchemaV1 = z.object({
  eyebrow: z.string().max(60).optional(),
  headline: z.string().max(200).optional(),
  items: z.array(itemSchema).min(2).max(6),
  variant: z.enum(["row", "grid", "split"]).default("row"),
  align: z.enum(["start", "center"]).default("center"),
  presentation: sectionPresentationSchema,
});

export type StatsV1 = z.infer<typeof statsSchemaV1>;
export type StatsItem = z.infer<typeof itemSchema>;

export const statsSchemasByVersion = { 1: statsSchemaV1 } as const;
