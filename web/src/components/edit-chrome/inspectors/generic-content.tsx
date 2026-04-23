"use client";

/**
 * GenericContent — fallback inspector using the registry Editor form.
 *
 * Consulted when no curated canvas-native inspector exists yet for a section
 * type. The registry Editor is authored for the composer route; we reuse it
 * here so every section is editable day-one.
 *
 * Preservation rule: presentation lives on Layout/Style tabs as the source
 * of truth. On each Editor onChange we drop presentation from the Editor's
 * output and merge only the non-presentation fields onto the current draft.
 * This keeps Layout/Style changes from being overwritten by a later
 * keystroke in Content.
 */

import { SECTION_EDITOR_REGISTRY } from "@/lib/site-admin/sections/registry-editors";

interface GenericContentProps {
  sectionTypeKey: string;
  schemaVersion: number;
  tenantId: string;
  draftProps: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}

export function GenericContent({
  sectionTypeKey,
  tenantId,
  draftProps,
  onChange,
}: GenericContentProps) {
  const entry = SECTION_EDITOR_REGISTRY[sectionTypeKey];
  if (!entry) {
    return (
      <p className="text-xs text-zinc-500">
        No editor registered for section type{" "}
        <code className="rounded bg-zinc-100 px-1 py-0.5 text-[11px]">
          {sectionTypeKey}
        </code>
        .
      </p>
    );
  }
  const Editor = entry.Editor;
  return (
    <div className="text-sm [&_details]:hidden">
      {/*
        The registry Editor carries a collapsed <details>Presentation</details>
        panel for the composer route. We hide it in the inspector (Layout +
        Style tabs are canonical) via the utility selector above so the
        generic fallback stays tidy without editing every per-type form.
      */}
      <Editor
        initial={draftProps as never}
        onChange={(next) => {
          const rest = { ...(next as Record<string, unknown>) };
          delete rest.presentation;
          onChange({ ...draftProps, ...rest });
        }}
        tenantId={tenantId}
      />
    </div>
  );
}
