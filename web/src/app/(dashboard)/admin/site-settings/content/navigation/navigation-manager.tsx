"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  deleteCmsNavigationItem,
  saveCmsNavigationItem,
} from "./actions";

export type NavRow = {
  id: string;
  locale: string;
  zone: string;
  label: string;
  href: string;
  sort_order: number;
  visible: boolean;
};

export function NavigationManager({ initialRows }: { initialRows: NavRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [locale, setLocale] = useState<"en" | "es">("en");
  const [zone, setZone] = useState<"header" | "footer">("header");
  const [label, setLabel] = useState("");
  const [href, setHref] = useState("");
  const [sortOrder, setSortOrder] = useState(0);
  const [visible, setVisible] = useState(true);

  function addRow() {
    setError(null);
    startTransition(async () => {
      const res = await saveCmsNavigationItem({
        locale,
        zone,
        label,
        href,
        sort_order: sortOrder,
        visible,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setLabel("");
      setHref("");
      setSortOrder(0);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-border/60 text-muted-foreground">
              <th className="py-2 pr-2 font-medium">Locale</th>
              <th className="py-2 pr-2 font-medium">Zone</th>
              <th className="py-2 pr-2 font-medium">Label</th>
              <th className="py-2 pr-2 font-medium">Href</th>
              <th className="py-2 pr-2 font-medium">Order</th>
              <th className="py-2 pr-2 font-medium">Visible</th>
              <th className="py-2 font-medium"> </th>
            </tr>
          </thead>
          <tbody>
            {initialRows.map((r) => (
              <EditableRow key={r.id} row={r} pending={pending} onRefresh={() => router.refresh()} />
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-md border border-border/60 p-4">
        <p className="mb-3 text-sm font-medium text-foreground">Add link</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1">
            <Label>Locale</Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={locale}
              onChange={(e) => setLocale(e.target.value as "en" | "es")}
            >
              <option value="en">en</option>
              <option value="es">es</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label>Zone</Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={zone}
              onChange={(e) => setZone(e.target.value as "header" | "footer")}
            >
              <option value="header">header</option>
              <option value="footer">footer</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label>Sort order</Label>
            <Input
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(Number(e.target.value) || 0)}
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label>Label</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label>Href</Label>
            <Input
              value={href}
              onChange={(e) => setHref(e.target.value)}
              placeholder="/directory or https://…"
              className="font-mono text-xs"
            />
          </div>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              checked={visible}
              onChange={(e) => setVisible(e.target.checked)}
            />
            Visible to public
          </label>
        </div>
        <Button type="button" className="mt-3" onClick={addRow} disabled={pending}>
          Add
        </Button>
      </div>
    </div>
  );
}

function EditableRow({
  row,
  pending,
  onRefresh,
}: {
  row: NavRow;
  pending: boolean;
  onRefresh: () => void;
}) {
  const [, startTransition] = useTransition();
  const [locale, setLocale] = useState(row.locale);
  const [zone, setZone] = useState(row.zone);
  const [label, setLabel] = useState(row.label);
  const [href, setHref] = useState(row.href);
  const [sortOrder, setSortOrder] = useState(row.sort_order);
  const [visible, setVisible] = useState(row.visible);

  useEffect(() => {
    setLocale(row.locale);
    setZone(row.zone);
    setLabel(row.label);
    setHref(row.href);
    setSortOrder(row.sort_order);
    setVisible(row.visible);
  }, [row]);

  function save() {
    startTransition(async () => {
      const res = await saveCmsNavigationItem({
        id: row.id,
        locale: locale as "en" | "es",
        zone: zone as "header" | "footer",
        label,
        href,
        sort_order: sortOrder,
        visible,
      });
      if (res.ok) onRefresh();
    });
  }

  function remove() {
    if (!window.confirm("Remove this link?")) return;
    startTransition(async () => {
      const res = await deleteCmsNavigationItem(row.id);
      if (res.ok) onRefresh();
    });
  }

  return (
    <tr className="border-b border-border/40">
      <td className="py-2 pr-2">
        <select
          className="max-w-[5rem] rounded border border-input bg-background px-1 py-1 text-xs"
          value={locale}
          onChange={(e) => setLocale(e.target.value)}
        >
          <option value="en">en</option>
          <option value="es">es</option>
        </select>
      </td>
      <td className="py-2 pr-2">
        <select
          className="max-w-[6rem] rounded border border-input bg-background px-1 py-1 text-xs"
          value={zone}
          onChange={(e) => setZone(e.target.value)}
        >
          <option value="header">header</option>
          <option value="footer">footer</option>
        </select>
      </td>
      <td className="py-2 pr-2">
        <Input className="h-8 text-xs" value={label} onChange={(e) => setLabel(e.target.value)} />
      </td>
      <td className="py-2 pr-2">
        <Input
          className="h-8 font-mono text-xs"
          value={href}
          onChange={(e) => setHref(e.target.value)}
        />
      </td>
      <td className="py-2 pr-2">
        <Input
          type="number"
          className="h-8 w-16 text-xs"
          value={sortOrder}
          onChange={(e) => setSortOrder(Number(e.target.value) || 0)}
        />
      </td>
      <td className="py-2 pr-2">
        <input
          type="checkbox"
          checked={visible}
          onChange={(e) => setVisible(e.target.checked)}
        />
      </td>
      <td className="py-2">
        <div className="flex flex-wrap gap-1">
          <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={save}>
            Save
          </Button>
          <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={remove}>
            Delete
          </Button>
        </div>
      </td>
    </tr>
  );
}
