import { z } from "zod";
import { sectionPresentationSchema } from "../shared/presentation";

const fieldSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(60)
    .regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/, "Use letters, digits, _ and - only"),
  label: z.string().min(1).max(80),
  type: z.enum(["text", "email", "tel", "textarea", "select"]).default("text"),
  required: z.boolean().default(false),
  placeholder: z.string().max(120).optional(),
  /** Newline-separated options for `select`. */
  options: z.string().max(2000).optional(),
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
  presentation: sectionPresentationSchema,
});

export type ContactFormV1 = z.infer<typeof contactFormSchemaV1>;
export type ContactFormField = z.infer<typeof fieldSchema>;
export const contactFormSchemasByVersion = { 1: contactFormSchemaV1 } as const;
