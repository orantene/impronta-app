"use client";

/**
 * CatalogPage — the destination the registry calls `catalog`, drawn as the
 * boards: W01 (the list and its segments), W02 (Create item), W03 to W06
 * (one item, seven tabs, the right column), W07 (Menu structure) and W09
 * (Passes & cards). Promotions (W08) is its own route, `/admin/discounts`,
 * and the segment links there.
 *
 * ONE ROUTE, SEVERAL STATES. `?view=` picks the segment, `?item=<id>` opens
 * an item, `?tab=` its tab, `?create=1` the type chooser. The rail's children
 * carry the same queries; nothing here is a second route.
 *
 * EVERY ROW IS THE READER'S. The list, the editor and the structure view all
 * read the one `useOfferingsEditor` the talent's Services tab also uses, over
 * `loadWorkspaceMenuForEditor`; a save is `upsertWorkspaceMenuItem`, a stock
 * change the capacity RPC, options the child-row writer. A reader that
 * refuses puts its sentence where the list would be.
 *
 * Token classes only; inline styles are frozen under components/admin/shell.
 */

import { useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { useAdminShell } from "../../state";
import { useT } from "@/i18n/use-t";
import { useOfferingsEditor } from "@/components/talent/services/use-offerings-editor";
import { Outcome } from "../appointments-classes-ui";
import { CatalogList } from "./CatalogList";
import { CatalogCreateType } from "./CatalogCreateType";
import { CatalogItemEditor } from "./CatalogItemEditor";
import { CatalogStructure } from "./CatalogStructure";
import { CatalogPasses } from "./CatalogPasses";
import { CatalogPriceLists } from "./CatalogPriceLists";
import { tabFromQuery, viewFromQuery, type CatalogView, type ItemTab } from "./catalog-model";

/** The `?item=` value of a draft not yet written. */
export const NEW_ITEM = "new";

export type CatalogNav = {
  /** The admin base (`/admin` or `/<slug>/admin`). */
  base: string;
  view: CatalogView;
  itemId: string | null;
  tab: ItemTab;
  creating: boolean;
  go: (next: { view?: CatalogView; item?: string | null; tab?: ItemTab; create?: boolean }) => void;
  href: (next: { view?: CatalogView; item?: string | null; tab?: ItemTab; create?: boolean }) => string;
};

function buildHref(base: string, q: { view?: CatalogView; item?: string | null; tab?: ItemTab; create?: boolean }): string {
  const p = new URLSearchParams();
  if (q.item) {
    p.set("item", q.item);
    if (q.tab && q.tab !== "details") p.set("tab", q.tab);
  } else if (q.create) {
    p.set("create", "1");
  } else if (q.view && q.view !== "items") {
    p.set("view", q.view);
  }
  const qs = p.toString();
  return `${base}/catalog${qs ? `?${qs}` : ""}`;
}

export function CatalogPage() {
  const { bridgeTenantIdentity, adminBasePath } = useAdminShell();
  const searchParams = useSearchParams();
  const router = useRouter();
  const t = useT();
  const tenantId = bridgeTenantIdentity?.tenantId ?? null;

  const view = viewFromQuery(searchParams.get("view"));
  const itemId = searchParams.get("item");
  const tab = tabFromQuery(searchParams.get("tab"));
  const creating = searchParams.get("create") === "1";

  const href = useCallback(
    (next: Parameters<CatalogNav["href"]>[0]) => buildHref(adminBasePath, next),
    [adminBasePath],
  );
  const go = useCallback(
    (next: Parameters<CatalogNav["go"]>[0]) => {
      router.replace(buildHref(adminBasePath, next), { scroll: false });
    },
    [router, adminBasePath],
  );
  const nav = useMemo<CatalogNav>(
    () => ({ base: adminBasePath, view, itemId, tab, creating, go, href }),
    [adminBasePath, view, itemId, tab, creating, go, href],
  );

  if (!tenantId) {
    return <Outcome kind="refused">{t("dashboard.adminMenu.noTenant")}</Outcome>;
  }
  return <CatalogBody tenantId={tenantId} nav={nav} />;
}

function CatalogBody({ tenantId, nav }: { tenantId: string; nav: CatalogNav }) {
  const editor = useOfferingsEditor({ kind: "workspace", tenantId });
  const t = useT();

  if (editor.loading) {
    return (
      <p role="status" className="m-0 font-admin-body text-admin-13 text-admin-ink-muted">
        {t("dashboard.catalog.loading")}
      </p>
    );
  }
  if (nav.creating) return <CatalogCreateType editor={editor} nav={nav} />;
  // `?item=new` is the draft W02 handed over: it lives only in the editor
  // hook until Save draft or Publish writes it. A reload loses it, so the
  // chooser comes back rather than an empty editor.
  if (nav.itemId === NEW_ITEM) {
    if (!editor.draft) return <CatalogCreateType editor={editor} nav={nav} />;
    return <CatalogItemEditor editor={editor} item={editor.draft} nav={nav} tenantId={tenantId} isDraft />;
  }
  if (nav.itemId) {
    const item = editor.items.find((it) => it.id === nav.itemId) ?? null;
    if (item) return <CatalogItemEditor editor={editor} item={item} nav={nav} tenantId={tenantId} />;
    return (
      <div className="flex flex-col gap-[12px]">
        <Outcome kind="refused" testId="catalog-item-missing">
          {t("dashboard.catalog.itemMissing")}
        </Outcome>
        <CatalogList editor={editor} nav={nav} />
      </div>
    );
  }
  switch (nav.view) {
    case "structure":
      return <CatalogStructure editor={editor} nav={nav} />;
    case "passes":
      return <CatalogPasses nav={nav} />;
    case "price-lists":
      return <CatalogPriceLists editor={editor} nav={nav} />;
    case "packages":
    case "items":
    default:
      return <CatalogList editor={editor} nav={nav} />;
  }
}
