import { z } from "zod";
import { sectionPresentationSchema } from "../shared/presentation";

const itemSchema = z.object({
  date: z.string().min(1).max(40),
  title: z.string().min(1).max(160),
  body: z.string().max(800).optional(),
});

export const timelineSchemaV1 = z.object({
  eyebrow: z.string().max(60).optional(),
  headline: z.string().max(200).optional(),
  items: z.array(itemSchema).min(1).max(40),
  variant: z.enum(["centered", "left-rail", "right-rail"]).default("left-rail"),
  numberStyle: z.enum(["dot", "ring", "year"]).default("dot"),
  presentation: sectionPresentationSchema,
});

export type TimelineV1 = z.infer<typeof timelineSchemaV1>;
export type TimelineItem = z.infer<typeof itemSchema>;
export const timelineSchemasByVersion = { 1: timelineSchemaV1 } as const;
