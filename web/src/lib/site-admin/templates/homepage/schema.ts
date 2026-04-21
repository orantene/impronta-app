import { z } from "zod";

export const homepageSchemaV1 = z.object({
  /** Editorial title; not rendered on page but used in SEO + admin list. */
  title: z.string().min(1).max(140),
  /** Meta description override; falls back to branding defaults when empty. */
  metaDescription: z.string().max(280).optional(),
  /** Optional hero fallback text if the hero slot is unfilled. */
  introTagline: z.string().max(140).optional(),
});

export type HomepageV1 = z.infer<typeof homepageSchemaV1>;

export const homepageSchemasByVersion = {
  1: homepageSchemaV1,
} as const;
