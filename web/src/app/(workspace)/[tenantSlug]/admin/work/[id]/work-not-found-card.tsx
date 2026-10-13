import Link from "next/link";

/**
 * TUL-473 · the "this request isn't in this workspace" card.
 *
 * Rendered INLINE by the work detail page (a normal 200 render) instead of
 * `notFound()`: on production the control-flow error rendered the not-found
 * copy on the server and then crashed while the client rebuilt the boundary
 * ("This page couldn't load"). Also used by `not-found.tsx` for the auth
 * gates, so both paths show identical, translated copy.
 */
export function WorkNotFoundCard({
  t,
  backHref,
}: {
  t: (key: string) => string;
  /** Pipeline list. "." resolves to the parent /<slug>/admin/work/ when no slug is at hand. */
  backHref: string;
}) {
  return (
    <main className="mx-auto max-w-[560px] px-5 py-12 font-[system-ui,sans-serif] text-[color:var(--color-admin-ink)]" data-work-not-found="">
      <h1 className="m-0 text-[22px] tracking-normal">{t("admin.work.detail.notFoundTitle")}</h1>
      <p className="mb-5 mt-2.5 text-[14px] leading-normal text-[rgba(11,11,13,0.55)]">
        {t("admin.work.detail.notFoundBody")}
      </p>
      <Link
        href={backHref}
        className="inline-flex h-9 items-center rounded-lg border border-[rgba(24,24,27,0.08)] px-3.5 text-[13px] text-[color:var(--color-admin-ink)] no-underline"
      >
        {t("admin.work.detail.backToPipeline")}
      </Link>
    </main>
  );
}
