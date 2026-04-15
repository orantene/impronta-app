"use client";

import { type FormEvent, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { handleActionResult, type ActionResult } from "@/lib/inquiry/inquiry-action-result";
import type { OfferLineDraft } from "@/lib/inquiry/inquiry-engine";
import { ADMIN_FORM_CONTROL } from "@/lib/dashboard-shell-classes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { actionSendOffer, actionUpdateOfferDraft } from "./offer-actions";

type OfferRow = {
  id: string;
  version: number;
  status: string;
  total_client_price: number;
  coordinator_fee: number;
  currency_code: string;
  notes: string | null;
};

function emptyLine(sort: number): OfferLineDraft {
  return {
    talent_profile_id: null,
    label: "",
    pricing_unit: "event",
    units: 1,
    unit_price: 0,
    total_price: 0,
    talent_cost: 0,
    notes: null,
    sort_order: sort,
  };
}

export function InquiryV2OfferEditor({
  inquiryId,
  inquiryVersion,
  offer,
  initialLines,
}: {
  inquiryId: string;
  inquiryVersion: number;
  offer: OfferRow;
  initialLines: OfferLineDraft[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [lines, setLines] = useState<OfferLineDraft[]>(
    initialLines.length ? initialLines : [emptyLine(0), emptyLine(1), emptyLine(2)],
  );
  const [totals, setTotals] = useState({
    total_client_price: offer.total_client_price,
    coordinator_fee: offer.coordinator_fee,
    currency_code: offer.currency_code,
    notes: offer.notes ?? "",
  });

  const lineJson = useMemo(() => JSON.stringify(lines), [lines]);

  const canEdit = offer.status === "draft";
  const [offerVersion, setOfferVersion] = useState<number>(offer.version);
  const [inqVersion, setInqVersion] = useState<number>(inquiryVersion);

  const updateLine = (i: number, patch: Partial<OfferLineDraft>) => {
    setLines((prev) =>
      prev.map((row, j) => {
        if (j !== i) return row;
        const merged = { ...row, ...patch, sort_order: i };
        // Auto-calculate total_price when units or unit_price changes
        if ("units" in patch || "unit_price" in patch) {
          merged.total_price = parseFloat((merged.units * merged.unit_price).toFixed(2));
        }
        return merged;
      }),
    );
  };

  const addRow = () => setLines((prev) => [...prev, emptyLine(prev.length)]);
  const removeRow = (i: number) => setLines((prev) => prev.filter((_, j) => j !== i).map((r, j) => ({ ...r, sort_order: j })));

  const handleSaveDraft = (formData: FormData) => {
    if (!canEdit) return;
    // Inject current versions so we never submit stale hidden values.
    formData.set("inquiry_version", String(inqVersion));
    formData.set("offer_version", String(offerVersion));
    startTransition(async () => {
      const res: ActionResult<{ nextOfferVersion: number; nextInquiryVersion: number }> = await actionUpdateOfferDraft(formData);
      handleActionResult(res, {
        onToast: (m) => toast.message(m),
        onRefresh: () => router.refresh(),
        onInlineError: (m) => toast.error(m),
        onBlockerBanner: (m) => toast.error(m),
      });
      if (res.ok && res.data) {
        setOfferVersion(res.data.nextOfferVersion);
        setInqVersion(res.data.nextInquiryVersion);
      }
    });
  };

  const handleSendOffer = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canEdit) return;
    const formData = new FormData(e.currentTarget);
    formData.set("inquiry_version", String(inqVersion));
    formData.set("offer_version", String(offerVersion));
    startTransition(async () => {
      const res = await actionSendOffer(formData);
      handleActionResult(res, {
        onToast: (m) => toast.message(m),
        onRefresh: () => router.refresh(),
        onInlineError: (m) => toast.error(m),
        onBlockerBanner: (m) => toast.error(m),
      });
    });
  };

  return (
    <div className="space-y-4">
      <form id="offer-draft-form" action={handleSaveDraft} className="space-y-4">
        <input type="hidden" name="inquiry_id" value={inquiryId} />
        <input type="hidden" name="offer_id" value={offer.id} />
        <input type="hidden" name="inquiry_version" value={inqVersion} />
        <input type="hidden" name="offer_version" value={offerVersion} />
        <input type="hidden" name="line_items_json" value={lineJson} />
        <input type="hidden" name="total_client_price" value={String(totals.total_client_price)} />
        <input type="hidden" name="coordinator_fee" value={String(totals.coordinator_fee)} />
        <input type="hidden" name="currency_code" value={totals.currency_code} />
        <input type="hidden" name="notes" value={totals.notes} />

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="total_client_price">Total client price</Label>
            <Input
              id="total_client_price"
              className={ADMIN_FORM_CONTROL}
              type="number"
              step="0.01"
              disabled={!canEdit}
              value={totals.total_client_price}
              onChange={(e) => setTotals((t) => ({ ...t, total_client_price: Number(e.target.value) }))}
            />
          </div>
          <div>
            <Label htmlFor="coordinator_fee">Coordinator fee</Label>
            <Input
              id="coordinator_fee"
              className={ADMIN_FORM_CONTROL}
              type="number"
              step="0.01"
              disabled={!canEdit}
              value={totals.coordinator_fee}
              onChange={(e) => setTotals((t) => ({ ...t, coordinator_fee: Number(e.target.value) }))}
            />
          </div>
          <div>
            <Label htmlFor="currency_code">Currency</Label>
            <Input
              id="currency_code"
              className={ADMIN_FORM_CONTROL}
              disabled={!canEdit}
              value={totals.currency_code}
              onChange={(e) => setTotals((t) => ({ ...t, currency_code: e.target.value }))}
            />
          </div>
        </div>
        <div>
          <Label htmlFor="notes">Notes / inclusions</Label>
          <Textarea
            id="notes"
            className={ADMIN_FORM_CONTROL}
            disabled={!canEdit}
            value={totals.notes}
            onChange={(e) => setTotals((t) => ({ ...t, notes: e.target.value }))}
            rows={3}
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Line items</p>
            <Button type="button" size="sm" variant="secondary" disabled={!canEdit} onClick={addRow}>
              Add row
            </Button>
          </div>
          <ul className="space-y-3">
            {lines.map((line, i) => (
              <li
                key={i}
                className="rounded-xl border border-border/40 bg-muted/10 p-3"
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">Line {i + 1}</span>
                  {canEdit && lines.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeRow(i)}
                      className="rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      aria-label={`Remove line ${i + 1}`}
                    >
                      Remove
                    </button>
                  )}
                </div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  <Input
                    placeholder="Talent profile UUID (optional)"
                    className={ADMIN_FORM_CONTROL}
                    disabled={!canEdit}
                    value={line.talent_profile_id ?? ""}
                    onChange={(e) => updateLine(i, { talent_profile_id: e.target.value.trim() || null })}
                  />
                  <Input
                    placeholder="Label"
                    className={ADMIN_FORM_CONTROL}
                    disabled={!canEdit}
                    value={line.label ?? ""}
                    onChange={(e) => updateLine(i, { label: e.target.value })}
                  />
                  <select
                    className={ADMIN_FORM_CONTROL}
                    disabled={!canEdit}
                    value={line.pricing_unit}
                    onChange={(e) =>
                      updateLine(i, { pricing_unit: e.target.value as OfferLineDraft["pricing_unit"] })
                    }
                  >
                    <option value="event">event</option>
                    <option value="hour">hour</option>
                    <option value="day">day</option>
                    <option value="week">week</option>
                  </select>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="Units"
                    className={ADMIN_FORM_CONTROL}
                    disabled={!canEdit}
                    value={line.units}
                    onChange={(e) => updateLine(i, { units: Number(e.target.value) || 0 })}
                  />
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="Unit price (client)"
                    className={ADMIN_FORM_CONTROL}
                    disabled={!canEdit}
                    value={line.unit_price}
                    onChange={(e) => updateLine(i, { unit_price: Number(e.target.value) || 0 })}
                  />
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="Line total (client)"
                    className={ADMIN_FORM_CONTROL}
                    disabled={!canEdit}
                    value={line.total_price}
                    onChange={(e) => updateLine(i, { total_price: Number(e.target.value) || 0 })}
                  />
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="Talent cost"
                    className={ADMIN_FORM_CONTROL}
                    disabled={!canEdit}
                    value={line.talent_cost}
                    onChange={(e) => updateLine(i, { talent_cost: Number(e.target.value) || 0 })}
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" variant="secondary" disabled={!canEdit || pending}>
            Save draft
          </Button>
          <p className="text-xs text-muted-foreground">Save draft before sending — send uses the saved version.</p>
          <p className="text-[11px] text-muted-foreground">
            Current versions: inquiry v{inqVersion} · offer v{offerVersion}
          </p>
        </div>
      </form>

      {canEdit ? (
        <form onSubmit={handleSendOffer} className="flex flex-wrap gap-2 border-t border-border/40 pt-4">
          <input type="hidden" name="inquiry_id" value={inquiryId} />
          <input type="hidden" name="offer_id" value={offer.id} />
          <input type="hidden" name="inquiry_version" value={inqVersion} />
          <input type="hidden" name="offer_version" value={offerVersion} />
          <Button
            type="submit"
            disabled={pending}
            className="bg-[var(--impronta-gold)] text-[var(--impronta-gold-foreground)]"
          >
            Send offer to client
          </Button>
        </form>
      ) : (
        <p className="text-xs text-muted-foreground">
          Offer status: <span className="font-medium text-foreground">{offer.status}</span> — create a new draft from
          the engine / API to revise.
        </p>
      )}
    </div>
  );
}
