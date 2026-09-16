/**
 * Platform HQ · Lifestyle stock
 * /platform/admin/stock?family=dining&type=restaurant
 *
 * The platform's shared photo library, by business family → type → role.
 * Add a licensed photo or generate one per type × role, retire / restore,
 * edit the manifest (licence, supplier, alt ES/EN). Every tenant of that
 * type sees additions on its Media page immediately (virtual folder,
 * D-TPL-6). Super-admin gated by the (workspace)/platform/admin layout.
 * Tailwind white/alpha utilities only (hex ratchet).
 */

import Link from "next/link";
import { notFound } from "next/navigation";

import { isPlatformAdmin } from "@/lib/access/platform-role";
import { queryLifestyleStockCoverage, queryLifestyleStockForType } from "@/lib/media/platform-stock";
import { STOCK_MAX_BYTES } from "@/lib/media/platform-stock-admin.server";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { IMAGE_ROLES } from "@/lib/site-admin/builder-core/site-templates";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { BUSINESS_FAMILIES, BUSINESS_TYPES, type BusinessFamilyId } from "@/lib/words/business-types";

import { StockAdminForms } from "./stock-admin-forms";

export const dynamic = "force-dynamic";

export default async function PlatformStockPage({
  searchParams,
}: {
  searchParams: Promise<{ family?: string; type?: string }>;
}) {
  const session = await getCachedActorSession();
  if (!isPlatformAdmin(session.profile)) notFound();
  const sp = await searchParams;
  const family: BusinessFamilyId = (BUSINESS_FAMILIES as readonly string[]).includes(sp.family ?? "") ? (sp.family as BusinessFamilyId) : "dining";
  const typesInFamily = BUSINESS_TYPES.filter((t) => t.family === family);
  const typeId = typesInFamily.some((t) => t.id === sp.type) ? (sp.type as string) : null;

  const admin = createServiceRoleClient();
  const coverage = admin ? await queryLifestyleStockCoverage(admin) : [];
  const photos = admin ? await queryLifestyleStockForType(admin, { businessType: typeId, family, includeRetired: true }) : [];

  const liveFor = (f: string, t: string | null, role: string) => coverage.find((c) => c.family === f && c.businessType === t && c.role === role)?.live ?? 0;
  const familyLive = (f: string) => coverage.filter((c) => c.family === f).reduce((n, c) => n + c.live, 0);
  const href = (patch: { family?: string; type?: string | null }) => {
    const q = new URLSearchParams({ family: patch.family ?? family });
    const t = patch.type === undefined ? typeId : patch.type;
    if (t) q.set("type", t);
    return `/platform/admin/stock?${q.toString()}`;
  };

  return (
    <div className="mx-auto max-w-[1500px] px-6 py-8 text-white">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-white/50">Platform</p>
          <h1 className="text-2xl font-semibold">Lifestyle stock</h1>
          <p className="mt-1 max-w-2xl text-sm text-white/60">
            Shared photos by business type and role. Every file is kept under {Math.round(STOCK_MAX_BYTES / 1024)} KB. Retiring hides a photo from
            every shelf and from the composer; its file stays so published pages keep rendering.
          </p>
        </div>
        <Link href="/platform/admin/builder-lab/looks" className="text-sm text-white/60 underline-offset-4 hover:underline">
          Looks →
        </Link>
      </header>

      {/* Family tabs */}
      <nav className="mb-4 flex flex-wrap gap-2">
        {BUSINESS_FAMILIES.map((f) => (
          <Link key={f} href={href({ family: f, type: null })} className={`rounded-full border px-3 py-1 text-xs ${f === family ? "border-white/60 bg-white/10" : "border-white/10 bg-white/5 text-white/70"}`}>
            {f} <span className="text-white/40">{familyLive(f)}</span>
          </Link>
        ))}
      </nav>

      {/* Coverage table for the family */}
      <div className="mb-6 overflow-x-auto rounded-lg border border-white/10 bg-white/5">
        <table className="w-full text-left text-xs">
          <thead className="text-white/50">
            <tr>
              <th className="px-3 py-2 font-medium">Type</th>
              {IMAGE_ROLES.map((r) => (
                <th key={r} className="px-3 py-2 font-medium">
                  {r}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className={`border-t border-white/10 ${typeId === null ? "bg-white/10" : ""}`}>
              <td className="px-3 py-2">
                <Link href={href({ type: null })} className="underline-offset-4 hover:underline">
                  Family pack (fallback for every type)
                </Link>
              </td>
              {IMAGE_ROLES.map((r) => (
                <td key={r} className={`px-3 py-2 ${liveFor(family, null, r) === 0 ? "text-white/30" : ""}`}>
                  {liveFor(family, null, r)}
                </td>
              ))}
            </tr>
            {typesInFamily.map((t) => (
              <tr key={t.id} className={`border-t border-white/10 ${typeId === t.id ? "bg-white/10" : ""}`}>
                <td className="px-3 py-2">
                  <Link href={href({ type: t.id })} className="underline-offset-4 hover:underline">
                    {t.label.en} <span className="text-white/40">{t.id}</span>
                  </Link>
                </td>
                {IMAGE_ROLES.map((r) => (
                  <td key={r} className={`px-3 py-2 ${liveFor(family, t.id, r) === 0 ? "text-white/30" : ""}`}>
                    {liveFor(family, t.id, r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <StockAdminForms family={family} typeId={typeId} photos={photos} typeOptions={typesInFamily.map((t) => ({ id: t.id, label: t.label.en }))} />
    </div>
  );
}
