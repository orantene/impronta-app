import { z } from "zod";
import { sectionPresentationSchema } from "../shared/presentation";

const eventSchema = z.object({
  date: z.string().min(1).max(40),
  time: z.string().max(40).optional(),
  title: z.string().min(1).max(200),
  description: z.string().max(400).optional(),
  location: z.string().max(160).optional(),
  category: z.string().max(40).optional(),
  rsvpUrl: z.string().max(500).optional(),
  rsvpLabel: z.string().max(40).optional(),
});

export const eventListingSchemaV1 = z.object({
  eyebrow: z.string().max(60).optional(),
  headline: z.string().max(200).optional(),
  events: z.array(eventSchema).min(1).max(40),
  variant: z.enum(["list", "agenda", "cards"]).default("list"),
  presentation: sectionPresentationSchema,
});

export type EventListingV1 = z.infer<typeof eventListingSchemaV1>;
export type EventItem = z.infer<typeof eventSchema>;
export const eventListingSchemasByVersion = { 1: eventListingSchemaV1 } as const;
