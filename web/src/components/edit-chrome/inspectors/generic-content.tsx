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
      <p className="text-xs text-stone-500">
        No editor registered for section type{" "}
        <code className="rounded bg-stone-100 px-1 py-0.5 text-[11px]">
          {sectionTypeKey}
        </code>
        .
      </p>
    );
  }
  const Editor = entry.Editor;
  return (
    <div className="text-sm [&_[data-presentation-panel]]:hidden">
      {/*
        The registry Editor carries a collapsed Presentation panel for the
        composer route (PresentationPanel, marked data-presentation-panel).
        We hide ONLY that panel in the inspector (Layout + Style tabs are
        canonical) — NOT every <details>, so editors are free to use
        <details> for their own content rows without vanishing here.
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
