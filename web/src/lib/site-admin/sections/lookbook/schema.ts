import { z } from "zod";
import { sectionPresentationSchema } from "../shared/presentation";

const sideSchema = z.object({
  imageUrl: z.string().url().max(2048),
  alt: z.string().max(200).optional(),
  caption: z.string().max(160).optional(),
});

export const lookbookSchemaV1 = z.object({
  eyebrow: z.string().max(60).optional(),
  headline: z.string().max(200).optional(),
  pages: z.array(sideSchema).min(2).max(20),
  variant: z.enum(["spread", "stack"]).default("spread"),
  ratio: z.enum(["3/4", "4/5", "1/1"]).default("3/4"),
  presentation: sectionPresentationSchema,
});

export type LookbookV1 = z.infer<typeof lookbookSchemaV1>;
export type LookbookPage = z.infer<typeof sideSchema>;
export const lookbookSchemasByVersion = { 1: lookbookSchemaV1 } as const;
