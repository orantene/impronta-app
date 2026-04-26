"use client";

/**
 * Phase 3 — auto-bound editor.
 */

import { PresentationPanel } from "../shared/PresentationPanel";
import { ZodSchemaForm } from "../shared/ZodSchemaForm";
import { contactFormSchemaV1 } from "./schema";
import type { SectionEditorProps } from "../types";
import type { ContactFormV1 } from "./schema";

export function ContactFormEditor({
  initial,
  onChange,
  tenantId,
}: SectionEditorProps<ContactFormV1>) {
  const value: ContactFormV1 = {
    eyebrow: initial.eyebrow ?? "",
    headline: initial.headline ?? "",
    intro: initial.intro ?? "",
    fields:
      initial.fields ??
      [
        { name: "name", label: "Name", type: "text", required: true, placeholder: "Your name" },
        { name: "email", label: "Email", type: "email", required: true, placeholder: "you@studio.com" },
        { name: "message", label: "Message", type: "textarea", required: true, placeholder: "Tell us about your project" },
      ],
    submitLabel: initial.submitLabel ?? "Send",
    action: initial.action ?? "https://formspree.io/f/your-id",
    method: initial.method ?? "POST",
    honeypot: initial.honeypot ?? "website",
    successMessage: initial.successMessage ?? "Thanks — we'll be in touch.",
    variant: initial.variant ?? "card",
    captcha: initial.captcha ?? "none",
    presentation: initial.presentation,
  };
  return (
    <div className="flex flex-col gap-4">
      <ZodSchemaForm
        schema={contactFormSchemaV1}
        value={value}
        onChange={(next) => onChange({ ...value, ...(next as Partial<ContactFormV1>) })}
        tenantId={tenantId}
        sectionTypeKey="contact_form" excludeKeys={["presentation"]}
      />
      <PresentationPanel
        value={value.presentation}
        onChange={(next) => onChange({ ...value, presentation: next })}
      />
    </div>
  );
}
