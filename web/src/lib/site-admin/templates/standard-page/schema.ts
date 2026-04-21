import { z } from "zod";

export const standardPageSchemaV1 = z.object({
  title: z.string().min(1).max(140),
  body: z.string().default(""),
  metaTitle: z.string().max(140).optional(),
  metaDescription: z.string().max(280).optional(),
});

export type StandardPageV1 = z.infer<typeof standardPageSchemaV1>;

export const standardPageSchemasByVersion = {
  1: standardPageSchemaV1,
} as const;
