import { z } from "zod";
import { nodePresentationSchema } from "../shared/node-presentation";
import { sectionPresentationSchema } from "../shared/presentation";

const postSchema = z.object({
  title: z.string().min(1).max(200),
  excerpt: z.string().max(400).optional(),
  date: z.string().max(40).optional(),
  category: z.string().max(40).optional(),
  imageUrl: z.string().url().max(2048).optional(),
  imageAlt: z.string().max(200).optional(),
  href: z.string().min(1).max(500),
});

export const blogIndexSchemaV1 = z.object({
  eyebrow: z.string().max(60).optional(),
  headline: z.string().max(200).optional(),
  /**
   * "live" = the site's real posts ("Últimos posts"); "manual" = the list below.
   * Absent = legacy: manual when `posts` has items, live otherwise.
   */
  source: z.enum(["live", "manual"]).optional(),
  /** Live source: how many posts to show (default 3). */
  limit: z.number().int().min(1).max(12).optional(),
  /** Live source: only this category (slug). */
  categorySlug: z.string().max(80).optional(),
  /** Manual list. Optional now that the section can be live. */
  posts: z.array(postSchema).max(24).optional(),
  variant: z.enum(["cards", "list", "magazine"]).default("cards"),
  columnsDesktop: z.number().int().min(2).max(4).default(3),
  nodePresentation: z
    .object({
      subheadline: nodePresentationSchema,
      headline: nodePresentationSchema,
    })
    .optional(),
  presentation: sectionPresentationSchema,
});

export type BlogIndexV1 = z.infer<typeof blogIndexSchemaV1>;
export type BlogIndexPost = z.infer<typeof postSchema>;
export const blogIndexSchemasByVersion = { 1: blogIndexSchemaV1 } as const;
