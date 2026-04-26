"use client";

import { PresentationPanel } from "../shared/PresentationPanel";
import { VariantPicker } from "../shared/VariantPicker";
import type { SectionEditorProps } from "../types";
import type { ContactFormV1, ContactFormField } from "./schema";

const FIELD = "flex flex-col gap-1.5 text-sm";
const LABEL = "text-xs font-medium uppercase tracking-wide text-muted-foreground";
const INPUT = "w-full rounded-md border border-border/60 bg-background px-2 py-1.5 text-sm";

export function ContactFormEditor({ initial, onChange }: SectionEditorProps<ContactFormV1>) {
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
    presentation: initial.presentation,
  };
  const patch = (p: Partial<ContactFormV1>) => onChange({ ...value, ...p });
  const patchField = (i: number, p: Partial<ContactFormField>) =>
    patch({ fields: value.fields.map((f, j) => (j === i ? { ...f, ...p } : f)) });

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className={FIELD}>
          <span className={LABEL}>Eyebrow</span>
          <input className={INPUT} maxLength={60} value={value.eyebrow ?? ""} onChange={(e) => patch({ eyebrow: e.target.value })} />
        </label>
        <label className={FIELD}>
          <span className={LABEL}>Headline</span>
          <input className={INPUT} maxLength={200} value={value.headline ?? ""} onChange={(e) => patch({ headline: e.target.value })} />
        </label>
      </div>
      <label className={FIELD}>
        <span className={LABEL}>Intro</span>
        <textarea className={INPUT} rows={2} maxLength={400} value={value.intro ?? ""} onChange={(e) => patch({ intro: e.target.value })} />
      </label>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className={FIELD}>
          <span className={LABEL}>Form action URL</span>
          <input className={INPUT} placeholder="https://formspree.io/f/… or mailto:…" value={value.action} onChange={(e) => patch({ action: e.target.value })} />
        </label>
        <label className={FIELD}>
          <span className={LABEL}>Method</span>
          <select className={INPUT} value={value.method} onChange={(e) => patch({ method: e.target.value as ContactFormV1["method"] })}>
            <option value="POST">POST</option>
            <option value="GET">GET</option>
          </select>
        </label>
        <label className={FIELD}>
          <span className={LABEL}>Submit label</span>
          <input className={INPUT} maxLength={60} value={value.submitLabel} onChange={(e) => patch({ submitLabel: e.target.value })} />
        </label>
        <label className={FIELD}>
          <span className={LABEL}>Honeypot field name</span>
          <input className={INPUT} maxLength={60} value={value.honeypot} onChange={(e) => patch({ honeypot: e.target.value })} />
        </label>
      </div>

      <VariantPicker
        name="form.variant"
        legend="Variant"
        sectionKey="contact_form"
        options={[
          { value: "card", label: "Card", hint: "Card with shadow.", schematic: "row" },
          { value: "inline", label: "Inline", hint: "Side-by-side fields.", schematic: "row" },
          { value: "minimal", label: "Minimal", hint: "Underline-only inputs.", schematic: "row" },
        ]}
        value={value.variant}
        onChange={(next) => patch({ variant: next })}
      />

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className={LABEL}>Fields ({value.fields.length} / 15)</span>
          <button
            type="button"
            disabled={value.fields.length >= 15}
            onClick={() => patch({ fields: [...value.fields, { name: `field${value.fields.length + 1}`, label: "New field", type: "text", required: false }] })}
            className="rounded-md border border-border/60 px-2 py-1 text-xs disabled:opacity-50"
          >
            + Add field
          </button>
        </div>
        {value.fields.map((f, i) => (
          <div key={i} className="flex flex-col gap-2 rounded-md border border-border/60 bg-muted/30 p-3">
            <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
              <input className={INPUT} placeholder="name" value={f.name} onChange={(e) => patchField(i, { name: e.target.value })} />
              <input className={INPUT} placeholder="Label" value={f.label} onChange={(e) => patchField(i, { label: e.target.value })} />
              <select className={INPUT} value={f.type} onChange={(e) => patchField(i, { type: e.target.value as ContactFormField["type"] })}>
                <option value="text">Text</option>
                <option value="email">Email</option>
                <option value="tel">Phone</option>
                <option value="textarea">Textarea</option>
                <option value="select">Select</option>
              </select>
            </div>
            <input className={INPUT} placeholder="Placeholder (optional)" value={f.placeholder ?? ""} onChange={(e) => patchField(i, { placeholder: e.target.value || undefined })} />
            {f.type === "select" ? (
              <textarea className={INPUT} rows={3} placeholder="Options (one per line)" value={f.options ?? ""} onChange={(e) => patchField(i, { options: e.target.value })} />
            ) : null}
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={f.required} onChange={(e) => patchField(i, { required: e.target.checked })} />
                <span>Required</span>
              </label>
              <button
                type="button"
                disabled={value.fields.length <= 1}
                onClick={() => patch({ fields: value.fields.filter((_, j) => j !== i) })}
                className="rounded-md border border-border/60 px-2 py-1 text-xs disabled:opacity-30"
              >
                × Remove
              </button>
            </div>
          </div>
        ))}
      </div>

      <PresentationPanel value={value.presentation} onChange={(next) => patch({ presentation: next })} />
    </div>
  );
}
