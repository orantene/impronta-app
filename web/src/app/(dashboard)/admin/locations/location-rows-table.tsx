"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  ADMIN_FORM_CONTROL,
  ADMIN_TABLE_HEAD,
  ADMIN_TABLE_ROW_INTERACTIVE,
  ADMIN_TABLE_TH,
  ADMIN_TABLE_WRAP,
  LUXURY_GOLD_BUTTON_CLASS,
} from "@/lib/dashboard-shell-classes";
import { cn } from "@/lib/utils";
import { archiveLocationForm, restoreLocationForm, updateLocationForm } from "./actions";

export type LocationRow = {
  id: string;
  country_code: string;
  city_slug: string;
  display_name_en: string;
  display_name_es: string | null;
  archived_at: string | null;
};

export function LocationRowsTable({ locations }: { locations: LocationRow[] }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const editing = locations.find((l) => l.id === editingId && !l.archived_at) ?? null;

  return (
    <>
      <div className={cn(ADMIN_TABLE_WRAP, "hidden md:block")}>
        <table className="w-full border-collapse text-sm">
          <thead className={ADMIN_TABLE_HEAD}>
            <tr className="border-b border-border/45 text-left">
              <th className={ADMIN_TABLE_TH}>Country</th>
              <th className={ADMIN_TABLE_TH}>City slug</th>
              <th className={ADMIN_TABLE_TH}>Name (EN)</th>
              <th className={ADMIN_TABLE_TH}>Name (ES)</th>
              <th className={ADMIN_TABLE_TH}>Status</th>
              <th className="px-4 py-3.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border/25">
            {locations.map((loc) => (
              <tr key={loc.id} className={ADMIN_TABLE_ROW_INTERACTIVE}>
                <td className="px-4 py-3 align-top">
                  {loc.archived_at ? (
                    <span className="font-mono text-[12px] text-muted-foreground">{loc.country_code}</span>
                  ) : (
                    <form id={`update-location-${loc.id}`} action={updateLocationForm}>
                      <input type="hidden" name="location_id" value={loc.id} />
                      <Input
                        name="country_code"
                        defaultValue={loc.country_code}
                        required
                        className={cn(ADMIN_FORM_CONTROL, "h-9 font-mono text-[12px]")}
                      />
                    </form>
                  )}
                </td>
                <td className="px-4 py-3 align-top">
                  {loc.archived_at ? (
                    <span className="font-mono text-[12px] text-muted-foreground">{loc.city_slug}</span>
                  ) : (
                    <Input
                      form={`update-location-${loc.id}`}
                      name="city_slug"
                      defaultValue={loc.city_slug}
                      required
                      className={cn(ADMIN_FORM_CONTROL, "h-9 font-mono text-[12px]")}
                    />
                  )}
                </td>
                <td className="px-4 py-3 align-top">
                  {loc.archived_at ? (
                    loc.display_name_en
                  ) : (
                    <Input
                      form={`update-location-${loc.id}`}
                      name="display_name_en"
                      defaultValue={loc.display_name_en}
                      required
                      className={cn(ADMIN_FORM_CONTROL, "h-9")}
                    />
                  )}
                </td>
                <td className="px-4 py-3 align-top text-muted-foreground">
                  {loc.archived_at ? (
                    loc.display_name_es ?? "—"
                  ) : (
                    <Input
                      form={`update-location-${loc.id}`}
                      name="display_name_es"
                      defaultValue={loc.display_name_es ?? ""}
                      className={cn(ADMIN_FORM_CONTROL, "h-9")}
                    />
                  )}
                </td>
                <td className="px-4 py-3">
                  {loc.archived_at ? (
                    <Badge variant="muted">Archived</Badge>
                  ) : (
                    <Badge variant="success">Active</Badge>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  {loc.archived_at ? (
                    <form action={restoreLocationForm}>
                      <input type="hidden" name="location_id" value={loc.id} />
                      <Button
                        type="submit"
                        variant="ghost"
                        size="sm"
                        className="h-10 text-muted-foreground hover:text-emerald-400 sm:h-9"
                      >
                        Restore
                      </Button>
                    </form>
                  ) : (
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        type="submit"
                        form={`update-location-${loc.id}`}
                        variant="ghost"
                        size="sm"
                        className="h-10 text-muted-foreground hover:text-[var(--impronta-gold)] sm:h-9"
                      >
                        Save
                      </Button>
                      <form action={archiveLocationForm}>
                        <input type="hidden" name="location_id" value={loc.id} />
                        <Button
                          type="submit"
                          variant="ghost"
                          size="sm"
                          className="h-10 text-muted-foreground hover:text-destructive sm:h-9"
                        >
                          Archive
                        </Button>
                      </form>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="space-y-3 md:hidden" aria-label="Locations (mobile)">
        {locations.map((loc) => (
          <li
            key={loc.id}
            className="rounded-2xl border border-border/50 bg-card/50 p-4 shadow-sm"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <p className="font-display text-base font-medium text-foreground">{loc.display_name_en}</p>
                <p className="font-mono text-xs text-muted-foreground">
                  {loc.country_code} · {loc.city_slug}
                </p>
                {loc.display_name_es ? (
                  <p className="text-sm text-muted-foreground">ES: {loc.display_name_es}</p>
                ) : null}
                {loc.archived_at ? (
                  <Badge variant="muted" className="mt-1">
                    Archived
                  </Badge>
                ) : (
                  <Badge variant="success" className="mt-1">
                    Active
                  </Badge>
                )}
              </div>
              <div className="flex shrink-0 flex-col gap-2">
                {loc.archived_at ? (
                  <form action={restoreLocationForm}>
                    <input type="hidden" name="location_id" value={loc.id} />
                    <Button type="submit" variant="outline" className="h-11 min-w-[7rem] rounded-xl">
                      Restore
                    </Button>
                  </form>
                ) : (
                  <Button
                    type="button"
                    className={cn("h-11 min-w-[7rem] rounded-xl border-0", LUXURY_GOLD_BUTTON_CLASS)}
                    onClick={() => setEditingId(loc.id)}
                  >
                    Edit
                  </Button>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>

      <Sheet
        open={editing != null}
        onOpenChange={(open) => {
          if (!open) setEditingId(null);
        }}
      >
        <SheetContent side="bottom" className="max-h-[min(90dvh,640px)] overflow-y-auto rounded-t-2xl">
          {editing ? (
            <>
              <SheetHeader>
                <SheetTitle>Edit location</SheetTitle>
                <SheetDescription>
                  {editing.display_name_en} — {editing.country_code}/{editing.city_slug}
                </SheetDescription>
              </SheetHeader>
              <form
                className="space-y-4 px-1 pb-2"
                action={(fd) => {
                  startTransition(async () => {
                    await updateLocationForm(fd);
                    setEditingId(null);
                  });
                }}
              >
                <input type="hidden" name="location_id" value={editing.id} />
                <div className="space-y-1.5">
                  <Label htmlFor="m-country">Country code</Label>
                  <Input
                    id="m-country"
                    name="country_code"
                    defaultValue={editing.country_code}
                    required
                    className={cn(ADMIN_FORM_CONTROL, "h-11 font-mono text-sm")}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="m-slug">City slug</Label>
                  <Input
                    id="m-slug"
                    name="city_slug"
                    defaultValue={editing.city_slug}
                    required
                    className={cn(ADMIN_FORM_CONTROL, "h-11 font-mono text-sm")}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="m-en">Name (EN)</Label>
                  <Input
                    id="m-en"
                    name="display_name_en"
                    defaultValue={editing.display_name_en}
                    required
                    className={cn(ADMIN_FORM_CONTROL, "h-11")}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="m-es">Name (ES)</Label>
                  <Input
                    id="m-es"
                    name="display_name_es"
                    defaultValue={editing.display_name_es ?? ""}
                    className={cn(ADMIN_FORM_CONTROL, "h-11")}
                  />
                </div>
                <Button
                  type="submit"
                  disabled={isPending}
                  className={cn("h-11 w-full rounded-xl", LUXURY_GOLD_BUTTON_CLASS)}
                >
                  {isPending ? "Saving…" : "Save changes"}
                </Button>
              </form>
              <form
                className="px-1 pb-4"
                action={(fd) => {
                  startTransition(async () => {
                    await archiveLocationForm(fd);
                    setEditingId(null);
                  });
                }}
              >
                <input type="hidden" name="location_id" value={editing.id} />
                <Button
                  type="submit"
                  variant="outline"
                  disabled={isPending}
                  className="h-11 w-full rounded-xl border-destructive/40 text-destructive hover:bg-destructive/10"
                >
                  Archive location
                </Button>
              </form>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  );
}
