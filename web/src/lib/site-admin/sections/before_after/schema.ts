import { z } from "zod";
import { sectionPresentationSchema } from "../shared/presentation";

export const beforeAfterSchemaV1 = z.object({
  eyebrow: z.string().max(60).optional(),
  headline: z.string().max(200).optional(),
  beforeUrl: z.string().url().max(2048),
  afterUrl: z.string().url().max(2048),
  beforeAlt: z.string().max(200).optional(),
  afterAlt: z.string().max(200).optional(),
  beforeLabel: z.string().max(40).default("Before"),
  afterLabel: z.string().max(40).default("After"),
  /** Initial divider position (0..100, percent from left). */
  initialPosition: z.number().int().min(0).max(100).default(50),
  ratio: z.enum(["16/9", "4/3", "1/1", "5/4"]).default("16/9"),
  presentation: sectionPresentationSchema,
});

export type BeforeAfterV1 = z.infer<typeof beforeAfterSchemaV1>;
export const beforeAfterSchemasByVersion = { 1: beforeAfterSchemaV1 } as const;
