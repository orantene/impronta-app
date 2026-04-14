import { DocsPageHeader } from "@/components/docs/docs-page-header";
import { DocsSection } from "@/components/docs/docs-section";
import { DocsTable, type DocsTableColumn } from "@/components/docs/docs-table";
import { ADMIN_PAGE_STACK } from "@/lib/dashboard-shell-classes";

export function DocsTopicTemplate({
  title,
  description,
  eyebrow = "Documentation",
  sections,
}: {
  title: string;
  description: string;
  eyebrow?: string;
  sections: Array<{
    id?: string;
    eyebrow?: string;
    title: string;
    description?: string;
    body: "table" | "bullets";
    table?: { columns: DocsTableColumn[]; rows: Record<string, string>[] };
    bullets?: string[];
  }>;
}) {
  return (
    <div className={ADMIN_PAGE_STACK}>
      <DocsPageHeader eyebrow={eyebrow} title={title} description={description} />
      <div className="space-y-6">
        {sections.map((s) => (
          <DocsSection key={s.id ?? s.title} id={s.id} eyebrow={s.eyebrow} title={s.title} description={s.description}>
            {s.body === "table" && s.table ? (
              <DocsTable columns={s.table.columns} rows={s.table.rows} />
            ) : null}
            {s.body === "bullets" && s.bullets ? (
              <ul className="list-inside list-disc space-y-2 text-xs leading-relaxed text-muted-foreground">
                {s.bullets.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            ) : null}
          </DocsSection>
        ))}
      </div>
    </div>
  );
}
