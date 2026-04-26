"use client";
import { PresentationPanel } from "../shared/PresentationPanel";
import { ZodSchemaForm } from "../shared/ZodSchemaForm";
import { mapOverlaySchemaV1 } from "./schema";
import type { SectionEditorProps } from "../types";
import type { MapOverlayV1 } from "./schema";

export function MapOverlayEditor({ initial, onChange, tenantId }: SectionEditorProps<MapOverlayV1>) {
  const value: MapOverlayV1 = {
    eyebrow: initial.eyebrow ?? "",
    headline: initial.headline ?? "Visit us",
    mapEmbedUrl: initial.mapEmbedUrl ?? "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3024.123!2d-74.006!3d40.7128!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1",
    card: initial.card ?? {
      title: "Studio",
      address: "123 Example St, City, State",
      hours: "Wed-Sun · 10am - 6pm",
      body: "By appointment only.",
    },
    side: initial.side ?? "card-left",
    ratio: initial.ratio ?? "16/9",
    presentation: initial.presentation,
  };
  return (
    <div className="flex flex-col gap-4">
      <ZodSchemaForm schema={mapOverlaySchemaV1} value={value} onChange={(next) => onChange({ ...value, ...(next as Partial<MapOverlayV1>) })} tenantId={tenantId} sectionTypeKey="map_overlay" excludeKeys={["presentation"]} />
      <PresentationPanel value={value.presentation} onChange={(next) => onChange({ ...value, presentation: next })} />
    </div>
  );
}
