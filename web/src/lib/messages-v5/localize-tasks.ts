import type { DerivedTask } from "@/lib/messaging/tasks";

/**
 * L12: `deriveTasks` (S4) speaks English by design (it is engine truth, tested
 * by sentence). The shell translates by task key + the sentence variant before
 * anything reaches the screen, so ES/FR operators read their own words and a
 * key the catalogue does not know falls back to the engine's sentence.
 */
export type TaskCopy = Readonly<Record<string, { readonly title: string; readonly why: string }>>;

function variantFor(task: DerivedTask): string {
  if (task.key === "closed") return task.title === "Lost" ? "closedLost" : "closedResolved";
  if (task.key === "payment_issue") {
    if (task.why.includes("failed")) return "payment_issue_failed";
    if (task.why.includes("expired")) return "payment_issue_expired";
    return "payment_issue_declined";
  }
  if (task.key === "collect_balance") return task.why.includes("now") ? "collect_balance_now" : "collect_balance_soon";
  return task.key;
}

export function localizeTasks(tasks: readonly DerivedTask[], copy: TaskCopy): DerivedTask[] {
  return tasks.map((task) => {
    const words = copy[variantFor(task)];
    if (!words) return task;
    const count = task.key === "confirm_talent" ? (task.why.match(/^(\d+)/)?.[1] ?? "") : "";
    return { ...task, title: words.title, why: words.why.replace("{count}", count) };
  });
}
