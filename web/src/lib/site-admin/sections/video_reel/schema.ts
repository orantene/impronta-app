import { z } from "zod";
import { sectionPresentationSchema } from "../shared/presentation";

const chapterSchema = z.object({
  /** Seconds into the video (e.g. 75 = 1:15). */
  time: z.number().int().nonnegative().max(86400),
  label: z.string().min(1).max(80),
});

export const videoReelSchemaV1 = z.object({
  eyebrow: z.string().max(60).optional(),
  headline: z.string().max(200).optional(),
  /** HTTPS URL to the video file (mp4 / webm). */
  videoUrl: z.string().url().max(2048),
  posterUrl: z.string().url().max(2048).optional(),
  chapters: z.array(chapterSchema).max(20).default([]),
  ratio: z.enum(["16/9", "4/3", "1/1", "21/9", "9/16"]).default("16/9"),
  controls: z.boolean().default(true),
  loop: z.boolean().default(false),
  muted: z.boolean().default(false),
  autoplay: z.boolean().default(false),
  presentation: sectionPresentationSchema,
});

export type VideoReelV1 = z.infer<typeof videoReelSchemaV1>;
export type VideoReelChapter = z.infer<typeof chapterSchema>;
export const videoReelSchemasByVersion = { 1: videoReelSchemaV1 } as const;
