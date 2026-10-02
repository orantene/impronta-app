/**
 * Content inspector for the `task_picker` block: heading, the fallback card
 * (the inspection) and one editable row per task. Every prop the renderer
 * reads has a control here: label (EN/ES), icon, target service, hint (EN/ES).
 */
"use client";

import type { ReactNode } from "react";

import {
  TASK_PICKER_TASKS_MAX,
  type TaskPickerTask,
} from "@/lib/site-admin/builder-node/task-picker-defaults";
import type { BuilderTaskPickerNode } from "@/lib/site-admin/builder-node/types";
import type { TalentOffering } from "@/lib/talent/offerings-types";

import { KIT, InspectorLabelWithInfo } from "./kit";
import { IconPicker } from "./field-kit/icon-picker";
import { useServicesCatalogEligibleOfferings } from "./services-catalog-offerings-picker";

type CommitPatch = (patch: Record<string, unknown>) => void;

function Section({ title, info, children }: { title: string; info?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <h3 className={KIT.blockHeading}>{info ? <InspectorLabelWithInfo label={title} info={info} /> : title}</h3>
      {children}
    </section>
  );
}

function OfferingSelect({
  value,
  offerings,
  ariaLabel,
  onChange,
}: {
  value: string;
  offerings: TalentOffering[];
  ariaLabel: string;
  onChange: (id: string) => void;
}) {
  const known = offerings.some((o) => o.id === value);
  return (
    <select className={KIT.input} aria-label={ariaLabel} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Choose a service</option>
      {value && !known ? <option value={value}>Unavailable service (not published)</option> : null}
      {offerings.map((o) => (
        <option key={o.id} value={o.id}>
          {o.title}
        </option>
      ))}
    </select>
  );
}

/** Stable, render-pure id: the first `tN` not already used by a task. */
function nextTaskId(tasks: readonly TaskPickerTask[]): string {
  const used = new Set(tasks.map((t) => t.id));
  let n = tasks.length + 1;
  while (used.has(`t${n}`)) n += 1;
  return `t${n}`;
}

export function TaskPickerContentInspector({
  node,
  commitPatch,
}: {
  node: BuilderTaskPickerNode;
  commitPatch: CommitPatch;
}) {
  const p = node.props;
  const { eligible } = useServicesCatalogEligibleOfferings();
  const tasks: TaskPickerTask[] = (p.tasks ?? []).map((t) => ({ ...t }));
  const patchTasks = (next: TaskPickerTask[]) => commitPatch({ tasks: next.slice(0, TASK_PICKER_TASKS_MAX) });
  const setTask = (i: number, patch: Partial<TaskPickerTask>) =>
    patchTasks(tasks.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  const addTask = () =>
    patchTasks([...tasks, { id: nextTaskId(tasks), label: "", labelEs: "", offeringId: "", hint: "", hintEs: "" }]);

  const text = (label: string, value: string | undefined, key: string, placeholder?: string) => (
    <div className={KIT.field}>
      <label className={KIT.label}>{label}</label>
      <input
        className={KIT.input}
        value={value ?? ""}
        placeholder={placeholder}
        onChange={(e) => commitPatch({ [key]: e.target.value })}
      />
    </div>
  );

  return (
    <div className="flex flex-col gap-4" data-builder-node-content-panel="task_picker" data-task-picker-inspector="content">
      <Section
        title="Content"
        info="Visitors pick what is happening and get one service recommended, with its price, time and the right action."
      >
        {text("Eyebrow", p.eyebrow, "eyebrow", "Optional")}
        {text("Heading", p.title, "title", "Optional")}
      </Section>
      <Section
        title="Start here"
        info="Shown while no task is picked. Usually your inspection or first visit."
      >
        <div className={KIT.field}>
          <label className={KIT.label}>Start here service</label>
          <OfferingSelect
            ariaLabel="Start here service"
            value={p.defaultOfferingId ?? ""}
            offerings={eligible}
            onChange={(id) => commitPatch({ defaultOfferingId: id })}
          />
        </div>
        {text("Label", p.defaultKicker, "defaultKicker", "Start here")}
        {text("Label (Spanish)", p.defaultKickerEs, "defaultKickerEs", "Empieza aquí")}
        {text("Note", p.defaultHint, "defaultHint", "Optional")}
        {text("Note (Spanish)", p.defaultHintEs, "defaultHintEs", "Optional")}
      </Section>
      <Section
        title="Tasks"
        info="A task with no service chosen is not shown. Spanish text falls back to the English text when empty."
      >
        {tasks.map((t, i) => (
          <div key={t.id || i} className="flex flex-col gap-1.5 rounded-md border border-stone-200 p-2">
            <input
              className={KIT.input}
              aria-label="Task text"
              value={t.label}
              placeholder="Task (The power went out)"
              onChange={(e) => setTask(i, { label: e.target.value })}
            />
            <input
              className={KIT.input}
              aria-label="Task text (Spanish)"
              value={t.labelEs ?? ""}
              placeholder="Task in Spanish"
              onChange={(e) => setTask(i, { labelEs: e.target.value })}
            />
            <IconPicker
              label="Task icon"
              value={t.icon}
              allowNone
              searchTerms="icon glyph symbol"
              onChange={(icon) => setTask(i, { icon: icon ?? undefined })}
            />
            <OfferingSelect
              ariaLabel="Recommended service"
              value={t.offeringId ?? ""}
              offerings={eligible}
              onChange={(id) => setTask(i, { offeringId: id })}
            />
            <input
              className={KIT.input}
              aria-label="Task note"
              value={t.hint ?? ""}
              placeholder="Note shown with the recommendation"
              onChange={(e) => setTask(i, { hint: e.target.value })}
            />
            <input
              className={KIT.input}
              aria-label="Task note (Spanish)"
              value={t.hintEs ?? ""}
              placeholder="Note in Spanish"
              onChange={(e) => setTask(i, { hintEs: e.target.value })}
            />
            <button
              type="button"
              className="self-start text-[12px] text-stone-600 underline"
              onClick={() => patchTasks(tasks.filter((_, j) => j !== i))}
            >
              Remove task
            </button>
          </div>
        ))}
        {tasks.length < TASK_PICKER_TASKS_MAX ? (
          <button
            type="button"
            className="self-start rounded-md border border-stone-300 bg-white px-2.5 py-1.5 text-[12px] text-stone-700"
            onClick={addTask}
          >
            Add task
          </button>
        ) : null}
      </Section>
    </div>
  );
}
