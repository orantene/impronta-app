"use client";

import { useMemo, useState } from "react";

import type { BuilderComponentVariant } from "@/lib/site-admin/builder-node/types";
import { readInstanceVariant } from "@/lib/site-admin/builder-node/component-instances";
import { useEditContext } from "../edit-context";
import { useBuilderTree } from "../builder-tree-bridge";
import { listComponentVariants } from "../builder-component-variants";
import { CHROME } from "../kit/tokens";

interface InstanceVariantPickerProps {
  instanceNodeId: string;
  componentId: string;
}

export function InstanceVariantPicker({
  instanceNodeId,
  componentId,
}: InstanceVariantPickerProps) {
  const { applyInstanceVariant, clearInstanceVariant } = useEditContext();
  // WS2 — tree VALUE from the micro-store (builder-tree-bridge).
  const builderTree = useBuilderTree();
  const [busy, setBusy] = useState(false);

  const variants = useMemo(
    () => listComponentVariants(componentId),
    [componentId],
  );

  const activeVariantId = useMemo(() => {
    const walk = (nodes: typeof builderTree): string | null => {
      for (const node of nodes) {
        if (node.id === instanceNodeId) {
          return readInstanceVariant(node);
        }
        if ("children" in node && Array.isArray(node.children)) {
          const found = walk(node.children as typeof builderTree);
          if (found) return found;
        }
      }
      return null;
    };
    return walk(builderTree);
  }, [builderTree, instanceNodeId]);

  if (variants.length === 0) return null;

  async function onSelect(variant: BuilderComponentVariant) {
    setBusy(true);
    await applyInstanceVariant(instanceNodeId, JSON.stringify(variant));
    setBusy(false);
  }

  return (
    <div
      className="flex flex-col gap-1.5 rounded-lg px-2.5 py-2"
      data-builder-node-variant-picker=""
      style={{
        background: CHROME.surface,
        border: `1px solid ${CHROME.line}`,
      }}
    >
      <span
        className="text-[10.5px] font-semibold"
        style={{ color: CHROME.muted }}
      >
        Component variant
      </span>
      <div className="flex flex-wrap gap-1">
        {variants.map((variant) => {
          const active = variant.id === activeVariantId;
          return (
            <button
              key={variant.id}
              type="button"
              disabled={busy}
              aria-pressed={active}
              onClick={() => void onSelect(variant)}
              className="cursor-pointer rounded-md px-2 py-1 text-[10.5px] font-semibold"
              style={{
                border: `1px solid ${active ? CHROME.accent : CHROME.lineMid}`,
                background: active ? "rgba(124,58,237,0.12)" : CHROME.surface,
                color: active ? CHROME.accentInk : CHROME.text,
                opacity: busy ? 0.6 : 1,
              }}
            >
              {variant.name}
            </button>
          );
        })}
        {activeVariantId ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void clearInstanceVariant(instanceNodeId)}
            className="cursor-pointer rounded-md px-2 py-1 text-[10.5px] font-medium"
            style={{
              border: `1px dashed ${CHROME.lineMid}`,
              background: "transparent",
              color: CHROME.muted,
            }}
          >
            Clear tag
          </button>
        ) : null}
      </div>
    </div>
  );
}
