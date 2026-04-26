import { z } from "zod";
import { sectionPresentationSchema } from "../shared/presentation";

const itemSchema = z.object({
  src: z.string().url().max(2048),
  alt: z.string().max(200).optional(),
  caption: z.string().max(140).optional(),
  href: z.string().max(500).optional(),
});

export const masonrySchemaV1 = z.object({
  eyebrow: z.string().max(60).optional(),
  headline: z.string().max(200).optional(),
  items: z.array(itemSchema).min(2).max(48),
  columnsDesktop: z.number().int().min(2).max(5).default(3),
  gap: z.enum(["tight", "standard", "airy"]).default("standard"),
  presentation: sectionPresentationSchema,
});

export type MasonryV1 = z.infer<typeof masonrySchemaV1>;
export type MasonryItem = z.infer<typeof itemSchema>;
export const masonrySchemasByVersion = { 1: masonrySchemaV1 } as const;
