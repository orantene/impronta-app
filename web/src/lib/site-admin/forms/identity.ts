/**
 * Phase 5 / M1 — agency_business_identity Zod schema.
 *
 * Validates the full editable surface of the identity row as submitted from
 * the admin UI or any server-to-server caller. Mirrors the DB CHECK
 * constraints in migration 20260620110000_saas_p5_m1_identity_extensions.sql
 * + the M0 public_name nonempty CHECK.
 *
 * Field groups:
 *   identity       — public_name / legal_name / tagline / footer_tagline
 *   localization   — default_locale + supported_locales (PLATFORM_LOCALES subset)
 *   contact        — contact_email / contact_phone / whatsapp
 *   address        — address_city / address_country / service_area
 *   social         — social_{instagram,tiktok,facebook,linkedin,youtube,x}
 *   siteDefaults   — seoDefaultTitle / seoDefaultDescription /
 *                    seoDefaultShareImageMediaAssetId /
 *                    primaryCta{Label,Href}
 *
 * Concurrency: `expectedVersion` carried with every upsert (server action
 * compares + increments). Not persisted; purely request-shaped.
 */

import { z } from "zod";
import { pgUuidSchema } from "../validators";

import { localeSchema, supportedLocalesSchema } from "../locales";

// ---- shared primitives ----------------------------------------------------

/** Trims + rejects empty. Most text fields accept optional-trimmed-nonempty. */
const trimmedRequired = (label: string, max = 240) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .max(max, `${label} must be ${max} characters or fewer`);

const trimmedOptional = (max = 240) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional();

const emailOptional = z
  .union([z.literal(""), z.string().trim().email()])
  .transform((v) => (v === "" ? null : v ?? null))
  .nullable()
  .optional();

/** Accepts absolute URLs + root-relative paths. Rejects anything else. */
const hrefOptional = z
  .union([
    z.literal(""),
    z
      .string()
      .trim()
      .max(2048)
      .refine(
        (v) =>
          v.startsWith("/") ||
          /^https?:\/\//i.test(v) ||
          v.startsWith("mailto:") ||
          v.startsWith("tel:"),
        "Must be a URL (https://…), a root-relative path (/…), mailto:, or tel:",
      ),
  ])
  .transform((v) => (v === "" ? null : v ?? null))
  .nullable()
  .optional();

const uuidOptional = z
  .union([z.literal(""), pgUuidSchema()])
  .transform((v) => (v === "" ? null : v ?? null))
  .nullable()
  .optional();

// ---- identity form schema -------------------------------------------------

export const identityFormSchema = z
  .object({
    // Identity ---------------------------------------------------------------
    publicName: trimmedRequired("Public name", 120),
    legalName: trimmedOptional(200),
    tagline: trimmedOptional(200),
    footerTagline: trimmedOptional(200),

    // Localization -----------------------------------------------------------
    defaultLocale: localeSchema,
    supportedLocales: supportedLocalesSchema,

    // Contact ----------------------------------------------------------------
    contactEmail: emailOptional,
    contactPhone: trimmedOptional(40),
    whatsapp: trimmedOptional(40),

    // Address / service area -------------------------------------------------
    addressCity: trimmedOptional(120),
    addressCountry: trimmedOptional(120),
    serviceArea: trimmedOptional(200),

    // Social handles ---------------------------------------------------------
    socialInstagram: trimmedOptional(120),
    socialTiktok: trimmedOptional(120),
    socialFacebook: trimmedOptional(120),
    socialLinkedin: trimmedOptional(120),
    socialYoutube: trimmedOptional(120),
    socialX: trimmedOptional(120),

    // Site defaults (SEO + primary CTA) --------------------------------------
    seoDefaultTitle: trimmedOptional(120),
    seoDefaultDescription: trimmedOptional(320),
    seoDefaultShareImageMediaAssetId: uuidOptional,
    primaryCtaLabel: trimmedOptional(60),
    primaryCtaHref: hrefOptional,

    // Concurrency ------------------------------------------------------------
    expectedVersion: z.number().int().min(0),
  })
  .superRefine((value, ctx) => {
    if (!value.supportedLocales.includes(value.defaultLocale)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["defaultLocale"],
        message: "Default locale must be one of the supported locales",
      });
    }

    const hasLabel = value.primaryCtaLabel != null && value.primaryCtaLabel !== "";
    const hasHref = value.primaryCtaHref != null && value.primaryCtaHref !== "";
    if (hasLabel !== hasHref) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: hasLabel ? ["primaryCtaHref"] : ["primaryCtaLabel"],
        message:
          "Primary CTA label and URL must both be set, or both left blank",
      });
    }
  });

export type IdentityFormInput = z.input<typeof identityFormSchema>;
export type IdentityFormValues = z.output<typeof identityFormSchema>;
