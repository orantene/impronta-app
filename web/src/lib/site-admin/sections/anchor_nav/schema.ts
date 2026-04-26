import { z } from "zod";
import { sectionPresentationSchema } from "../shared/presentation";

const linkSchema = z.object({
  label: z.string().min(1).max(60),
  href: z.string().min(1).max(500),
});

export const anchorNavSchemaV1 = z.object({
  links: z.array(linkSchema).min(2).max(20),
  variant: z.enum(["pills", "underline", "tabs"]).default("pills"),
  sticky: z.boolean().default(false),
  align: z.enum(["start", "center", "end"]).default("center"),
  presentation: sectionPresentationSchema,
});

export type AnchorNavV1 = z.infer<typeof anchorNavSchemaV1>;
export type AnchorNavLink = z.infer<typeof linkSchema>;
export const anchorNavSchemasByVersion = { 1: anchorNavSchemaV1 } as const;
