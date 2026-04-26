"use client";
import { PresentationPanel } from "../shared/PresentationPanel";
import { ZodSchemaForm } from "../shared/ZodSchemaForm";
import { videoReelSchemaV1 } from "./schema";
import type { SectionEditorProps } from "../types";
import type { VideoReelV1 } from "./schema";

export function VideoReelEditor({ initial, onChange, tenantId }: SectionEditorProps<VideoReelV1>) {
  const value: VideoReelV1 = {
    eyebrow: initial.eyebrow ?? "",
    headline: initial.headline ?? "Watch the reel",
    videoUrl: initial.videoUrl ?? "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
    posterUrl: initial.posterUrl,
    chapters: initial.chapters ?? [
      { time: 0, label: "Open" },
      { time: 30, label: "Process" },
      { time: 90, label: "Day-of" },
    ],
    ratio: initial.ratio ?? "16/9",
    controls: initial.controls ?? true,
    loop: initial.loop ?? false,
    muted: initial.muted ?? false,
    autoplay: initial.autoplay ?? false,
    presentation: initial.presentation,
  };
  return (
    <div className="flex flex-col gap-4">
      <ZodSchemaForm schema={videoReelSchemaV1} value={value} onChange={(next) => onChange({ ...value, ...(next as Partial<VideoReelV1>) })} tenantId={tenantId} sectionTypeKey="video_reel" excludeKeys={["presentation"]} />
      <PresentationPanel value={value.presentation} onChange={(next) => onChange({ ...value, presentation: next })} />
    </div>
  );
}
