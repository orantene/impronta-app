"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  archiveLocale,
  refreshTranslationInventory,
  setDefaultLocale,
  updateLocaleFallback,
  updateLocaleFallbackMode,
  updateLocalePublicSwitcherMode,
  upsertAppLocale,
} from "@/app/(dashboard)/admin/settings/languages/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ADMIN_FORM_CONTROL,
  ADMIN_OUTLINE_CONTROL_CLASS,
  ADMIN_SECTION_TITLE_CLASS,
} from "@/lib/dashboard-shell-classes";
import type {
  AppLocaleRow,
  LocaleFallbackMode,
  LocalePublicSwitcherMode,
} from "@/lib/language-settings/types";

type Props = {
  locales: AppLocaleRow[];
  fallbackMode: LocaleFallbackMode;
  publicSwitcherMode: LocalePublicSwitcherMode;
  inventoryVersion: number;
  inventoryRefreshedAt: string | null;
};

export function LanguagesAdminClient({
  locales,
  fallbackMode,
  publicSwitcherMode,
  inventoryVersion,
  inventoryRefreshedAt,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState({
    code: "",
    label_native: "",
    label_en: "",
    enabled_admin: true,
    enabled_public: false,
    sort_order: 100,
    fallback_locale: "",
  });

  const run = (fn: () => Promise<{ error?: string; success?: true }>) => {
    startTransition(async () => {
      const res = await fn();
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Saved");
      router.refresh();
    });
  };

  return (
    <div className="space-y-10">
      <section className="space-y-4">
        <h2 className={ADMIN_SECTION_TITLE_CLASS}>Global behavior</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label htmlFor="fb-mode">Fallback mode</Label>
            <select
              id="fb-mode"
              className={`${ADMIN_FORM_CONTROL} ${ADMIN_OUTLINE_CONTROL_CLASS} mt-1 h-10`}
              defaultValue={fallbackMode}
              disabled={pending}
              onChange={(e) =>
                run(() => updateLocaleFallbackMode(e.target.value))
              }
            >
              <option value="default_then_chain">Default, then per-locale chain</option>
              <option value="chain_only">Per-locale chain only</option>
              <option value="default_only">Site default only</option>
            </select>
          </div>
          <div>
            <Label htmlFor="sw-mode">Public switcher</Label>
            <select
              id="sw-mode"
              className={`${ADMIN_FORM_CONTROL} ${ADMIN_OUTLINE_CONTROL_CLASS} mt-1 h-10`}
              defaultValue={publicSwitcherMode}
              disabled={pending}
              onChange={(e) =>
                run(() => updateLocalePublicSwitcherMode(e.target.value))
              }
            >
              <option value="prefix">URL prefix</option>
              <option value="cookie">Cookie</option>
              <option value="both">Both</option>
            </select>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border/50 bg-muted/10 px-4 py-3 text-sm">
          <span className="text-muted-foreground">
            Translation inventory v<strong className="text-foreground">{inventoryVersion}</strong>
            {inventoryRefreshedAt ? (
              <span className="ml-2 font-mono text-xs">· last refresh {inventoryRefreshedAt}</span>
            ) : null}
          </span>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={pending}
            onClick={() => run(() => refreshTranslationInventory())}
          >
            Refresh translation inventory
          </Button>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className={ADMIN_SECTION_TITLE_CLASS}>Languages</h2>
        <div className="overflow-x-auto rounded-xl border border-border/50">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b border-border/50 bg-muted/20 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Code</th>
                <th className="px-3 py-2">Labels</th>
                <th className="px-3 py-2">Admin</th>
                <th className="px-3 py-2">Public</th>
                <th className="px-3 py-2">Default</th>
                <th className="px-3 py-2">Fallback</th>
                <th className="px-3 py-2">Order</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {locales.map((row) => (
                <tr key={row.code} className="border-b border-border/40">
                  <td className="px-3 py-2 font-mono text-xs">{row.code}</td>
                  <td className="px-3 py-2">
                    <div>{row.label_native}</div>
                    <div className="text-xs text-muted-foreground">{row.label_en}</div>
                  </td>
                  <td className="px-3 py-2">{row.enabled_admin ? "Yes" : "No"}</td>
                  <td className="px-3 py-2">{row.enabled_public ? "Yes" : "No"}</td>
                  <td className="px-3 py-2">{row.is_default ? "Yes" : "—"}</td>
                  <td className="px-3 py-2">
                    <form
                      className="flex items-center gap-1"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const fd = new FormData(e.currentTarget);
                        const fb = String(fd.get("fallback") ?? "").trim();
                        run(() =>
                          updateLocaleFallback({
                            code: row.code,
                            fallback_locale: fb.length > 0 ? fb : null,
                          }),
                        );
                      }}
                    >
                      <Input
                        name="fallback"
                        defaultValue={row.fallback_locale ?? ""}
                        className="h-8 max-w-[120px] font-mono text-xs"
                        placeholder="e.g. en"
                        disabled={pending}
                      />
                      <Button type="submit" size="sm" variant="outline" disabled={pending}>
                        Set
                      </Button>
                    </form>
                  </td>
                  <td className="px-3 py-2">{row.sort_order}</td>
                  <td className="px-3 py-2 text-right">
                    {!row.is_default ? (
                      <div className="flex flex-wrap justify-end gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={pending}
                          onClick={() => run(() => setDefaultLocale(row.code))}
                        >
                          Make default
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          disabled={pending}
                          onClick={() => run(() => archiveLocale(row.code))}
                        >
                          Archive
                        </Button>
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className={ADMIN_SECTION_TITLE_CLASS}>Add or update language</h2>
        <p className="text-sm text-muted-foreground">
          Upsert by code. Disabling public keeps data but hides the locale from the public switcher and prefixed URLs.
        </p>
        <form
          className="grid max-w-xl gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            run(() =>
              upsertAppLocale({
                code: form.code,
                label_native: form.label_native,
                label_en: form.label_en,
                enabled_admin: form.enabled_admin,
                enabled_public: form.enabled_public,
                sort_order: form.sort_order,
                fallback_locale: form.fallback_locale.trim() || null,
              }),
            );
          }}
        >
          <div>
            <Label htmlFor="code">Code</Label>
            <Input
              id="code"
              className="mt-1 font-mono"
              value={form.code}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
              placeholder="fr"
              required
              disabled={pending}
            />
          </div>
          <div>
            <Label htmlFor="label_native">Label (native)</Label>
            <Input
              id="label_native"
              className="mt-1"
              value={form.label_native}
              onChange={(e) => setForm((f) => ({ ...f, label_native: e.target.value }))}
              required
              disabled={pending}
            />
          </div>
          <div>
            <Label htmlFor="label_en">Label (English)</Label>
            <Input
              id="label_en"
              className="mt-1"
              value={form.label_en}
              onChange={(e) => setForm((f) => ({ ...f, label_en: e.target.value }))}
              required
              disabled={pending}
            />
          </div>
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.enabled_admin}
                onChange={(e) => setForm((f) => ({ ...f, enabled_admin: e.target.checked }))}
                disabled={pending}
              />
              Enabled (admin)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.enabled_public}
                onChange={(e) => setForm((f) => ({ ...f, enabled_public: e.target.checked }))}
                disabled={pending}
              />
              Enabled (public)
            </label>
          </div>
          <div>
            <Label htmlFor="sort_order">Sort order</Label>
            <Input
              id="sort_order"
              type="number"
              className="mt-1 w-32"
              value={form.sort_order}
              onChange={(e) => setForm((f) => ({ ...f, sort_order: Number(e.target.value) || 0 }))}
              disabled={pending}
            />
          </div>
          <div>
            <Label htmlFor="fallback_locale">Fallback locale (optional)</Label>
            <Input
              id="fallback_locale"
              className="mt-1 font-mono"
              value={form.fallback_locale}
              onChange={(e) => setForm((f) => ({ ...f, fallback_locale: e.target.value }))}
              placeholder="en"
              disabled={pending}
            />
          </div>
          <Button type="submit" disabled={pending}>
            Save language
          </Button>
        </form>
      </section>
    </div>
  );
}
