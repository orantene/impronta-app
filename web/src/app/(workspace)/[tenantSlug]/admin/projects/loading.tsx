/**
 * TUL-734 item 4: Projects list loading state.
 *
 * The page is `force-dynamic`, so on a client navigation nothing painted in
 * the content area until the whole server render finished ("slow first
 * click"). This boundary paints the page's own shape (heading, segments, one
 * list card) the moment the click lands. It reads no data, takes no params and
 * does not speed up the server; the layout's own fan-out is TUL-722.
 */
import { getRequestLocale } from "@/i18n/request-locale";
import { createTranslator } from "@/i18n/messages";
import { Card, PageShell } from "./_shared";

const bar = "animate-pulse rounded-[6px] bg-admin-surface-alt";
const ROWS = 6;

export default async function ProjectsLoading() {
  const tr = await createTranslator(await getRequestLocale());
  const label = tr("dashboard.projects.listLoading");
  return (
    <div role="status" aria-busy="true" aria-live="polite" aria-label={label}>
      <span className="sr-only">{label}</span>
      <PageShell>
        <div aria-hidden className="flex flex-col gap-2">
          <div className={`${bar} h-[26px] w-[220px] max-w-full`} />
          <div className={`${bar} h-[14px] w-[360px] max-w-full opacity-70`} />
        </div>
        <div aria-hidden className="flex flex-wrap gap-2">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className={`${bar} h-[30px] w-[88px] rounded-full`} />
          ))}
        </div>
        <Card>
          <div aria-hidden>
            {Array.from({ length: ROWS }, (_, i) => (
              <div key={i} className="flex items-center gap-3 border-t border-admin-border-soft px-4 py-[14px] first:border-t-0">
                <div className={`${bar} h-[14px] w-[34%]`} />
                <div className={`${bar} h-[14px] w-[16%] max-[720px]:hidden`} />
                <div className="flex-1" />
                <div className={`${bar} h-[20px] w-[72px] rounded-full`} />
              </div>
            ))}
          </div>
        </Card>
      </PageShell>
    </div>
  );
}
