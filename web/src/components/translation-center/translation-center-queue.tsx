"use client";

/**
 * Translation Center work queue + **admin quick-edit sheet** (Radix Sheet).
 * The load/save contract is server-driven via `translation-center-quick-edit-actions`;
 * reuse the same pattern outside translations by calling those actions from another route.
 */

import Link from "next/link";
import { ExternalLink, Pencil } from "lucide-react";
import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  applyTranslationQuickEditSave,
  loadTranslationQuickEditPayload,
  type TranslationQuickEditPayload,
} from "@/app/(dashboard)/admin/translations/translation-center-quick-edit-actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { ADMIN_DRAWER_CLASS_WIDE } from "@/lib/admin/admin-drawer-classes";
import { detectLocaleHint } from "@/lib/translation-center/save/locale-hint";
import type { TranslationUnitDTO } from "@/lib/translation-center/types";
import { cn } from "@/lib/utils";

function BioLocaleHint({ text, expectEn }: { text: string; expectEn: boolean }) {
  const t = text.trim();
  if (!t) return null;
  const hint = detectLocaleHint(t);
  if (hint === "unknown" || hint === "mixed") return null;
  const mismatch = expectEn ? hint === "es" : hint === "en";
  if (!mismatch) return null;
  return (
    <p className="text-xs text-amber-700 dark:text-amber-300/90">
      Language check: this text reads like {hint === "es" ? "Spanish" : "English"} — confirm the correct
      locale column.
    </p>
  );
}

function healthLabel(health: string): string {
  switch (health) {
    case "missing":
      return "Missing";
    case "complete":
      return "Complete";
    case "language_issue":
      return "Language issue";
    case "needs_attention":
      return "Needs attention";
    default:
      return health.replaceAll("_", " ");
  }
}

function healthBadgeClass(health: string): string {
  switch (health) {
    case "missing":
      return "border-rose-600/50 bg-rose-500/12 text-rose-900 dark:text-rose-50";
    case "needs_attention":
      return "border-orange-500/50 bg-orange-500/12 text-orange-950 dark:text-orange-50";
    case "language_issue":
      return "border-fuchsia-600/50 bg-fuchsia-500/12 text-fuchsia-950 dark:text-fuchsia-50";
    case "complete":
      return "border-emerald-600/50 bg-emerald-600/12 text-emerald-900 dark:text-emerald-100";
    default:
      return "border-border/60 bg-muted/25 text-muted-foreground";
  }
}

