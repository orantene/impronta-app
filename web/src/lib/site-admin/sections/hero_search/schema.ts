import { z } from "zod";

import { nodePresentationSchema } from "../shared/node-presentation";
import { sectionPresentationSchema } from "../shared/presentation";
import { linkRefOrLegacy, optionalLinkRefOrLegacy } from "../../links/link-ref";

/**
 * hero_search — search-first hero ("Find the right talent…").
 *
 * Reusable/theme-neutral. Default search behavior is a real directory query
 * (native GET, no client JS). `ai-interpret` is schema-allowed but only
 * functions when the operator supplies a safe existing endpoint as the
 * search action — we never fake AI. Chips/stat support a manual path now;
 * roster-derived sources are documented follow-ons (manual is the safe
 * interim) except `tenant_talent_count`, which derives tenant-scoped from
 * the roster helper.
 */

const ctaSchema = z.object({
  label: z.string().min(1).max(60),
  /** 6C — structured LinkRef; legacy string auto-coerced. */
  href: linkRefOrLegacy,
});

const chipSchema = z.object({
  label: z.string().min(1).max(60),
  /** 6C — structured LinkRef; legacy string auto-coerced. */
  href: optionalLinkRefOrLegacy,
});

const statItemSchema = z.object({
  value: z.string().min(1).max(24),
  label: z.string().min(1).max(60),
});

export const heroSearchSchemaV1 = z.object({
  eyebrow: z.string().max(60).optional(),
  headline: z.string().max(200).optional(),
  /** Highlighted phrase appended/emphasised within the headline. */
  highlight: z.string().max(120).optional(),
  subheadline: z.string().max(320).optional(),

  search: z
    .object({
      enabled: z.boolean().default(true),
      mode: z
        .enum(["directory-query", "ai-interpret", "visual-only"])
        .default("directory-query"),
      placeholder: z.string().max(120).optional(),
      /** Form action route. Defaults to the existing directory route. */
      actionHref: z.string().max(500).optional(),
      submitLabel: z.string().max(40).optional(),
    })
    .optional(),

  primaryCta: ctaSchema.optional(),
  secondaryCta: ctaSchema.optional(),

  chipsSource: z
    .enum(["manual", "service_areas", "roster_cities"])
    .default("manual"),
  chips: z.array(chipSchema).max(12).optional(),

  statSource: z.enum(["manual", "tenant_talent_count"]).default("manual"),
  statItems: z.array(statItemSchema).max(4).optional(),
  /** Label paired with the derived count when statSource = tenant_talent_count. */
  statCountLabel: z.string().max(80).optional(),

  layout: z
    .enum(["centered", "split", "minimal", "editorial"])
    .default("centered"),

  nodePresentation: z
    .object({
      subheadline: nodePresentationSchema,
      headline: nodePresentationSchema,
      copy: nodePresentationSchema,
      primaryCta: nodePresentationSchema,
      secondaryCta: nodePresentationSchema,
    })
    .optional(),
  presentation: sectionPresentationSchema,
});

export type HeroSearchV1 = z.infer<typeof heroSearchSchemaV1>;

export const heroSearchSchemasByVersion = {
  1: heroSearchSchemaV1,
} as const;
