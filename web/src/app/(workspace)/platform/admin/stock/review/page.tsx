/**
 * Platform HQ · Images needing review (03 §4.3)
 * /platform/admin/stock/review
 *
 * Every generated asset that is not yet approved or rejected, heroes first,
 * then by age. Tenant-generated images appear here too: approval adds them to
 * the type pool with their tags. Tailwind white/alpha utilities only.
 */

import Link from "next/link";
import { notFound } from "next/navigation";

import { isPlatformAdmin } from "@/lib/access/platform-role";
import { queryStockReviewQueue } from "@/lib/media/platform-stock";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { createServiceRoleClient } from "@/lib/supabase/admin";

import { ReviewQueue } from "./review-queue";

export const dynamic = "force-dynamic";

export default async function StockReviewPage() {
  const session = await getCachedActorSession();
  if (!isPlatformAdmin(session.profile)) notFound();
  const admin = createServiceRoleClient();
  const queue = admin ? await queryStockReviewQueue(admin, { limit: 120 }) : [];
  return (
    <div className="mx-auto max-w-[1500px] px-6 py-8 text-white">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-white/50">Platform</p>
          <h1 className="text-2xl font-semibold">Images needing review</h1>
          <p className="mt-1 max-w-2xl text-sm text-white/60">
            Heroes serve only after a human approves them. Gallery and detail images already serve once automated QA passed; approving them keeps them,
            rejecting withdraws them. Approving a tenant&apos;s image adds it to the type pool with its facts; the tenant keeps it either way.
          </p>
        </div>
        <Link href="/platform/admin/stock" className="text-sm text-white/60 underline-offset-4 hover:underline">
          ← Lifestyle stock
        </Link>
      </header>
      <ReviewQueue items={queue} />
    </div>
  );
}
