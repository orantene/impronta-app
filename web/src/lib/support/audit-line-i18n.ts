/**
 * TUL-602: the /desk "Actividad reciente" feed shows workspace audit events whose
 * summaries were stored in English. Known support lines are re-rendered in the
 * viewer's language; anything else shows as stored.
 */
type Tr = (key: string) => string;

const fill = (template: string, vars: Record<string, string>) =>
  template.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? "");

export function localizeAuditLine(t: Tr, ev: { action: string; summary: string | null }): string {
  const summary = ev.summary ?? "";
  const key = "dashboard.platform.support.audit";
  const opened = /^Opened support ticket #(\d+)$/.exec(summary);
  if (opened) return fill(t(`${key}Opened`), { number: opened[1] });
  const status = /^Ticket #(\d+) marked (\w+)$/.exec(summary);
  if (status) {
    const label = t(`${key}Status.${status[2]}`);
    return fill(t(`${key}Marked`), {
      number: status[1],
      status: label === `${key}Status.${status[2]}` ? status[2] : label,
    });
  }
  const esc = /^Ticket #(\d+) escalated to a human$/.exec(summary);
  if (esc) return fill(t(`${key}Escalated`), { number: esc[1] });
  return summary || ev.action;
}
