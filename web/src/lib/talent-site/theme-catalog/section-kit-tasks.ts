/**
 * Gridline task picker kit block (any design can place it): ONE slot-stamped
 * container holding the `task_picker` (W-11, "what is happening at home").
 *
 * Authored copy only. Tasks ship without a target service, and a task with no
 * service stays hidden until the talent picks one, so the default kit never
 * recommends anything a talent did not choose. Provenance mirrors the `tasks`
 * entry of `TALENT_KIT_SECTIONS`.
 */
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { cloneTaskPickerDefaultProps } from "@/lib/site-admin/builder-node/task-picker-defaults";
import type { MaxSiteTemplateIdFactory } from "../max-site-templates/types";

const TASKS = { slotKey: "tasks", originRole: "talent.tasks" } as const;

export function taskPickerBlock(
  makeId: MaxSiteTemplateIdFactory,
  opts: { eyebrow?: string; title?: string } = {},
): BuilderNode {
  return {
    id: makeId(),
    kind: "container",
    props: {
      layout: "stack",
      gap: "m",
      align: "stretch",
      layerLabel: "Task picker",
      style: { maxWidth: "wide", paddingY: "l", paddingX: "m" },
      ...TASKS,
      anchorId: "task-picker",
    },
    children: [
      {
        id: makeId(),
        kind: "task_picker",
        props: {
          ...cloneTaskPickerDefaultProps(),
          ...(opts.eyebrow !== undefined ? { eyebrow: opts.eyebrow } : {}),
          ...(opts.title !== undefined ? { title: opts.title } : {}),
        },
      },
    ],
  } as BuilderNode;
}
