"use client";

import { useState } from "react";
import { importLegacyToOfferings, upsertTalentOffering } from "@/lib/talent/offerings-actions";
import { foldAccent, parseOfferingLine } from "@/lib/talent/publication-state";
import { blankOffering } from "@/lib/talent/offerings-types";
import { useOfferingsEditor } from "./use-offerings-editor";
import { useDashboardText } from "@/components/admin/shell/internal/dashboard-i18n";

type Row = {
  key: string;
  title: string;
  kind: "service" | "product";
  minutes: string;
  price: string;
};

type RowState = "exists" | "noPrice" | "needsMinutes" | "ready" | "readyPickup";

const EXAMPLE = [
  "Gel semi pies 600",
  "Pedicura spa 620 (70min)",
  "Cambio de esmalte 220",
  "Kit de cuidado pestañas 320 (producto)",
].join("\n");

export function AddManyScreen({
  talentId,
  editor,
  onBack,
}: {
  talentId: string;
  editor: ReturnType<typeof useOfferingsEditor>;
  onBack: () => void;
}) {
  const copy = useDashboardText();
  const [text, setText] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const currency = editor.defaultCurrency;

  const readList = () => {
    const parsed = text
      .split(/\n+/)
      .map(parseOfferingLine)
      .filter((r): r is NonNullable<typeof r> => Boolean(r));
    setRows(
      parsed.map((r, i) => ({
        key: `${i}-${r.title}`,
        title: r.title,
        kind: r.kind,
        minutes: r.durationMinutes != null ? String(r.durationMinutes) : "",
        price: r.amountCents != null ? String(r.amountCents / 100) : "",
      })),
    );
    setMessage(null);
  };

  const exists = (title: string) => editor.items.some((i) => foldAccent(i.title) === foldAccent(title));
  const stateOf = (r: Row): RowState => {
    if (exists(r.title)) return "exists";
    const p = Number(r.price);
    if (!r.price || !Number.isFinite(p) || p <= 0) return "noPrice";
    if (r.kind === "product") return "readyPickup";
    const m = Number(r.minutes);
    if (!r.minutes || !Number.isFinite(m) || m <= 0) return "needsMinutes";
    return "ready";
  };
  const readyRows = (rows ?? []).filter((r) => {
    const s = stateOf(r);
    return s === "ready" || s === "readyPickup";
  });

  const patchRow = (key: string, patch: Partial<Row>) =>
    setRows((cur) => (cur ? cur.map((r) => (r.key === key ? { ...r, ...patch } : r)) : cur));

  const publishReady = async () => {
    if (readyRows.length === 0) return;
    setBusy(true);
    setMessage(null);
    let done = 0;
    let firstError: string | null = null;
    for (const [i, r] of readyRows.entries()) {
      const base = blankOffering({ kind: "talent", talentProfileId: talentId }, currency, editor.items.length + i);
      const res = await upsertTalentOffering(talentId, {
        ...base,
        kind: r.kind,
        title: r.title,
        amountCents: Math.round(Number(r.price) * 100),
        durationMinutes: r.kind === "service" ? Math.round(Number(r.minutes)) : null,
        status: "published",
        bookingMode: "instant",
        priceDisplay: "exact",
      });
      if (res.ok) done += 1;
      else if (!firstError) firstError = res.error;
    }
    setBusy(false);
    editor.reload();
    if (firstError) {
      setMessage(copy.t("Published {n}. One row was refused: {error}").replace("{n}", String(done)).replace("{error}", firstError));
      return;
    }
    onBack();
  };

  const runImport = async () => {
    setImporting(true);
    setMessage(null);
    const res = await importLegacyToOfferings(talentId);
    setImporting(false);
    if (res.ok) {
      editor.reload();
      onBack();
    } else setMessage(res.error);
  };

  const pill = (s: RowState) => {
    const green = "bg-emerald-900/[0.06] text-emerald-900";
    const grey = "bg-black/[0.05] text-admin-ink-muted";
    const label: Record<RowState, string> = {
      exists: copy.t("Already exists · skip"),
      noPrice: copy.t("Needs a price"),
      needsMinutes: copy.t("Needs minutes"),
      ready: copy.t("Ready"),
      readyPickup: copy.t("Ready · pickup"),
    };
    return (
      <span className={`block truncate rounded px-2 py-1 text-[11px] font-semibold ${s === "ready" || s === "readyPickup" ? green : grey}`}>
        {label[s]}
      </span>
    );
  };

  const optionCard = "w-full rounded-lg border px-4 py-3 text-left";

  return (
    <div className="font-admin-body text-admin-ink">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">{copy.t("Add many at once")}</h1>
          <p className="mt-0.5 text-[13px] text-admin-ink-dim">{copy.t("Paste a price list, or bring in the rates you already had")}</p>
        </div>
        <button type="button" onClick={onBack} className="mt-3 text-[14px] font-medium">
          {copy.t("Cancel")}
        </button>
      </div>

      <div className="mt-6 flex flex-col gap-6 lg:flex-row">
        <div className="flex w-full flex-col gap-2 lg:shrink-0 lg:border-r lg:border-admin-border-soft lg:pr-6" style={{ maxWidth: 420 }}>
          <div className={`${optionCard} border-emerald-900 bg-emerald-900/[0.06]`}>
            <div className="text-[14px] font-medium text-emerald-900">{copy.t("Paste a list")}</div>
            <div className="mt-0.5 text-[12px] text-admin-ink-muted">{copy.t("From WhatsApp, Instagram or Notes. One line per item.")}</div>
          </div>
          <div className={`${optionCard} border-admin-border-soft opacity-80`} aria-disabled="true">
            <div className="flex items-center gap-2 text-[14px] font-medium">
              {copy.t("Photo of your price card")}
              <span className="rounded bg-black/[0.05] px-1.5 py-0.5 text-[11px] font-semibold text-admin-ink-muted">{copy.t("Later phase")}</span>
            </div>
            <div className="mt-0.5 text-[12px] text-admin-ink-muted">{copy.t("We read it and propose the rows.")}</div>
          </div>
          {editor.legacyImportable ? (
            <button type="button" disabled={importing} onClick={() => void runImport()} className={`${optionCard} border-admin-border-soft hover:bg-black/[0.02] disabled:opacity-60`}>
              <div className="text-[14px] font-medium">{importing ? copy.t("Importing…") : copy.t("Import my old rates & packages")}</div>
              <div className="mt-0.5 text-[12px] text-admin-ink-muted">{copy.t("The rates on your profile from before. One time only.")}</div>
            </button>
          ) : null}
          <textarea
            style={{ minHeight: 320 }}
            className="mt-1 w-full flex-1 rounded-lg border border-admin-border-soft bg-white p-3 font-mono text-[13px] leading-6 outline-none focus:border-emerald-900"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={EXAMPLE}
            aria-label={copy.t("Paste a list")}
          />
          <button
            type="button"
            disabled={!text.trim()}
            onClick={readList}
            className="mt-1 w-full rounded-lg bg-emerald-900 py-2.5 text-[14px] font-semibold text-white disabled:opacity-50"
          >
            {copy.t("Read the list")}
          </button>
        </div>

        <div className="min-w-0 flex-1">
          {rows == null ? (
            <div className="rounded-lg border border-dashed border-admin-border-soft p-8 text-center text-[13px] text-admin-ink-muted">
              {copy.t("Paste your list on the left and press Read the list. Each line becomes a draft you can check here.")}
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-[15px] font-semibold">
                    {copy.t("{n} lines → {n} drafts").replace(/\{n\}/g, String(rows.length))}
                  </div>
                  <div className="text-[12px] text-admin-ink-dim">{copy.t("Check each row. Nothing is on your page until you publish.")}</div>
                </div>
                <button
                  type="button"
                  disabled={busy || readyRows.length === 0}
                  onClick={() => void publishReady()}
                  className="rounded-lg bg-emerald-900 px-4 py-2 text-[14px] font-semibold text-white disabled:opacity-50"
                >
                  {busy ? copy.t("Publishing…") : copy.t("Publish the {n} that are ready").replace("{n}", String(readyRows.length))}
                </button>
              </div>

              <div className="mt-4 overflow-x-auto rounded-lg border border-admin-border-soft bg-white">
                <table style={{ minWidth: 640 }} className="w-full text-left text-[14px]">
                  <thead>
                    <tr className="border-b border-admin-border-soft text-[11px] font-semibold uppercase tracking-wider text-admin-ink-dim">
                      <th className="w-12 px-3 py-2" />
                      <th className="px-2 py-2">{copy.t("Name")}</th>
                      <th className="w-28 px-2 py-2">{copy.t("Kind")}</th>
                      <th className="w-24 px-2 py-2">{copy.t("Minutes")}</th>
                      <th className="w-36 px-2 py-2">{copy.t("Price")}</th>
                      <th className="w-40 px-2 py-2">{copy.t("Ready?")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const s = stateOf(r);
                      return (
                        <tr key={r.key} className="border-b border-admin-border-soft last:border-b-0">
                          <td className="px-3 py-2">
                            <span aria-hidden className="flex h-7 w-7 items-center justify-center rounded border border-dashed border-admin-border-soft text-[13px] text-admin-ink-dim">+</span>
                          </td>
                          <td className="max-w-0 truncate px-2 py-2 font-medium" title={r.title}>{r.title}</td>
                          <td className="px-2 py-2">
                            <span className={`block rounded px-2 py-1 text-[11px] font-semibold ${r.kind === "product" ? "bg-indigo-50 text-indigo-700" : "bg-black/[0.05] text-admin-ink-muted"}`}>
                              {r.kind === "product" ? copy.t("Product") : copy.t("Service")}
                            </span>
                          </td>
                          <td className="px-2 py-2">
                            {r.kind === "product" ? (
                              <span className="text-admin-ink-dim">-</span>
                            ) : (
                              <input
                                inputMode="numeric"
                                value={r.minutes}
                                placeholder="-"
                                onChange={(e) => patchRow(r.key, { minutes: e.target.value.replace(/[^\d]/g, "") })}
                                aria-label={copy.t("Minutes")}
                                className="w-16 rounded border border-transparent bg-transparent px-1 py-1 hover:border-admin-border-soft focus:border-emerald-900 focus:outline-none"
                              />
                            )}
                          </td>
                          <td className="px-2 py-2">
                            <div className="flex items-center rounded-md border border-admin-border-soft px-2 focus-within:border-emerald-900">
                              <input
                                inputMode="decimal"
                                value={r.price}
                                onChange={(e) => patchRow(r.key, { price: e.target.value.replace(/[^\d.,]/g, "").replace(",", ".") })}
                                aria-label={copy.t("Price")}
                                className="w-full bg-transparent py-1.5 outline-none"
                              />
                              <span className="pl-1 text-[13px]">{currency}</span>
                            </div>
                          </td>
                          <td className="px-2 py-2">{pill(s)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <p className="mt-4 text-[12px] leading-5 text-admin-ink-dim">
                {copy.t("Photos are not in a price list. After publishing, “What you sell” will list these {n} under “Needs attention · no photo” so you can add them from your phone in one sitting.").replace("{n}", String(rows.length))}
              </p>
            </>
          )}
          {message ? <p className="mt-3 text-[13px] text-red-700">{message}</p> : null}
        </div>
      </div>
    </div>
  );
}
