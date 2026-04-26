import { z } from "zod";
import { sectionPresentationSchema } from "../shared/presentation";

const memberSchema = z.object({
  name: z.string().min(1).max(120),
  role: z.string().max(140).optional(),
  bio: z.string().max(400).optional(),
  imageUrl: z.string().url().max(2048).optional(),
  imageAlt: z.string().max(200).optional(),
  href: z.string().max(500).optional(),
});

export const teamGridSchemaV1 = z.object({
  eyebrow: z.string().max(60).optional(),
  headline: z.string().max(200).optional(),
  intro: z.string().max(400).optional(),
  members: z.array(memberSchema).min(1).max(40),
  variant: z.enum(["portrait", "circle", "row"]).default("portrait"),
  columnsDesktop: z.number().int().min(2).max(6).default(3),
  presentation: sectionPresentationSchema,
});

export type TeamGridV1 = z.infer<typeof teamGridSchemaV1>;
export type TeamMember = z.infer<typeof memberSchema>;
export const teamGridSchemasByVersion = { 1: teamGridSchemaV1 } as const;
