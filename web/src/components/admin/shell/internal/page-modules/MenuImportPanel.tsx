"use client";

/**
 * MenuImportPanel — paste a menu export, read what it would do, then confirm.
 *
 * THE PREVIEW IS THE PRODUCT. The confirm button does not exist until a plan has
 * been read, because 117 rows is far past what anyone can audit after the fact.
 * An operator who clicks Import and watches a spinner has approved nothing.
 *
 * The plan shown here is NOT sent back on confirm. `applyMenuImport` re-reads
 * and re-plans from the same source server-side, so this component holds a
 * picture, never the instruction.
 */

import { useState, useTransition } from "react";
import { useT } from "@/i18n/use-t";
import type { ImportPlan } from "@/lib/menu-import/plan-import";

type Phase = "idle" | "previewed" | "done";

export function MenuImportPanel({
  tenantId,
  onImported,
}: {
  tenantId: string;
  onImported?: () => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState("");
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setPlan(null);
    setPhase("idle");
    setError(null);
    setSummary(null);
  }

  async function preview() {
    setError(null);
    setSummary(null);
    const { previewMenuImport } = await import("@/lib/menu-import/import-actions");
    const res = await previewMenuImport(tenantId, source);
    if (!res.ok) {
      setError(res.error);
      setPlan(null);
      setPhase("idle");
      return;
    }
    setPlan(res.plan);
    setPhase("previewed");
  }

  async function apply() {
    setError(null);
    const { applyMenuImport } = await import("@/lib/menu-import/import-actions");
    const res = await applyMenuImport(tenantId, source);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setSummary(
      t("dashboard.adminMenu.import.done")
        .replace("{created}", String(res.created))
        .replace("{updated}", String(res.updated)),
    );
    setPhase("done");
    setPlan(null);
    setSource("");
    onImported?.();
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mb-4 rounded-lg border border-black/10 px-3 py-2 text-sm font-medium text-black hover:bg-black/[0.03]"
      >
        {t("dashboard.adminMenu.import.open")}
      </button>
    );
  }

  const nothingToDo = plan != null && plan.counts.create === 0 && plan.counts.update === 0;

  return (
    <section className="mb-6 rounded-xl border border-black/10 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-black">
          {t("dashboard.adminMenu.import.title")}
        </h2>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            reset();
            setSource("");
          }}
          className="text-sm text-black/50 hover:text-black"
        >
          {t("dashboard.adminMenu.import.close")}
        </button>
      </div>

      <textarea
        value={source}
        onChange={(e) => {
          setSource(e.target.value);
          // A plan describes the text it was built from. Editing the source
          // makes it stale, so it goes rather than sitting there looking current.
          if (plan) reset();
        }}
        disabled={pending}
        rows={5}
        placeholder={t("dashboard.adminMenu.import.placeholder")}
        className="w-full rounded-lg border border-black/10 p-2 font-mono text-xs"
      />

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          disabled={pending || !source.trim()}
          onClick={() => startTransition(() => void preview())}
          className="rounded-lg border border-black/10 px-3 py-2 text-sm font-medium disabled:opacity-40"
        >
          {pending && phase === "idle"
            ? t("dashboard.adminMenu.import.reading")
            : t("dashboard.adminMenu.import.preview")}
        </button>

        {/* Only ever reachable AFTER a plan has been shown. */}
        {phase === "previewed" && !nothingToDo ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => startTransition(() => void apply())}
            className="rounded-lg bg-black px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            {t("dashboard.adminMenu.import.confirm")
              .replace("{create}", String(plan?.counts.create ?? 0))
              .replace("{update}", String(plan?.counts.update ?? 0))}
          </button>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="mt-3 text-sm text-[#B0303A]">
          {error}
        </p>
      ) : null}
      {summary ? (
        <p role="status" className="mt-3 text-sm text-[#1F5D43]">
          {summary}
        </p>
      ) : null}

      {plan ? (
        <div className="mt-4">
          <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-black/70">
            <li>{t("dashboard.adminMenu.import.willCreate").replace("{n}", String(plan.counts.create))}</li>
            <li>{t("dashboard.adminMenu.import.willUpdate").replace("{n}", String(plan.counts.update))}</li>
            <li>{t("dashboard.adminMenu.import.unchanged").replace("{n}", String(plan.counts.unchanged))}</li>
            <li>{t("dashboard.adminMenu.import.categories").replace("{n}", String(plan.counts.categories))}</li>
          </ul>

          {nothingToDo ? (
            <p className="text-sm text-black/60">{t("dashboard.adminMenu.import.nothingToDo")}</p>
          ) : null}

          {/* Refusals sit BESIDE the plan, not behind a link: an operator judging
              an import needs to see what it will not do on the same screen. */}
          {plan.refused.length > 0 ? (
            <details className="mb-3" open>
              <summary className="cursor-pointer text-sm font-medium text-[#B0303A]">
                {t("dashboard.adminMenu.import.refused").replace("{n}", String(plan.refused.length))}
              </summary>
              <ul className="mt-1 list-disc pl-5 text-sm text-black/70">
                {plan.refused.slice(0, 50).map((r) => (
                  <li key={r.sourceId}>
                    {r.detail} — {t(`dashboard.adminMenu.import.reason.${r.reason}`)}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}

          {/* Orphans are REPORTED, never actioned. Nothing here deletes. */}
          {plan.orphans.length > 0 ? (
            <details className="mb-3">
              <summary className="cursor-pointer text-sm font-medium text-black/70">
                {t("dashboard.adminMenu.import.orphans").replace("{n}", String(plan.orphans.length))}
              </summary>
              <ul className="mt-1 list-disc pl-5 text-sm text-black/70">
                {plan.orphans.slice(0, 50).map((o) => (
                  <li key={o.offeringId}>{o.title}</li>
                ))}
              </ul>
            </details>
          ) : null}

          <div className="max-h-72 overflow-y-auto rounded-lg border border-black/10">
            <table className="w-full text-left text-sm">
              <tbody>
                {plan.rows
                  .filter((r) => r.action !== "unchanged")
                  .slice(0, 200)
                  .map((r) => (
                    <tr key={r.sourceId} className="border-b border-black/5 last:border-0">
                      <td className="px-2 py-1 text-xs uppercase tracking-wide text-black/45">
                        {t(`dashboard.adminMenu.import.action.${r.action}`)}
                      </td>
                      <td className="px-2 py-1">{r.title}</td>
                      <td className="px-2 py-1 text-black/55">{r.category}</td>
                      <td className="px-2 py-1 tabular-nums text-black/70">
                        {r.amountCents == null
                          ? t("dashboard.adminMenu.import.tiered").replace("{n}", String(r.variantCount))
                          : `${(r.amountCents / 100).toFixed(2)} ${r.currency}`}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </section>
  );
}
