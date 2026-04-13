"use client";

import { useActionState } from "react";
import {
  addBookingTalentRow,
  deleteBookingTalentRow,
  saveBookingTalentRow,
  type BookingActionState,
} from "@/app/(dashboard)/admin/bookings/actions";
import { ADMIN_FORM_CONTROL } from "@/lib/dashboard-shell-classes";
import { PRICING_UNIT_VALUES } from "@/lib/admin/validation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Line = {
  id: string;
  talent_profile_id: string | null;
  talent_name_snapshot: string | null;
  profile_code_snapshot: string | null;
  role_label: string | null;
  pricing_unit: string;
  units: number;
  talent_cost_rate: number;
  client_charge_rate: number;
  talent_cost_total: number;
  client_charge_total: number;
  gross_profit: number;
  notes: string | null;
};

type TalentOption = { id: string; profile_code: string; display_name: string | null };

function RowForm({ bookingId, line }: { bookingId: string; line: Line }) {
  const [state, formAction] = useActionState(saveBookingTalentRow, undefined);
  return (
    <tr className="border-b border-border/30 align-top">
      <td className="py-2 pr-2 text-xs text-muted-foreground">
        <div className="font-medium text-foreground">
          {line.profile_code_snapshot ?? "—"}
          {line.talent_name_snapshot ? (
            <span className="block text-muted-foreground">{line.talent_name_snapshot}</span>
          ) : null}
        </div>
      </td>
      <td className="py-2 pr-2">
        <form action={formAction} className="space-y-2">
          <input type="hidden" name="booking_talent_id" value={line.id} />
          <input type="hidden" name="booking_id" value={bookingId} />
          <div className="grid grid-cols-2 gap-x-2 gap-y-1.5">
            <div className="col-span-2 space-y-0.5">
              <Label className="text-[10px] font-normal text-muted-foreground">Role</Label>
              <Input name="role_label" defaultValue={line.role_label ?? ""} placeholder="e.g. Host" className="h-8 text-xs" />
            </div>
            <div className="space-y-0.5">
              <Label className="text-[10px] font-normal text-muted-foreground">Unit type</Label>
              <select name="pricing_unit" defaultValue={line.pricing_unit} className={cn(ADMIN_FORM_CONTROL, "h-8 text-xs")}>
                {PRICING_UNIT_VALUES.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-0.5">
              <Label className="text-[10px] font-normal text-muted-foreground">Units</Label>
              <Input name="units" type="number" step="0.01" min={0} defaultValue={line.units} className="h-8 text-xs" />
            </div>
            <div className="space-y-0.5">
              <Label className="text-[10px] font-normal text-muted-foreground">Cost rate</Label>
              <Input
                name="talent_cost_rate"
                type="number"
                step="0.01"
                defaultValue={line.talent_cost_rate}
                className="h-8 text-xs"
                title="Internal cost per unit"
              />
            </div>
            <div className="space-y-0.5">
              <Label className="text-[10px] font-normal text-muted-foreground">Client rate</Label>
              <Input
                name="client_charge_rate"
                type="number"
                step="0.01"
                defaultValue={line.client_charge_rate}
                className="h-8 text-xs"
                title="Client charge per unit"
              />
            </div>
            <div className="col-span-2 space-y-0.5">
              <Label className="text-[10px] font-normal text-muted-foreground">Notes</Label>
              <Input name="notes" defaultValue={line.notes ?? ""} placeholder="Internal" className="h-8 text-xs" />
            </div>
          </div>
          {state?.error ? <p className="text-[10px] text-destructive">{state.error}</p> : null}
          <Button type="submit" size="sm" variant="secondary" className="h-7 w-full text-xs">
            Save row
          </Button>
        </form>
      </td>
      <td className="py-2 pr-2 text-right text-xs tabular-nums text-muted-foreground">
        {Number(line.talent_cost_total).toFixed(2)}
      </td>
      <td className="py-2 pr-2 text-right text-xs tabular-nums text-muted-foreground">
        {Number(line.client_charge_total).toFixed(2)}
      </td>
      <td className="py-2 pr-2 text-right text-xs tabular-nums">{Number(line.gross_profit).toFixed(2)}</td>
      <td className="py-2">
        <form
          action={async (fd) => {
            await deleteBookingTalentRow(undefined, fd);
          }}
        >
          <input type="hidden" name="booking_talent_id" value={line.id} />
          <input type="hidden" name="booking_id" value={bookingId} />
          <Button type="submit" variant="ghost" size="sm" className="h-7 text-xs text-destructive">
            Remove
          </Button>
        </form>
      </td>
    </tr>
  );
}

export function BookingTalentGrid({
  bookingId,
  lines,
  talentOptions,
  currencyCode,
  headerTotals,
}: {
  bookingId: string;
  lines: Line[];
  talentOptions: TalentOption[];
  currencyCode: string;
  headerTotals: { total_talent_cost: number; total_client_revenue: number; gross_profit: number };
}) {
  const [addState, addAction] = useActionState(addBookingTalentRow, undefined as BookingActionState);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-md border border-border/45 bg-muted/15 p-3 text-sm">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total cost</p>
          <p className="tabular-nums text-foreground">
            {currencyCode} {headerTotals.total_talent_cost.toFixed(2)}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total revenue</p>
          <p className="tabular-nums text-foreground">
            {currencyCode} {headerTotals.total_client_revenue.toFixed(2)}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total margin</p>
          <p className="tabular-nums text-foreground">
            {currencyCode} {headerTotals.gross_profit.toFixed(2)}
          </p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[800px] border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm">
            <tr className="border-b border-border/45 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <th className="pb-2 pr-2">Talent</th>
              <th className="pb-2 pr-2">Role &amp; pricing</th>
              <th className="pb-2 pr-2 text-right">Row cost</th>
              <th className="pb-2 pr-2 text-right">Row revenue</th>
              <th className="pb-2 pr-2 text-right">Margin</th>
              <th className="pb-2"> </th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <RowForm key={line.id} bookingId={bookingId} line={line} />
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-md border border-dashed border-border/45 p-4">
        <Label className="text-sm font-medium">Add lineup row</Label>
        <form action={addAction} className="mt-2 flex flex-wrap items-end gap-2">
          <input type="hidden" name="booking_id" value={bookingId} />
          <select name="talent_profile_id" required className={cn(ADMIN_FORM_CONTROL, "min-w-[240px] max-w-md")}>
            <option value="">Select talent…</option>
            {talentOptions.map((t) => (
              <option key={t.id} value={t.id}>
                {t.profile_code} · {t.display_name ?? "—"}
              </option>
            ))}
          </select>
          <Button type="submit" size="sm" variant="secondary">
            Add
          </Button>
        </form>
        {addState?.error ? <p className="mt-2 text-xs text-destructive">{addState.error}</p> : null}
      </div>
    </div>
  );
}
