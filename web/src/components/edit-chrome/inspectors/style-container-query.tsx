"use client";

import type { BuilderNodeStyle, BuilderNodeStyleValue } from "@/lib/site-admin/builder-node";
import { Segmented, type SegmentedOption } from "../kit/segmented";
import { CHROME } from "../kit/tokens";
import { INSPECTOR_FIELD_LABEL_CLASS as FIELD_LABEL } from "./kit/inspector-ui";
import { useInspectorT } from "./kit/use-inspector-t";

const CONTAINER_TYPE_OPTIONS: ReadonlyArray<SegmentedOption<string>> = [
  { value: "", label: "Off" },
  { value: "inline-size", label: "Width" },
  { value: "size", label: "Size" },
];

/** Collapsible "Query container" control for container-like builder nodes. */
export function StyleContainerQuery({
  style,
  onPatch,
}: {
  style: BuilderNodeStyleValue | undefined;
  onPatch: (patch: Partial<BuilderNodeStyle>) => void;
}) {
  const { t } = useInspectorT();
  const type = style?.containerType;
  const active = CONTAINER_TYPE_OPTIONS.find((o) => o.value === (type ?? ""));
  const label = typeof active?.label === "string" ? active.label : "On";
  return (
    <details
      className="rounded-[10px] border px-2.5 py-1.5"
      data-builder-node-style-control="containerQueries"
      open={Boolean(type || style?.containerName)}
      style={{
        borderColor: CHROME.lineStrong,
        background: CHROME.surface,
        boxShadow: "0 1px 2px rgba(17,24,39,0.03)",
      }}
    >
      <summary
        className="flex cursor-pointer list-none items-center justify-between gap-2 py-1"
        style={{ outline: "none" }}
      >
        <span className={FIELD_LABEL}>{t("Query container")}</span>
        <span
          className="rounded-md px-1.5 py-0.5 text-[10px] font-semibold"
          style={{
            color: type ? CHROME.accent : CHROME.muted,
            background: type ? "rgba(124,58,237,0.08)" : "rgba(24,24,27,0.05)",
          }}
        >
          {type ? t(label) : t("Off")}
        </span>
      </summary>
      <div className="mt-2 flex flex-col gap-2">
        <Segmented
          fullWidth
          compact
          value={type ?? ""}
          onChange={(next) =>
            onPatch({
              containerType: (next || undefined) as BuilderNodeStyleValue["containerType"],
            })
          }
          options={CONTAINER_TYPE_OPTIONS}
        />
        <input
          type="text"
          className="px-2"
          style={{
            height: 30,
            width: "100%",
            fontSize: 12,
            background: CHROME.surface2,
            border: `1px solid ${CHROME.controlBorder}`,
            borderRadius: 7,
            color: CHROME.ink,
            outline: "none",
          }}
          placeholder={t("container name")}
          value={style?.containerName ?? ""}
          onChange={(e) => onPatch({ containerName: e.target.value.trim() || undefined })}
        />
      </div>
    </details>
  );
}
