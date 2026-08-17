import { z } from "zod";
import { isSafeFormAction } from "@/lib/saas/public-hrefs";
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
   *
   * FORMS-3: this is now ADVISORY ONLY on the internal lane. The renderer
   * emits `CONTACT_ATTACHMENT_ACCEPT` and the submit route enforces the
   * server-side allow-list in `attachments.ts` (PDF + JPEG/PNG/WebP/GIF,
   * verified by magic bytes), because an operator-editable `accept` string is
   * a UI hint a crafted POST simply ignores. Kept for backward compat with
   * saved sections and for any external (Formspree etc.) action.
   */
  fileAccept: z.string().max(200).optional(),
  /**
   * Maximum file size in megabytes. Only used when `type === "file"`.
   *
   * FORMS-3 — attachments ARE stored now. The old comment here ("no binary
   * upload on the Supabase free tier; the submit route stores a URL/metadata
   * record") described the bug, not a constraint: the visitor's file rode the
   * POST and was thrown away. Files on the internal lane now land in the
   * private `form-attachments` bucket, written server-side with the service
   * role after honeypot + rate-limit + captcha.
   *
   * The operative ceiling is NOT this 10 MB bound. `effectiveAttachmentMaxBytes`
   * clamps to CONTACT_ATTACHMENT_MAX_BYTES (3 MB) because the whole submission
   * has to fit inside the platform's 4.5 MB request-body cap. An operator can
   * tighten below that; they cannot raise above it, and the renderer shows the
   * clamped number so the form never promises a size it will reject.
   */
  fileMaxSizeMb: z.number().min(0.1).max(10).default(5).optional(),
});

export const contactFormSchemaV1 = z.object({
  eyebrow: z.string().max(60).optional(),
  headline: z.string().max(200).optional(),
  intro: z.string().max(400).optional(),
  fields: z.array(fieldSchema).min(1).max(15),
  submitLabel: z.string().min(1).max(60).default("Send"),
  /**
   * Form action URL — Formspree, Netlify, custom API, mailto:, or the
   * `internal` / `internal:auto` sentinel that routes to Tulala's own
   * /api/cms/forms/submit.
   *
   * SECURITY: refined against the shared navigational-scheme allowlist. This
   * value renders as `<form action>` on the PUBLIC published page, and a form
   * action navigates on submit exactly like an href navigates on click — so
   * `javascript:`/`data:`/`vbscript:` here is visitor-executed XSS on the
   * shared *.tulala.digital apex (parent-scoped cookies = cross-tenant
   * exposure). This refinement blocks the write; `neutralizeFormAction`
   * blocks the render for anything already persisted.
   */
  action: z
    .string()
    .min(1)
    .max(500)
    .refine(isSafeFormAction, {
      message:
        "Use an https:// or relative form action (mailto:, tel: and sms: are also allowed).",
    }),
  method: z.enum(["POST", "GET"]).default("POST"),
  /** Honeypot field name (hidden, must stay empty to submit). */
  honeypot: z.string().max(60).default("website"),
  successMessage: z.string().max(200).default("Thanks, we'll be in touch."),
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
  /**
   * FORMS-2 — routing mode for the submit endpoint.
   *
   *   - "internal" (default): the submission is recorded as a generic
   *     cms_form_submissions row (the existing inbox behavior).
   *   - "inquiry": the submission is funneled into the SHARED inquiry
   *     engine (createInquiryFromIntent) — the same front door the talent
   *     profile uses — creating a real public.inquiries row in the
   *     workspace pipeline instead of an inbox row.
   *
   * BACKWARD COMPAT: optional; an absent routingMode is treated as
   * "internal" everywhere (the submit route only diverges on the explicit
   * "inquiry" value), so any existing saved section behaves exactly as before.
   */
  routingMode: z.enum(["internal", "inquiry"]).optional(),
  /**
   * FORMS-2 — target talent for inquiry routing. Only used when
   * `routingMode === "inquiry"`. The submitted inquiry is attributed to
   * this talent (the form becomes a booking front door for them, e.g. a
   * Max talent-site contact form). Optional: an inquiry-mode form with no
   * target creates a talent-less "message the agency" inquiry. The submit
   * route ALWAYS resolves the tenant from the trusted section.tenant_id —
   * never from client payload — so this is the only client-influenced
   * routing input and it is roster-validated server-side before use.
   */
  inquiryTargetTalentId: z.string().uuid().optional(),
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
