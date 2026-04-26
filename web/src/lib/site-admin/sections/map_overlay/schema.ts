import { z } from "zod";
import { sectionPresentationSchema } from "../shared/presentation";

function isAllowedMapUrl(value: string): boolean {
  try {
    const u = new URL(value);
    if (u.protocol !== "https:") return false;
    return (
      u.hostname === "www.google.com" ||
      u.hostname === "maps.google.com" ||
      u.hostname.endsWith(".google.com") ||
      u.hostname.endsWith(".openstreetmap.org") ||
      u.hostname === "www.bing.com"
    );
  } catch {
    return false;
  }
}

export const mapOverlaySchemaV1 = z.object({
  eyebrow: z.string().max(60).optional(),
  headline: z.string().max(200).optional(),
  /** Google Maps / OpenStreetMap embed URL (https://www.google.com/maps/embed?…). */
  mapEmbedUrl: z
    .string()
    .url()
    .max(2048)
    .refine(isAllowedMapUrl, "URL must be a Google Maps / OpenStreetMap embed"),
  /** Copy block shown over the map. */
  card: z.object({
    title: z.string().min(1).max(160),
    body: z.string().max(800).optional(),
    address: z.string().max(280).optional(),
    hours: z.string().max(280).optional(),
  }),
  side: z.enum(["card-left", "card-right", "card-bottom"]).default("card-left"),
  ratio: z.enum(["16/9", "4/3", "1/1", "21/9"]).default("16/9"),
  presentation: sectionPresentationSchema,
});

export type MapOverlayV1 = z.infer<typeof mapOverlaySchemaV1>;
export const mapOverlaySchemasByVersion = { 1: mapOverlaySchemaV1 } as const;
