import { z } from "zod";
import { sectionPresentationSchema } from "../shared/presentation";

const cardSchema = z.object({
  imageUrl: z.string().url().max(2048).optional(),
  imageAlt: z.string().max(200).optional(),
  category: z.string().max(40).optional(),
  title: z.string().min(1).max(200),
  excerpt: z.string().max(280).optional(),
  href: z.string().max(500).optional(),
});

export const magazineLayoutSchemaV1 = z.object({
  eyebrow: z.string().max(60).optional(),
  headline: z.string().max(200).optional(),
  hero: cardSchema,
  secondary: z.array(cardSchema).min(2).max(4),
  presentation: sectionPresentationSchema,
});

export type MagazineLayoutV1 = z.infer<typeof magazineLayoutSchemaV1>;
export type MagazineCard = z.infer<typeof cardSchema>;
export const magazineLayoutSchemasByVersion = { 1: magazineLayoutSchemaV1 } as const;
