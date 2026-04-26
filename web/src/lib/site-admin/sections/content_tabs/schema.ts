import { z } from "zod";
import { sectionPresentationSchema } from "../shared/presentation";

const tabSchema = z.object({
  label: z.string().min(1).max(60),
  body: z.string().max(2000),
});

export const contentTabsSchemaV1 = z.object({
  eyebrow: z.string().max(60).optional(),
  headline: z.string().max(200).optional(),
  tabs: z.array(tabSchema).min(2).max(8),
  variant: z.enum(["pills", "underline", "bordered"]).default("underline"),
  defaultTab: z.number().int().min(0).max(7).default(0),
  presentation: sectionPresentationSchema,
});

export type ContentTabsV1 = z.infer<typeof contentTabsSchemaV1>;
export type ContentTab = z.infer<typeof tabSchema>;
export const contentTabsSchemasByVersion = { 1: contentTabsSchemaV1 } as const;
