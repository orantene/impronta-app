import { DashboardSectionCard } from "@/components/dashboard/dashboard-section-card";
import type { ActivityUiEntry } from "@/lib/commercial-activity-summary";
import { ADMIN_SECTION_TITLE_CLASS } from "@/lib/dashboard-shell-classes";

export function CommercialActivityPanel({
  title,
  description,
  entries,
}: {
  title: string;
  description: string | null;
  entries: ActivityUiEntry[];
}) {
  if (entries.length === 0) {
    return (
      <DashboardSectionCard title={title} description={description} titleClassName={ADMIN_SECTION_TITLE_CLASS}>
        <p className="text-sm text-muted-foreground">
          No activity recorded yet. Events appear as staff convert inquiries, edit bookings, and change lineup or
          commercial links.
        </p>
      </DashboardSectionCard>
    );
  }

  return (
    <DashboardSectionCard title={title} description={description} titleClassName={ADMIN_SECTION_TITLE_CLASS}>
      <ul className="space-y-3">
        {entries.map((e) => (
          <li
            key={e.id}
            className="rounded-lg border border-border/45 bg-muted/10 px-3 py-2.5 text-sm shadow-sm"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-border/30 pb-1.5 text-xs text-muted-foreground">
              <time dateTime={e.created_at}>{new Date(e.created_at).toLocaleString()}</time>
              <span className="font-medium text-foreground/90">{e.actor_label}</span>
            </div>
            <p className="mt-2 font-medium text-foreground">{e.label}</p>
            <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-muted-foreground">
              {e.summary_lines.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </DashboardSectionCard>
  );
}
