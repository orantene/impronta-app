"use client";

/**
 * TasksTray (D23): the "+ N other tasks" popover opened from `NextStepBar` /
 * `NextStepBlock` (`onMoreTasks`, kit/NextStep.tsx). Lists S4's
 * `DerivedTask[]` as-is (owner decision 7: tasks are derived from state, no
 * free-text tasks in v1) with the primary one marked; each row dispatches its
 * `key` through `onPick` and the shell maps it to a real action.
 */

import { Icon, Pill } from "../kit/primitives";
import { EmptyState } from "../kit/Skeleton";
import type { TasksTrayProps } from "./contracts";

export function TasksTray({ tasks, open, onClose, onPick, copy, variant }: TasksTrayProps) {
  if (!open) return null;
  const c = copy.tasks;

  const list =
    tasks.length === 0 ? (
      <EmptyState icon="check" title={c.empty} variant={variant} small />
    ) : (
      <div className={variant === "mobile" ? "mx-act-list" : "list"} role="menu" data-tasks-list>
        {tasks.map((task) => (
          <button
            key={task.key}
            type="button"
            role="menuitem"
            className={variant === "mobile" ? `mx-act${task.primary ? " on" : ""}` : `ti${task.primary ? " on" : ""}`}
            onClick={() => onPick(task.key)}
            data-task={task.key}
            data-task-primary={task.primary || undefined}
          >
            <span className="ic">
              <Icon name={task.primary ? "sparkle" : "check"} size={variant === "mobile" ? 20 : 15} />
            </span>
            <span className="tx">
              <b>
                {task.title}
                {task.primary ? <Pill tone="due">{copy.next.label}</Pill> : null}
              </b>
              <span>{task.why}</span>
            </span>
          </button>
        ))}
      </div>
    );

  if (variant === "mobile") {
    return (
      <>
        <button type="button" className="scrim" aria-label={copy.sheet.close} onClick={onClose} />
        <div className="mx-sheet h60" role="dialog" aria-modal="true" aria-label={c.title} data-tasks-tray="mobile">
          <div className="grab" aria-hidden="true" title={copy.sheet.dragHandle} />
          <div className="sh">
            <h3>{c.title}</h3>
            <button type="button" className="close" onClick={onClose} aria-label={copy.sheet.close}>
              <Icon name="x" size={18} />
            </button>
          </div>
          <div className="sb">{list}</div>
        </div>
      </>
    );
  }

  return (
    <div className="tray floating" role="menu" aria-label={c.title} data-tasks-tray="desktop">
      <div className="th">{c.title}</div>
      {list}
    </div>
  );
}
