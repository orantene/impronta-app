import { z } from "zod";

export const HEX_COLOR = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/u, "Color must be a 6-digit hex like #0B0B0D");

const WATERMARK_POSITIONS = [
  "tl", "tc", "tr", "ml", "mc", "mr", "bl", "bc", "br",
] as const;

export const watermarkPresetSchema = z.object({
  enabled:     z.boolean(),
  position:    z.enum(WATERMARK_POSITIONS),
  size_pct:    z.number().min(4).max(25),
  opacity:     z.number().min(0).max(1),
  padding_pct: z.number().min(0).max(10),
  variant:     z.enum(["light", "dark"]),
}).optional();
