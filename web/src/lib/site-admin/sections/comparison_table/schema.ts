import { z } from "zod";
import { sectionPresentationSchema } from "../shared/presentation";

const columnSchema = z.object({
  label: z.string().min(1).max(60),
  highlighted: z.boolean().default(false),
});

const rowSchema = z.object({
  feature: z.string().min(1).max(140),
  /** One value per column; supports "yes" / "no" / any string. */
  values: z.array(z.string().max(80)).min(1).max(6),
});

export const comparisonTableSchemaV1 = z.object({
  eyebrow: z.string().max(60).optional(),
  headline: z.string().max(200).optional(),
  intro: z.string().max(400).optional(),
  columns: z.array(columnSchema).min(2).max(6),
  rows: z.array(rowSchema).min(1).max(40),
  variant: z.enum(["bordered", "striped", "minimal"]).default("striped"),
  presentation: sectionPresentationSchema,
});

export type ComparisonTableV1 = z.infer<typeof comparisonTableSchemaV1>;
export type ComparisonColumn = z.infer<typeof columnSchema>;
export type ComparisonRow = z.infer<typeof rowSchema>;
export const comparisonTableSchemasByVersion = { 1: comparisonTableSchemaV1 } as const;
