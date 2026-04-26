"use client";

import { PresentationPanel } from "../shared/PresentationPanel";
import { VariantPicker } from "../shared/VariantPicker";
import { LinkPicker } from "../shared/LinkPicker";
import { AltTextField } from "../shared/AltTextField";
import { MediaPicker } from "../shared/MediaPicker";
import type { SectionEditorProps } from "../types";
import type { TeamGridV1, TeamMember } from "./schema";

const FIELD = "flex flex-col gap-1.5 text-sm";
const LABEL = "text-xs font-medium uppercase tracking-wide text-muted-foreground";
const INPUT = "w-full rounded-md border border-border/60 bg-background px-2 py-1.5 text-sm";

export function TeamGridEditor({ initial, onChange, tenantId }: SectionEditorProps<TeamGridV1>) {
  const value: TeamGridV1 = {
    eyebrow: initial.eyebrow ?? "",
    headline: initial.headline ?? "",
    intro: initial.intro ?? "",
    members:
      initial.members ??
      [
        { name: "Alex Rivera", role: "Founder + creative director" },
        { name: "Maya Chen", role: "Head of production" },
        { name: "Jordan Park", role: "Lead photographer" },
      ],
    variant: initial.variant ?? "portrait",
    columnsDesktop: initial.columnsDesktop ?? 3,
    presentation: initial.presentation,
  };
  const patch = (p: Partial<TeamGridV1>) => onChange({ ...value, ...p });
  const patchM = (i: number, p: Partial<TeamMember>) =>
    patch({ members: value.members.map((m, j) => (j === i ? { ...m, ...p } : m)) });

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
        <VariantPicker
          name="team.variant"
          legend="Variant"
          sectionKey="team_grid"
          options={[
            { value: "portrait", label: "Portrait", hint: "4:5 portraits.", schematic: "grid" },
            { value: "circle", label: "Circle", hint: "Round headshots.", schematic: "row" },
            { value: "row", label: "Row", hint: "Image left, copy right.", schematic: "row" },
          ]}
          value={value.variant}
          onChange={(next) => patch({ variant: next })}
        />
        <label className={FIELD}>
          <span className={LABEL}>Desktop columns ({value.columnsDesktop})</span>
          <input
            type="range"
            min={2}
            max={6}
            value={value.columnsDesktop}
            onChange={(e) => patch({ columnsDesktop: Number(e.target.value) })}
          />
        </label>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className={LABEL}>Members ({value.members.length} / 40)</span>
          <button
            type="button"
            disabled={value.members.length >= 40}
            onClick={() => patch({ members: [...value.members, { name: "New member" }] })}
            className="rounded-md border border-border/60 px-2 py-1 text-xs disabled:opacity-50"
          >
            + Add
          </button>
        </div>
        {value.members.map((m, i) => (
          <div key={i} className="flex flex-col gap-2 rounded-md border border-border/60 bg-muted/30 p-3">
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              <input className={INPUT} placeholder="Name" value={m.name} onChange={(e) => patchM(i, { name: e.target.value })} />
              <input className={INPUT} placeholder="Role" value={m.role ?? ""} onChange={(e) => patchM(i, { role: e.target.value })} />
            </div>
            <textarea className={INPUT} rows={2} placeholder="Bio (optional)" value={m.bio ?? ""} onChange={(e) => patchM(i, { bio: e.target.value })} />
            <div className="flex items-center gap-2">
              <input className={`${INPUT} flex-1`} placeholder="Image URL" value={m.imageUrl ?? ""} onChange={(e) => patchM(i, { imageUrl: e.target.value || undefined })} />
              {tenantId ? <MediaPicker tenantId={tenantId} onPick={(url) => patchM(i, { imageUrl: url })} label="" /> : null}
            </div>
            <AltTextField imageUrl={m.imageUrl} value={m.imageAlt ?? ""} onChange={(next) => patchM(i, { imageAlt: next || undefined })} />
            <div className={FIELD}>
              <span className={LABEL}>Link (optional)</span>
              <LinkPicker value={m.href ?? ""} onChange={(next) => patchM(i, { href: next || undefined })} />
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                disabled={value.members.length <= 1}
                onClick={() => patch({ members: value.members.filter((_, j) => j !== i) })}
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
