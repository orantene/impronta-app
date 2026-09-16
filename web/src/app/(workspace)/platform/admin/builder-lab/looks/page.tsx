/**
 * Platform HQ · Builder Lab · Looks
 * /platform/admin/builder-lab/looks?look=warm&type=nail-salon&page=home&locale=es&width=1440
 *
 * The Layer-1 gallery: every built-in Look, previewable with ANY business
 * type's components (Layer 2) at desktop or phone width, and exportable as
 * one portable JSON. The preview iframe is `/template-preview/<look>?kind=look`,
 * the real storefront render pipeline; this page only picks.
 *
 * Super-admin gated by the (workspace)/platform/admin layout. No colour
 * literals here (hex ratchet): Tailwind white/alpha utilities only.
 */

import Link from "next/link";
import { notFound } from "next/navigation";

import { isPlatformAdmin } from "@/lib/access/platform-role";
import { getCachedActorSession } from "@/lib/server/request-cache";
import {
  LOOKS,
  SITE_PAGE_ROLES,
  familyForType,
  resolveComponentsForType,
  type SitePageRole,
} from "@/lib/site-admin/builder-core/site-templates";
import { listSiteLooks } from "@/lib/site-admin/builder-core/site-templates/site-looks.server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { BUSINESS_TYPES } from "@/lib/words/business-types";

import { LookImportPanel } from "./look-import-panel";

export const dynamic = "force-dynamic";

const WIDTHS = [1440, 1024, 390] as const;

export default async function BuilderLabLooksPage({
  searchParams,
}: {
  searchParams: Promise<{ look?: string; type?: string; page?: string; locale?: string; width?: string }>;
}) {
  const session = await getCachedActorSession();
  if (!isPlatformAdmin(session.profile)) notFound();
  const sp = await searchParams;

  const look = LOOKS.find((l) => l.id === sp.look) ?? LOOKS[0];
  const typeId = BUSINESS_TYPES.some((t) => t.id === sp.type) ? (sp.type as string) : "restaurant";
  const page: SitePageRole = (SITE_PAGE_ROLES as readonly string[]).includes(sp.page ?? "") ? (sp.page as SitePageRole) : "home";
  const locale = sp.locale === "en" ? "en" : "es";
  const width = WIDTHS.includes(Number(sp.width) as (typeof WIDTHS)[number]) ? Number(sp.width) : 1440;

  const admin = createServiceRoleClient();
  const storedLooks = admin ? await listSiteLooks(admin) : [];

  const previewHref = `/template-preview/${look.id}?kind=look&type=${encodeURIComponent(typeId)}&page=${page}&locale=${locale}&bare=1`;
  const components = resolveComponentsForType(typeId);
  const hrefFor = (patch: Partial<Record<"look" | "type" | "page" | "locale" | "width", string>>) => {
    const q = new URLSearchParams({ look: look.id, type: typeId, page, locale, width: String(width), ...patch });
    return `/platform/admin/builder-lab/looks?${q.toString()}`;
  };

  return (
    <div className="mx-auto max-w-[1600px] px-6 py-8 text-white">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-white/50">Builder Lab</p>
          <h1 className="text-2xl font-semibold">Looks</h1>
          <p className="mt-1 max-w-2xl text-sm text-white/60">
            {LOOKS.length} site-wide visual systems. Any business type&apos;s components drop into any Look; imagery here is fixture
            stock. Export one Look as JSON with the link on its card.
          </p>
        </div>
        <Link href="/platform/admin/builder-lab" className="text-sm text-white/60 underline-offset-4 hover:underline">
          ← Builder Lab
        </Link>
      </header>

      {/* Look cards */}
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        {LOOKS.map((l) => {
          const active = l.id === look.id;
          return (
            <div key={l.id} className={`rounded-lg border p-3 ${active ? "border-white/60 bg-white/10" : "border-white/10 bg-white/5"}`}>
              <Link href={hrefFor({ look: l.id })} className="block">
                <div className="flex items-baseline justify-between">
                  <span className="font-medium">{l.title[locale]}</span>
                  <span className="text-[10px] uppercase tracking-wider text-white/40">{l.id}</span>
                </div>
                <p className="mt-1 text-xs text-white/60">{l.axis[locale]}</p>
              </Link>
              <a href={`/api/platform/looks/${l.id}`} download={`${l.id}.look.json`} className="mt-2 inline-block text-xs text-white/50 underline-offset-4 hover:underline">
                Export JSON
              </a>
            </div>
          );
        })}
      </div>

      {/* Picker */}
      <form method="get" className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-white/10 bg-white/5 p-3 text-sm">
        <input type="hidden" name="look" value={look.id} />
        <label className="flex flex-col gap-1">
          <span className="text-xs text-white/50">Business type ({familyForType(typeId)})</span>
          <select name="type" defaultValue={typeId} className="rounded border border-white/20 bg-transparent px-2 py-1">
            {BUSINESS_TYPES.map((t) => (
              <option key={t.id} value={t.id} className="text-black">
                {t.label[locale]} · {t.family}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-white/50">Page</span>
          <select name="page" defaultValue={page} className="rounded border border-white/20 bg-transparent px-2 py-1">
            {SITE_PAGE_ROLES.map((r) => (
              <option key={r} value={r} className="text-black">
                {r}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-white/50">Language</span>
          <select name="locale" defaultValue={locale} className="rounded border border-white/20 bg-transparent px-2 py-1">
            <option value="es" className="text-black">Español</option>
            <option value="en" className="text-black">English</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-white/50">Width</span>
          <select name="width" defaultValue={String(width)} className="rounded border border-white/20 bg-transparent px-2 py-1">
            {WIDTHS.map((w) => (
              <option key={w} value={w} className="text-black">
                {w}px
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="rounded bg-white px-3 py-1.5 text-sm font-medium text-black">
          Preview
        </button>
        <span className="ml-auto text-xs text-white/50">
          Components for {typeId}: {components.join(", ")}
        </span>
        <a href={previewHref} target="_blank" rel="noreferrer" className="text-xs text-white/60 underline-offset-4 hover:underline">
          Open preview in a tab ↗
        </a>
      </form>

      {/* Preview */}
      <div className="overflow-auto rounded-lg border border-white/10 bg-white/5 p-3">
        <iframe
          key={previewHref + width}
          title={`${look.id} · ${typeId} · ${page}`}
          src={previewHref}
          style={{ width, height: 900, border: 0, background: "white", display: "block", margin: "0 auto" }}
        />
      </div>

      <LookImportPanel rows={storedLooks} />
    </div>
  );
}
