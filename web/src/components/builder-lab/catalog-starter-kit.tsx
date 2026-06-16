"use client";

/**
 * SiteStarterKitView (Catalog) — the full-page starter designs, extracted from
 * component-catalog.tsx to keep that controller under the max-lines cap. The
 * shared SurfaceSwitcher shows one kit at a time (Agency / Talent), matching
 * Site Defaults; "both"-target designs appear in both. "Use this starter"
 * creates a Playground draft seeded with the chosen design's baked tree
 * (server-side) and opens the editor on it.
 */

import { useCallback, useState } from "react";

import { createPlaygroundDraftFromDesign } from "@/lib/site-admin/builder-core/lab/create-draft-from-design";
import {
  PAGE_DESIGN_SUMMARIES,
  type PageDesignSummary,
} from "@/lib/site-admin/builder-node/page-designs/summaries";
import { SurfaceSwitcher } from "./surface-switcher";
import type { BuilderLabTarget } from "./builder-lab-stage";
import { LAB as T, panelStyle, LabButton, LabBadge, EmptyCard } from "./ui";

const STARTER_KIT_GROUPS = [
  {
    key: "workspace" as const,
    label: "Agency Starter Kit",
    blurb: "Full-page starts for an agency / workspace storefront.",
  },
  {
    key: "talent" as const,
    label: "Talent Starter Kit",
    blurb: "Full-page starts for a single talent's Max page.",
  },
];

/** A design belongs to a surface group when it targets that surface or "both". */
function designsForSurface(
  surface: "talent" | "workspace",
): PageDesignSummary[] {
  return PAGE_DESIGN_SUMMARIES.filter(
    (d) => d.target === surface || d.target === "both",
  );
}

export function SiteStarterKitView({
  onLaunchEditor,
}: {
  onLaunchEditor?: (target: BuilderLabTarget, draftId?: string) => void;
}) {
  const [surface, setSurface] = useState<"talent" | "workspace">("workspace");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const startFromDesign = useCallback(
    async (design: PageDesignSummary) => {
      setBusyId(design.id);
      setError(null);
      const res = await createPlaygroundDraftFromDesign({
        designId: design.id,
        target: surface,
      });
      setBusyId(null);
      if (res.ok) {
        onLaunchEditor?.(surface, res.draftId);
      } else {
        setError(res.error);
      }
    },
    [onLaunchEditor, surface],
  );

  const group = STARTER_KIT_GROUPS.find((g) => g.key === surface);
  const designs = designsForSurface(surface);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <SurfaceSwitcher
        options={STARTER_KIT_GROUPS}
        value={surface}
        onChange={setSurface}
        ariaLabel="Starter kit surface"
      />
      {group ? (
        <div style={{ fontSize: 12, color: T.inkMuted }}>{group.blurb}</div>
      ) : null}
      {error ? <div style={{ fontSize: 12, color: T.red }}>{error}</div> : null}
      {designs.length === 0 ? (
        <EmptyCard>
          No starter designs target this surface yet.
        </EmptyCard>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
            gap: 12,
          }}
        >
          {designs.map((d) => (
            <StarterKitCard
              key={d.id}
              design={d}
              busy={busyId === d.id}
              onUse={() => void startFromDesign(d)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function StarterKitCard({
  design,
  busy,
  onUse,
}: {
  design: PageDesignSummary;
  busy?: boolean;
  onUse: () => void;
}) {
  return (
    <div
      style={{
        ...panelStyle,
        padding: 14,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span style={{ fontSize: 13.5, fontWeight: 700, color: T.ink }}>{design.label}</span>
        <LabBadge tone="muted">{design.archetype}</LabBadge>
      </div>
      <p style={{ fontSize: 11.5, color: T.inkMuted, lineHeight: 1.5, margin: 0, flex: 1 }}>
        {design.description}
      </p>
      <LabButton
        variant="soft"
        disabled={busy}
        onClick={onUse}
        style={{ alignSelf: "flex-start" }}
      >
        {busy ? "Creating…" : "Use this starter →"}
      </LabButton>
    </div>
  );
}