export function TranslationCenterQueue({ units }: { units: TranslationUnitDTO[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [unit, setUnit] = useState<TranslationUnitDTO | null>(null);
  const [payload, setPayload] = useState<TranslationQuickEditPayload | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  const close = useCallback(() => {
    setOpen(false);
    setUnit(null);
    setPayload(null);
    setFields({});
  }, []);

  useEffect(() => {
    if (!open || !unit) return;
    let cancelled = false;
    setPayload(null);
    void (async () => {
      const res = await loadTranslationQuickEditPayload({
        adapterId: unit.adapterId,
        entityId: unit.entityId,
        parentEntityId: unit.parentEntityId ?? null,
      });
      if (cancelled) return;
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      setPayload(res.data);
      setFields({ ...res.data.fields });
    })();
    return () => {
      cancelled = true;
    };
  }, [open, unit]);

  const openFor = (u: TranslationUnitDTO) => {
    setUnit(u);
    setOpen(true);
  };

  const save = (saveKind: TranslationUnitDTO["inlineEdit"]["save_action"]) => {
    if (!unit) return;
    startTransition(async () => {
      const res = await applyTranslationQuickEditSave({
        saveKind,
        entityId: unit.entityId,
        parentEntityId: unit.parentEntityId ?? null,
        fields,
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Saved");
      router.refresh();
      close();
    });
  };

  return (
    <>
      <div className="overflow-x-auto rounded-2xl border border-border/50">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className={cn("bg-muted/30", "text-xs uppercase tracking-wide text-muted-foreground")}>
            <tr>
              <th className="px-4 py-3 font-medium">Item</th>
              <th className="px-4 py-3 font-medium">Domain</th>
              <th className="px-4 py-3 font-medium">Health</th>
              <th className="px-4 py-3 font-medium">Locales</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {units.map((u) => (
              <tr key={`${u.domainId}:${u.entityId}:${u.fieldKey}`} className="border-t border-border/40">
                <td className="px-4 py-3 font-medium text-foreground">{u.displayLabel}</td>
                <td className="px-4 py-3 text-muted-foreground">{u.domainId}</td>
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      "inline-flex rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                      healthBadgeClass(u.health),
                    )}
                  >
                    {healthLabel(u.health)}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{u.localeSummary}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="default"
                      className="h-8 gap-1 rounded-lg"
                      onClick={() => openFor(u)}
                    >
                      <Pencil className="size-3.5" aria-hidden />
                      Edit
                    </Button>
                    <Button asChild size="sm" variant="outline" className="h-8 gap-1 rounded-lg">
                      <Link href={u.inlineEdit.open_full_editor_url}>
                        <ExternalLink className="size-3.5" aria-hidden />
                        Full page
                      </Link>
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Sheet open={open} onOpenChange={(v) => (!v ? close() : setOpen(true))}>
        <SheetContent side="right" className={cn(ADMIN_DRAWER_CLASS_WIDE, "flex flex-col overflow-y-auto")}>
          <SheetHeader>
            <SheetTitle>{payload?.title ?? "Edit translation"}</SheetTitle>
            {payload?.subtitle ? <SheetDescription>{payload.subtitle}</SheetDescription> : null}
          </SheetHeader>

          {!payload ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : unit && !unit.inlineEdit.can_inline_edit ? (
            <div className="space-y-4 py-2 text-sm text-muted-foreground">
              <p>Inline editing is not available for this item.</p>
              <Button asChild variant="secondary">
                <Link href={unit.inlineEdit.open_full_editor_url}>Open full editor</Link>
              </Button>
            </div>
          ) : unit && payload ? (
            <div className="flex flex-1 flex-col gap-4 py-2">
              {unit.inlineEdit.editor_fields.map((f) => {
                if (f.kind === "readonly") {
                  return (
                    <div key={f.key}>
                      <Label className="text-muted-foreground">{f.label}</Label>
                      <p className="mt-1 whitespace-pre-wrap rounded-lg border border-border/50 bg-muted/25 px-3 py-2 text-sm">
                        {fields[f.key] || "—"}
                      </p>
                    </div>
                  );
                }
                return (
                  <div key={f.key}>
                    <Label htmlFor={`qe-${f.key}`}>{f.label}</Label>
                    <Textarea
                      id={`qe-${f.key}`}
                      className="mt-1 min-h-[88px] rounded-lg"
                      value={fields[f.key] ?? ""}
                      disabled={pending}
                      onChange={(e) => setFields((prev) => ({ ...prev, [f.key]: e.target.value }))}
                    />
                    {unit.adapterId === "talentBio" && f.key === "bio_en" ? (
                      <BioLocaleHint text={fields.bio_en ?? ""} expectEn />
                    ) : null}
                    {unit.adapterId === "talentBio" && f.key === "bio_es" ? (
                      <BioLocaleHint text={fields.bio_es ?? ""} expectEn={false} />
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Could not open editor.</p>
          )}

          <SheetFooter className="mt-auto flex flex-col gap-2 border-t border-border/40 pt-4 sm:flex-row sm:justify-end">
            {unit && unit.inlineEdit.can_inline_edit && payload ? (
              <>
                <Button type="button" variant="outline" disabled={pending} onClick={() => close()}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled={pending || unit.inlineEdit.save_action === "none"}
                  onClick={() => save(unit.inlineEdit.save_action)}
                >
                  Save
                </Button>
              </>
            ) : (
              <Button type="button" variant="outline" onClick={() => close()}>
                Close
              </Button>
            )}
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}
