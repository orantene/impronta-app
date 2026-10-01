import type { BuilderTaskPickerNode } from "./types";

/** Max authored tasks (the grid is 1, 2 or 3 columns by container width). */
export const TASK_PICKER_TASKS_MAX = 12;

export type TaskPickerTask = NonNullable<BuilderTaskPickerNode["props"]["tasks"]>[number];

/** Default props for a freshly inserted `task_picker` block. */
export const TASK_PICKER_DEFAULT_PROPS: BuilderTaskPickerNode["props"] = {
  eyebrow: "",
  title: "",
  // Tasks without a target service stay hidden until one is picked, so a new
  // block never shows a button that recommends nothing.
  tasks: [
    { id: "t1", label: "Something is not working", labelEs: "Algo no funciona", icon: "sparkle", offeringId: "", hint: "", hintEs: "" },
    { id: "t2", label: "I need something installed", labelEs: "Necesito una instalación", icon: "check", offeringId: "", hint: "", hintEs: "" },
    { id: "t3", label: "I want to plan a visit", labelEs: "Quiero agendar una visita", icon: "calendar", offeringId: "", hint: "", hintEs: "" },
  ],
  defaultOfferingId: "",
  defaultKicker: "",
  defaultKickerEs: "",
  defaultHint: "",
  defaultHintEs: "",
  useWebsiteTheme: true,
};

/** Fresh props for create / kit stamps (rows cloned). */
export function cloneTaskPickerDefaultProps(): BuilderTaskPickerNode["props"] {
  return {
    ...TASK_PICKER_DEFAULT_PROPS,
    tasks: (TASK_PICKER_DEFAULT_PROPS.tasks ?? []).map((t) => ({ ...t })),
  };
}
