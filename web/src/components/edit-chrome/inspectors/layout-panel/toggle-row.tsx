"use client";

import { Toggle } from "../../kit/toggle";
import { CHROME } from "../../kit/tokens";
import { useInspectorT } from "../kit/use-inspector-t";

/** Labelled switch row used across the node layout editors. */
export function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  const { t } = useInspectorT();
  return (
    <label
      className="flex cursor-pointer items-center justify-between gap-2 rounded-md px-2.5 py-2"
      style={{
        background: CHROME.paper,
        border: `1px solid ${CHROME.line}`,
      }}
    >
      <span className="flex flex-col">
        <span className="text-[11.5px] font-semibold text-stone-700">{t(label)}</span>
        <span className="text-[10.5px] text-stone-500">{t(hint)}</span>
      </span>
      <Toggle on={checked} onChange={onChange} />
    </label>
  );
}
