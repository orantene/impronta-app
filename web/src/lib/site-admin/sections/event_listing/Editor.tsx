"use client";
import { PresentationPanel } from "../shared/PresentationPanel";
import { ZodSchemaForm } from "../shared/ZodSchemaForm";
import { eventListingSchemaV1 } from "./schema";
import type { SectionEditorProps } from "../types";
import type { EventListingV1 } from "./schema";

export function EventListingEditor({ initial, onChange, tenantId }: SectionEditorProps<EventListingV1>) {
  const value: EventListingV1 = {
    eyebrow: initial.eyebrow ?? "Calendar",
    headline: initial.headline ?? "Upcoming events.",
    events: initial.events ?? [
      { date: "Apr 28", time: "7pm", title: "Spring open studio", description: "Drinks and demos.", location: "Studio" },
      { date: "May 12", time: "2pm", title: "Bridal trial day", description: "By appointment.", location: "Studio", rsvpUrl: "/contact" },
      { date: "Jun 02", time: "All day", title: "Editorial workshop", description: "Half-day intensive for working artists.", location: "Studio", category: "Workshop", rsvpUrl: "/contact", rsvpLabel: "Register" },
    ],
    variant: initial.variant ?? "list",
    presentation: initial.presentation,
  };
  return (
    <div className="flex flex-col gap-4">
      <ZodSchemaForm schema={eventListingSchemaV1} value={value} onChange={(next) => onChange({ ...value, ...(next as Partial<EventListingV1>) })} tenantId={tenantId} sectionTypeKey="event_listing" excludeKeys={["presentation"]} />
      <PresentationPanel value={value.presentation} onChange={(next) => onChange({ ...value, presentation: next })} />
    </div>
  );
}
