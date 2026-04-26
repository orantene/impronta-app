import { z } from "zod";
import { sectionPresentationSchema } from "../shared/presentation";

/**
 * URL must be HTTPS and from an allow-listed host. LottieFiles + GitHub
 * raw + jsdelivr are common hosting choices for .json / .lottie files.
 */
function isAllowedLottieUrl(value: string): boolean {
  try {
    const u = new URL(value);
    if (u.protocol !== "https:") return false;
    const allowed = [
      "lottiefiles.com",
      "lottie.host",
      "raw.githubusercontent.com",
      "cdn.jsdelivr.net",
      "unpkg.com",
    ];
    return allowed.some((h) => u.hostname === h || u.hostname.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

export const lottieSchemaV1 = z.object({
  eyebrow: z.string().max(60).optional(),
  headline: z.string().max(200).optional(),
  caption: z.string().max(280).optional(),
  /** HTTPS URL to a .json or .lottie file on an allow-listed host. */
  src: z
    .string()
    .url()
    .max(2048)
    .refine(isAllowedLottieUrl, "URL must be HTTPS and on an allow-listed host"),
  trigger: z.enum(["autoplay", "hover", "scroll", "click"]).default("autoplay"),
  loop: z.boolean().default(true),
  speed: z.number().min(0.25).max(3).default(1),
  ratio: z.enum(["16/9", "4/3", "1/1", "9/16"]).default("1/1"),
  /** Width cap for the animation (px). Defaults to 480. */
  maxWidth: z.number().int().min(120).max(1600).default(480),
  presentation: sectionPresentationSchema,
});

export type LottieV1 = z.infer<typeof lottieSchemaV1>;
export const lottieSchemasByVersion = { 1: lottieSchemaV1 } as const;
