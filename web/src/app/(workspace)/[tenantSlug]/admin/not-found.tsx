// TUL-635: a missing admin page renders INSIDE the admin shell (sidebar and
// header stay), instead of falling through to the root public 404 card.
import Link from "next/link";
import { headers } from "next/headers";
import { getRequestLocale } from "@/i18n/request-locale";
import { createTranslator } from "@/i18n/messages";

export const dynamic = "force-dynamic";

/** `/slug/admin/x` -> `/slug/admin`; `/admin/x` (own domain) -> `/admin`. */
function adminBaseFromPath(pathname: string): string {
  const parts = pathname.split("/");
  const i = parts.indexOf("admin");
  return i === -1 ? "/admin" : parts.slice(0, i + 1).join("/") || "/admin";
}

export default async function AdminNotFound() {
  const hdrs = await headers();
  const base = adminBaseFromPath(hdrs.get("x-impronta-original-pathname") ?? "/admin");
  const locale = await getRequestLocale();
  const tr = await createTranslator(locale);
  return (
    <div className="flex min-h-[50vh] items-center justify-center p-6">
      <div role="alert" className="w-full max-w-md rounded-2xl border border-admin-border bg-admin-card p-8">
        <h1 className="m-0 text-[22px] font-semibold tracking-[-0.02em] text-admin-ink">
          {tr("dashboard.adminNotFound.title")}
        </h1>
        <p className="mt-2 text-[13.5px] text-admin-ink-muted">{tr("dashboard.adminNotFound.body")}</p>
        <Link
          href={base}
          className="mt-5 inline-flex items-center rounded-full border border-admin-border px-4 py-2 text-[13.5px] font-medium text-admin-ink"
        >
          {tr("dashboard.adminNotFound.back")}
        </Link>
      </div>
    </div>
  );
}
