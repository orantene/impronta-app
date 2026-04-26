import { z } from "zod";

import { sectionPresentationSchema } from "../shared/presentation";

const itemSchema = z.object({
  question: z.string().min(1).max(220),
  answer: z.string().min(1).max(1500),
});

export const faqAccordionSchemaV1 = z.object({
  eyebrow: z.string().max(60).optional(),
  headline: z.string().max(200).optional(),
  intro: z.string().max(400).optional(),
  items: z.array(itemSchema).min(1).max(20),
  variant: z.enum(["bordered", "minimal", "card"]).default("bordered"),
  defaultOpen: z.number().int().min(-1).max(20).default(-1),
  presentation: sectionPresentationSchema,
});

export type FaqAccordionV1 = z.infer<typeof faqAccordionSchemaV1>;
export type FaqAccordionItem = z.infer<typeof itemSchema>;

export const faqAccordionSchemasByVersion = {
  1: faqAccordionSchemaV1,
} as const;
