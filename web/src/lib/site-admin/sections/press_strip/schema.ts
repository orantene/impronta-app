import { z } from "zod";

import { sectionPresentationSchema } from "../shared/presentation";

/**
 * Press strip — horizontal row of publication names (serif italic) or
 * uploaded logo images. "As seen in Vogue / Brides / Harper's Bazaar / ..."
 */
const itemSchema = z.object({
  name: z.string().min(1).max(80),
  logoUrl: z.string().url().max(2048).optional(),
});

export const pressStripSchemaV1 = z.object({
  eyebrow: z.string().max(60).optional(),
  items: z.array(itemSchema).min(1).max(12),
  variant: z
    .enum(["text-italic-serif", "logo-row", "mixed"])
    .default("text-italic-serif"),
  presentation: sectionPresentationSchema,
});

export type PressStripV1 = z.infer<typeof pressStripSchemaV1>;
export type PressStripItem = z.infer<typeof itemSchema>;

export const pressStripSchemasByVersion = { 1: pressStripSchemaV1 } as const;
