import { z } from "zod";
import { nodePresentationSchema } from "../shared/node-presentation";
import { sectionPresentationSchema } from "../shared/presentation";

/**
 * FORMS-1 — rich field types + consent.
 *
 * The `type` enum gains: date, file, checkbox, number.
 * A dedicated `consent` type carries a `consentText` label (legal/GDPR consent).
 * Per-field validation bounds:
 *   - number: `numberMin` / `numberMax`
 *   - file:   `fileAccept` (MIME type list, e.g. "image/*,.pdf") / `fileMaxSizeMb`
 *
 * BACKWARD COMPAT: all new fields are optional with safe defaults; any existing
 * saved schema that only uses text/email/tel/textarea/select validates unchanged.
 */
const fieldSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(60)
    .regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/, "Use letters, digits, _ and - only"),
  label: z.string().min(1).max(80),
  type: z
    .enum([
      // Original types (backward-compat)
      "text",
      "email",
      "tel",
      "textarea",
      "select",
      // FORMS-1 new types
      "date",
      "file",
      "checkbox",
      "number",
      // FORMS-1 consent — boolean checkbox with a required consentText
      "consent",
    ])
    .default("text"),
  required: z.boolean().default(false),
  placeholder: z.string().max(120).optional(),
  /** Newline-separated options for `select`. */
  options: z.string().max(2000).optional(),
  // ── FORMS-1 additions ────────────────────────────────────────────────────────
  /**
   * Consent/legal copy rendered beside the consent checkbox.
   * Only used when `type === "consent"`.
   */
  consentText: z.string().max(500).optional(),
  /**
   * Minimum numeric value. Only used when `type === "number"`.
   */
  numberMin: z.number().optional(),
  /**
   * Maximum numeric value. Only used when `type === "number"`.
   */
  numberMax: z.number().optional(),
  /**
   * Accepted MIME types / extensions for file inputs (comma-separated,
   * e.g. "image/*,.pdf"). Only used when `type === "file"`.
   * Defaults to a safe allowlist when absent.
   */
  fileAccept: z.string().max(200).optional(),
  /**
   * Maximum file size in megabytes. Only used when `type === "file"`.
   * Enforced client-side (size guard before submit) — no binary upload
   * on the Supabase free tier; the submit route stores a URL/metadata record.
   * Hard-capped server-side at FILE_MAX_SIZE_MB_HARD_CAP (10 MB).
   */
  fileMaxSizeMb: z.number().min(0.1).max(10).default(5).optional(),
});

export const contactFormSchemaV1 = z.object({
  eyebrow: z.string().max(60).optional(),
  headline: z.string().max(200).optional(),
  intro: z.string().max(400).optional(),
  fields: z.array(fieldSchema).min(1).max(15),
  submitLabel: z.string().min(1).max(60).default("Send"),
  /** Form action URL — Formspree, Netlify, custom API, mailto:. */
  action: z.string().min(1).max(500),
  method: z.enum(["POST", "GET"]).default("POST"),
  /** Honeypot field name (hidden, must stay empty to submit). */
  honeypot: z.string().max(60).default("website"),
  successMessage: z.string().max(200).default("Thanks — we'll be in touch."),
  variant: z.enum(["card", "inline", "minimal"]).default("card"),
  /**
   * Optional captcha provider. When set, the form renders the matching
   * widget and the /api/cms/forms/submit endpoint validates the token
   * server-side. Site-key + secret come from env vars (operator sets
   * them once per deployment), not per-section.
   *   - hcaptcha: NEXT_PUBLIC_HCAPTCHA_SITE_KEY + HCAPTCHA_SECRET
   *   - turnstile: NEXT_PUBLIC_TURNSTILE_SITE_KEY + TURNSTILE_SECRET
   */
  captcha: z.enum(["none", "hcaptcha", "turnstile"]).default("none"),
  /** Phase 4 — BuilderNode child-style overrides for heading + submit button. */
  nodePresentation: z
    .object({
      subheadline: nodePresentationSchema,
      headline: nodePresentationSchema,
      copy: nodePresentationSchema,
      primaryCta: nodePresentationSchema,
    })
    .optional(),
  presentation: sectionPresentationSchema,
});

export type ContactFormV1 = z.infer<typeof contactFormSchemaV1>;
export type ContactFormField = z.infer<typeof fieldSchema>;
export const contactFormSchemasByVersion = { 1: contactFormSchemaV1 } as const;
