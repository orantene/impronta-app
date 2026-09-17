/**
 * NextStepBar (desktop, above the composer) and NextStepBlock (mobile, above
 * the composer as a block): one context-aware primary action derived from
 * S4's `deriveTasks` output. Tasks are derived from state (owner decision 7);
 * the bar shows the primary task, its why, one primary button and, on
 * mobile, "+ N other tasks".
 */

import type { DerivedTask } from "@/lib/messaging/types";

import type { KitCopy } from "./copy";
import { fill } from "./copy";
import { Btn, Icon } from "./primitives";

export type NextStepAction = { readonly label: string; readonly onClick: () => void; readonly secondary?: boolean };

export type NextStepProps = {
  readonly tasks: readonly DerivedTask[];
  readonly copy: KitCopy;
  /** The button for the primary task. Null when nothing maps to a control (drawn as a sentence, never a fake button). */
  readonly action: NextStepAction | null;
  readonly secondaryAction?: NextStepAction | null;
  readonly busy?: boolean;
  readonly loading?: boolean;
  readonly onMoreTasks?: () => void;
};

function primaryOf(tasks: readonly DerivedTask[]): DerivedTask | null {
  return tasks.find((t) => t.primary) ?? tasks[0] ?? null;
}

export function NextStepBar({ tasks, copy, action, secondaryAction, busy, loading, onMoreTasks }: NextStepProps) {
  const primary = primaryOf(tasks);
  const others = Math.max(0, tasks.length - 1);
  const done = !loading && (!primary || primary.key === "closed" || primary.key === "all_clear");
  return (
    <div className={`nextbar${done ? " done" : ""}`} data-next-step aria-busy={loading || busy || undefined}>
      <Icon name="send" size={14} />
      <span className="lbl">{copy.next.label}</span>
      {loading ? (
        <b>{copy.next.loading}</b>
      ) : (
        <>
          <b>{primary ? primary.title : copy.next.nothing}</b>
          <span className="why">{primary?.why ? `· ${primary.why}` : ""}</span>
        </>
      )}
      {!loading && others > 0 && onMoreTasks ? (
        <button type="button" className="more" onClick={onMoreTasks}>
          {fill(copy.next.otherTasks, { count: others })}
        </button>
      ) : null}
      {!loading && secondaryAction ? (
        <Btn size="sm" variant="secondary" onClick={secondaryAction.onClick}>
          {secondaryAction.label}
        </Btn>
      ) : null}
      {!loading && action ? (
        <Btn size="sm" variant="primary" busy={busy} onClick={action.onClick} data-next-step-action>
          {action.label}
        </Btn>
      ) : null}
    </div>
  );
}

export function NextStepBlock({ tasks, copy, action, busy, loading, onMoreTasks }: NextStepProps) {
  const primary = primaryOf(tasks);
  const others = Math.max(0, tasks.length - 1);
  return (
    <div className="mx-next" data-next-step aria-busy={loading || busy || undefined}>
      <div className="lab">
        {copy.next.mobileLabel}
        {!loading && others > 0 ? (
          <button type="button" className="tasks" onClick={onMoreTasks}>
            {fill(copy.next.otherTasks, { count: others })}
          </button>
        ) : null}
      </div>
      <div className="ttl">{loading ? copy.next.loading : primary ? primary.title : copy.next.nothing}</div>
      {!loading && primary?.why ? <div className="sub">{primary.why}</div> : null}
      {!loading && action ? (
        <Btn size="xl" variant={action.secondary ? "secondary" : "primary"} busy={busy} onClick={action.onClick} data-next-step-action>
          {action.label}
        </Btn>
      ) : null}
    </div>
  );
}
