"use client";

/**
 * Phase 9 — auto-bound editor for booking_widget.
 */

import { PresentationPanel } from "../shared/PresentationPanel";
import { ZodSchemaForm } from "../shared/ZodSchemaForm";
import { bookingWidgetSchemaV1 } from "./schema";
import type { SectionEditorProps } from "../types";
import type { BookingWidgetV1 } from "./schema";

export function BookingWidgetEditor({
  initial,
  onChange,
  tenantId,
}: SectionEditorProps<BookingWidgetV1>) {
  const value: BookingWidgetV1 = {
    eyebrow: initial.eyebrow ?? "",
    headline: initial.headline ?? "",
    intro: initial.intro ?? "",
    url: initial.url ?? "https://calendly.com/your-handle/intro",
    variant: initial.variant ?? "inline",
    buttonLabel: initial.buttonLabel ?? "Book a call",
    ratio: initial.ratio ?? "4/3",
    minHeight: initial.minHeight,
    presentation: initial.presentation,
  };
  return (
    <div className="flex flex-col gap-4">
      <ZodSchemaForm
        schema={bookingWidgetSchemaV1}
        value={value}
        onChange={(next) => onChange({ ...value, ...(next as Partial<BookingWidgetV1>) })}
        tenantId={tenantId}
        sectionTypeKey="booking_widget"
        excludeKeys={["presentation"]}
      />
      <PresentationPanel
        value={value.presentation}
        onChange={(next) => onChange({ ...value, presentation: next })}
      />
    </div>
  );
}
