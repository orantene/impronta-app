import { z } from "zod";
import { sectionPresentationSchema } from "../shared/presentation";

const tagSchema = z.object({
  /** % from left (0-100). */
  x: z.number().min(0).max(100),
  /** % from top (0-100). */
  y: z.number().min(0).max(100),
  label: z.string().min(1).max(80),
  detail: z.string().max(280).optional(),
});

export const imageOrbitSchemaV1 = z.object({
  eyebrow: z.string().max(60).optional(),
  headline: z.string().max(200).optional(),
  imageUrl: z.string().url().max(2048),
  imageAlt: z.string().max(200).optional(),
  tags: z.array(tagSchema).min(1).max(20),
  ratio: z.enum(["16/9", "4/3", "1/1", "5/4"]).default("4/3"),
  presentation: sectionPresentationSchema,
});

export type ImageOrbitV1 = z.infer<typeof imageOrbitSchemaV1>;
export type ImageOrbitTag = z.infer<typeof tagSchema>;
export const imageOrbitSchemasByVersion = { 1: imageOrbitSchemaV1 } as const;
