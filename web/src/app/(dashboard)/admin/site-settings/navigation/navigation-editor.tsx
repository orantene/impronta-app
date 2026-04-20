"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type {
  NavItemRow,
  NavMenuRow,
} from "@/lib/site-admin/server/navigation";
import type { NavZone } from "@/lib/site-admin/forms/navigation";
import { NAV_ZONES } from "@/lib/site-admin/forms/navigation";
import type { Locale } from "@/lib/site-admin/locales";

import {
  deleteNavItemAction,
  publishNavigationAction,
  saveNavItemAction,
  type NavActionState,
} from "./actions";

interface Props {
  canEdit: boolean;
  canPublish: boolean;
  zone: NavZone;
  locale: Locale;
  supportedLocales: readonly Locale[];
  items: NavItemRow[];
  menu: NavMenuRow | null;
}

interface NodeView {
  row: NavItemRow;
  children: NodeView[];
}

function buildView(items: NavItemRow[]): NodeView[] {
  const byId = new Map<string, NodeView>();
  const roots: NodeView[] = [];
  for (const row of items) {
    byId.set(row.id, { row, children: [] });
  }
  for (const row of items) {
    const node = byId.get(row.id)!;
    if (row.parent_id && byId.has(row.parent_id)) {
      byId.get(row.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  // Sort each level by sort_order.
  function sortLevel(list: NodeView[]) {
    list.sort((a, b) => a.row.sort_order - b.row.sort_order);
    list.forEach((n) => sortLevel(n.children));
  }
  sortLevel(roots);
  return roots;
}

function FieldError({
  messages,
  name,
}: {
  messages?: Record<string, string>;
  name: string;
}) {
  const msg = messages?.[name];
  if (!msg) return null;
  return <p className="text-xs text-destructive">{msg}</p>;
}

function formatWhen(iso: string | null): string {
  if (!iso) return "never";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function NavigationEditor({
  canEdit,
  canPublish,
  zone,
  locale,
  supportedLocales,
  items,
  menu,
}: Props) {
  const tree = useMemo(() => buildView(items), [items]);

  const [saveState, saveAction, savePending] = useActionState<
    NavActionState,
    FormData
  >(saveNavItemAction, undefined);
  const [deleteState, deleteAction, deletePending] = useActionState<
    NavActionState,
    FormData
  >(deleteNavItemAction, undefined);
  const [publishState, publishAction, publishPending] = useActionState<
    NavActionState,
    FormData
  >(publishNavigationAction, undefined);

  const saveFieldErrors =
    saveState && saveState.ok === false ? saveState.fieldErrors : undefined;

  // --- "Add item" form state (controlled; parent selector) ------------------
  const [addParentId, setAddParentId] = useState<string>("");

  const hrefBuilder = (next: { zone?: NavZone; locale?: Locale }): string => {
    const nextZone = next.zone ?? zone;
    const nextLocale = next.locale ?? locale;
    const params = new URLSearchParams({ zone: nextZone, locale: nextLocale });
    return `/admin/site-settings/navigation?${params.toString()}`;
  };

  return (
    <div className="space-y-8">
      {/* ---------- Switchers ---------- */}
      <div className="flex flex-wrap items-end gap-6">
        <div className="space-y-1.5">
          <Label>Zone</Label>
          <div className="flex gap-2">
            {NAV_ZONES.map((z) => (
              <Link
                key={z}
                href={hrefBuilder({ zone: z })}
                className={`rounded-md border px-3 py-1.5 text-sm capitalize transition ${
                  z === zone
                    ? "border-foreground bg-foreground/10"
                    : "border-border/60 hover:bg-muted/50"
                }`}
              >
                {z}
              </Link>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Locale</Label>
          <div className="flex gap-2">
            {supportedLocales.map((l) => (
              <Link
                key={l}
                href={hrefBuilder({ locale: l })}
                className={`rounded-md border px-3 py-1.5 text-sm uppercase transition ${
                  l === locale
                    ? "border-foreground bg-foreground/10"
                    : "border-border/60 hover:bg-muted/50"
                }`}
              >
                {l}
              </Link>
            ))}
          </div>
        </div>

        <div className="ml-auto rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          <div>
            Published version:{" "}
            <span className="font-mono text-foreground">
              v{menu?.version ?? 0}
            </span>
          </div>
          <div>Last published: {formatWhen(menu?.published_at ?? null)}</div>
        </div>
      </div>

      {/* ---------- Current tree ---------- */}
      <section className="space-y-3">
        <h3 className="font-display text-sm font-medium tracking-wide text-muted-foreground">
          Draft menu
        </h3>
        {tree.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No items yet. Add one below — nothing is visible on the storefront
            until you publish.
          </p>
        ) : (
          <ul className="space-y-2">
            {tree.map((node) => (
              <NavNodeRow
                key={node.row.id}
                node={node}
                depth={0}
                canEdit={canEdit}
                deleteAction={deleteAction}
                deletePending={deletePending}
              />
            ))}
          </ul>
        )}
        {deleteState && deleteState.ok === false && (
          <p className="text-sm text-destructive">{deleteState.error}</p>
        )}
        {deleteState && deleteState.ok === true && (
          <p className="text-sm text-emerald-400">{deleteState.message}</p>
        )}
      </section>

      {/* ---------- Add item ---------- */}
      <section className="space-y-3">
        <h3 className="font-display text-sm font-medium tracking-wide text-muted-foreground">
          Add an item
        </h3>
        <form action={saveAction} className="space-y-4">
          <input type="hidden" name="zone" value={zone} />
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="expectedVersion" value={0} />
          <input type="hidden" name="parentId" value={addParentId} />
          <input type="hidden" name="visible" value="true" />
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="label">Label</Label>
              <Input
                id="label"
                name="label"
                disabled={!canEdit || savePending}
                maxLength={80}
                required
              />
              <FieldError messages={saveFieldErrors} name="label" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="href">Link URL</Label>
              <Input
                id="href"
                name="href"
                disabled={!canEdit || savePending}
                placeholder="/about or https://…"
                required
              />
              <FieldError messages={saveFieldErrors} name="href" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sortOrder">Order</Label>
              <Input
                id="sortOrder"
                name="sortOrder"
                type="number"
                min={0}
                max={9999}
                defaultValue={items.length * 10}
                disabled={!canEdit || savePending}
              />
              <FieldError messages={saveFieldErrors} name="sortOrder" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="addParentId">Parent (optional)</Label>
            <select
              id="addParentId"
              className="h-9 w-full max-w-sm rounded-md border border-border/60 bg-background px-2 text-sm"
              value={addParentId}
              onChange={(e) => setAddParentId(e.target.value)}
              disabled={!canEdit || savePending}
            >
              <option value="">— top level —</option>
              {tree.map((n) => (
                <option key={n.row.id} value={n.row.id}>
                  {n.row.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Two levels max: top level, or one step nested under an existing
              top-level item.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={!canEdit || savePending}>
              {savePending ? "Saving…" : "Add item"}
            </Button>
            {saveState && saveState.ok === false && (
              <p className="text-sm text-destructive">{saveState.error}</p>
            )}
            {saveState && saveState.ok === true && (
              <p className="text-sm text-emerald-400">{saveState.message}</p>
            )}
            {!canEdit && (
              <p className="text-sm text-muted-foreground">
                Read-only — you do not have permission to edit navigation.
              </p>
            )}
          </div>
        </form>
      </section>

      {/* ---------- Publish ---------- */}
      <section className="space-y-3 border-t border-border/60 pt-6">
        <h3 className="font-display text-sm font-medium tracking-wide text-muted-foreground">
          Publish
        </h3>
        <p className="text-sm text-muted-foreground">
          Publishing replaces the current public {zone} menu for{" "}
          <span className="uppercase">{locale}</span> with the draft above.
        </p>
        <form action={publishAction} className="flex flex-wrap items-center gap-3">
          <input type="hidden" name="zone" value={zone} />
          <input type="hidden" name="locale" value={locale} />
          <input
            type="hidden"
            name="expectedMenuVersion"
            value={menu?.version ?? 0}
          />
          <Button
            type="submit"
            disabled={!canPublish || publishPending || items.length === 0}
          >
            {publishPending ? "Publishing…" : `Publish ${zone}`}
          </Button>
          {publishState && publishState.ok === false && (
            <p className="text-sm text-destructive">{publishState.error}</p>
          )}
          {publishState && publishState.ok === true && (
            <p className="text-sm text-emerald-400">{publishState.message}</p>
          )}
          {!canPublish && (
            <p className="text-sm text-muted-foreground">
              Ask an admin or coordinator to publish.
            </p>
          )}
          {items.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Add at least one item before publishing.
            </p>
          )}
        </form>
      </section>
    </div>
  );
}

// ---- row + children --------------------------------------------------------

function NavNodeRow({
  node,
  depth,
  canEdit,
  deleteAction,
  deletePending,
}: {
  node: NodeView;
  depth: number;
  canEdit: boolean;
  deleteAction: (formData: FormData) => void;
  deletePending: boolean;
}) {
  return (
    <li className="space-y-2">
      <div
        className="flex flex-wrap items-center gap-3 rounded-md border border-border/60 bg-background px-3 py-2"
        style={{ marginLeft: depth * 20 }}
      >
        <span className="font-medium">{node.row.label}</span>
        <span className="font-mono text-xs text-muted-foreground">
          {node.row.href}
        </span>
        {!node.row.visible && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs uppercase text-muted-foreground">
            hidden
          </span>
        )}
        <span className="text-xs text-muted-foreground">
          order {node.row.sort_order} · v{node.row.version}
        </span>
        <form action={deleteAction} className="ml-auto">
          <input type="hidden" name="id" value={node.row.id} />
          <input type="hidden" name="zone" value={node.row.zone} />
          <input type="hidden" name="locale" value={node.row.locale} />
          <input
            type="hidden"
            name="expectedVersion"
            value={node.row.version}
          />
          <Button
            type="submit"
            variant="ghost"
            size="sm"
            disabled={!canEdit || deletePending}
          >
            Delete
          </Button>
        </form>
      </div>
      {node.children.length > 0 && (
        <ul className="space-y-2">
          {node.children.map((c) => (
            <NavNodeRow
              key={c.row.id}
              node={c}
              depth={depth + 1}
              canEdit={canEdit}
              deleteAction={deleteAction}
              deletePending={deletePending}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
