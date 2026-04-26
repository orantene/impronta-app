import { z } from "zod";

import { sectionPresentationSchema } from "../shared/presentation";

const itemSchema = z.object({
  text: z.string().min(1).max(140),
  href: z.string().max(500).optional(),
});

export const marqueeSchemaV1 = z.object({
  items: z.array(itemSchema).min(2).max(40),
  speed: z.enum(["slow", "medium", "fast"]).default("medium"),
  direction: z.enum(["left", "right"]).default("left"),
  separator: z.enum(["dot", "slash", "diamond", "none"]).default("dot"),
  variant: z.enum(["text", "tags"]).default("text"),
  presentation: sectionPresentationSchema,
});

export type MarqueeV1 = z.infer<typeof marqueeSchemaV1>;
export type MarqueeItem = z.infer<typeof itemSchema>;

export const marqueeSchemasByVersion = { 1: marqueeSchemaV1 } as const;
