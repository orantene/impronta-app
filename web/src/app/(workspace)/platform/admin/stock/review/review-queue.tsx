"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import type { LifestyleStockPhoto } from "@/lib/media/platform-stock";

import { actionReviewStockImage } from "../actions";

export function ReviewQueue({ items }: { items: LifestyleStockPhoto[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const decide = (id: string, decision: "approve" | "reject") =>
    start(async () => {
      const note = decision === "reject" ? (window.prompt("Reason (kept for the audit):") ?? "") : "";
      const res = await actionReviewStockImage(id, decision, note);
      setMessage(res.ok ? (decision === "approve" ? "Approved." : "Rejected.") : res.error);
      router.refresh();
    });
  if (items.length === 0) return <p className="text-sm text-white/50">Nothing waiting.</p>;
  return (
    <div>
      {message ? <p className="mb-3 text-xs text-white/70">{message}</p> : null}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        {items.map((p) => (
          <div key={p.id} className="rounded-lg border border-white/10 bg-white/5">
            {/* eslint-disable-next-line @next/next/no-img-element -- shared-bucket URL, unoptimised by design */}
            <img src={p.url} alt={p.alt.en} className="aspect-[4/3] w-full rounded-t-lg object-cover" />
            <div className="space-y-1 px-2 py-2 text-[11px] text-white/70">
              <div className="flex items-center justify-between">
                <span className="font-medium text-white/90">
                  {p.role} · {p.businessType ?? `${p.family} pack`}
                </span>
                <span>{p.approval.replace("_", " ")}</span>
              </div>
              <div className="text-white/50">
                {p.direction ?? "no direction"}
                {p.originTenantId ? " · tenant image" : ""}
                {Object.keys(p.tags).length ? ` · ${Object.entries(p.tags).map(([k, v]) => `${k}: ${v}`).join(", ")}` : ""}
              </div>
              <div className="flex gap-2 pt-1">
                <button type="button" disabled={pending} onClick={() => decide(p.id, "approve")} className="rounded bg-white px-2 py-1 font-medium text-black disabled:opacity-50">
                  Approve
                </button>
                <button type="button" disabled={pending} onClick={() => decide(p.id, "reject")} className="rounded border border-white/30 px-2 py-1 disabled:opacity-50">
                  Reject
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
