import { z } from "zod";
import { sectionPresentationSchema } from "../shared/presentation";

export const blogDetailSchemaV1 = z.object({
  category: z.string().max(40).optional(),
  date: z.string().max(40).optional(),
  title: z.string().min(1).max(200).describe("@rich"),
  byline: z.string().max(120).optional(),
  heroImageUrl: z.string().url().max(2048).optional(),
  heroImageAlt: z.string().max(200).optional(),
  body: z.string().max(20000),
  pullQuote: z.string().max(400).optional(),
  presentation: sectionPresentationSchema,
});

export type BlogDetailV1 = z.infer<typeof blogDetailSchemaV1>;
export const blogDetailSchemasByVersion = { 1: blogDetailSchemaV1 } as const;
