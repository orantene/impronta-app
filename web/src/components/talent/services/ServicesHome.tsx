"use client";

import { useEffect, useMemo, useState } from "react";
import {
  deleteTalentOfferingForever,
  duplicateTalentOffering,
  setOfferingImages,
  setOfferingPublication,
  upsertTalentOffering,
} from "@/lib/talent/offerings-actions";
import {
  loadAddonGroups,
  loadCategoryOrder,
  loadOfferingDestinations,
  loadSellingDefaults,
  renameCategory,
  saveCategoryOrder,
  saveSellingDefaults,
  type AddonGroup,
  type OfferingDestination,
  type SellingDefaults,
} from "@/lib/talent/services-settings-actions";
import { foldAccent, publicationWord } from "@/lib/talent/publication-state";
import {
  blankOffering,
  type OfferingKind,
  type TalentOffering,
} from "@/lib/talent/offerings-types";
import { usdEquivalentLabel } from "@/lib/pricing/usd-equivalent";
import { useOfferingsEditor } from "./use-offerings-editor";
import { ItemStateChips } from "./ItemStateChips";
import { useDashboardText } from "@/components/admin/shell/internal/dashboard-i18n";
import {
  AddManyScreen,
  CameraAddScreen,
  DefaultsScreen,
  EditorScreen,
  FirstRunScreen,
  OrganizeScreen,
  PublishedBanner,
  SellingPatternsScreen,
} from "./ServicesScreens";
import { listCategoryUndos, popCategoryUndo, pushCategoryUndo } from "@/lib/talent/category-undo";
import { ExtraScreen } from "./ExtraScreen";
import { DuplicateReviewScreen } from "./DuplicateReviewScreen";

type Filter = "all" | "service" | "package" | "product" | "draft" | "hidden" | "archived" | "attention";
type Screen = "list" | "editor" | "defaults" | "organize" | "addMany" | "camera" | "firstRun" | "patterns";

export function ServicesHome({ talentId }: { talentId: string }) {
  const copy = useDashboardText();
  const locale = copy.isSpanish ? "es" : "en";
  const editor = useOfferingsEditor({ kind: "talent", talentProfileId: talentId });
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [screen, setScreen] = useState<Screen>("list");
  const [typeOpen, setTypeOpen] = useState(false);
  const [kind, setKind] = useState<OfferingKind>("service");
  const [editing, setEditing] = useState<TalentOffering | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [bannerId, setBannerId] = useState<string | null>(null);
  const [destinations, setDestinations] = useState<OfferingDestination[]>([]);
  const [defaults, setDefaults] = useState<SellingDefaults | null>(null);
  const [categoryOrder, setCategoryOrder] = useState<string[]>([]);
  const [addons, setAddons] = useState<AddonGroup[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [hideTarget, setHideTarget] = useState<TalentOffering | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [slowLoad, setSlowLoad] = useState(false);
  const [extraOpen, setExtraOpen] = useState(false);
  const [dupPair, setDupPair] = useState<{ original: TalentOffering; copy: TalentOffering } | null>(null);

  useEffect(() => {
    if (!editor.loading) {
      setSlowLoad(false);
      return;
    }
    const id = window.setTimeout(() => setSlowLoad(true), 8000);
    return () => window.clearTimeout(id);
  }, [editor.loading]);

  const items = editor.items;
  const derived = useMemo(() => {
    const q = foldAccent(query);
    return items.filter((item) => {
      const word = publicationWord({ status: item.status, firstPublishedAt: item.firstPublishedAt });
      if (q && !foldAccent(item.title).includes(q)) return false;
      if (filter === "all") return word !== "archived";
      if (filter === "service" || filter === "package" || filter === "product") {
        return item.kind === filter && word !== "archived";
      }
      if (filter === "draft") return word === "draft";
      if (filter === "hidden") return word === "hidden";
      if (filter === "archived") return word === "archived";
      if (filter === "attention") {
        return (
          word !== "archived" &&
          (item.imageUrls.length === 0 ||
            item.amountCents == null ||
            item.inventoryQty === 0)
        );
      }
      return true;
    });
  }, [items, filter, query]);

  const counts = useMemo(() => {
    const all = items.filter((i) => publicationWord(i) !== "archived");
    return {
      all: all.length,
      service: all.filter((i) => i.kind === "service").length,
      package: all.filter((i) => i.kind === "package").length,
      product: all.filter((i) => i.kind === "product").length,
      draft: items.filter((i) => publicationWord(i) === "draft").length,
      hidden: items.filter((i) => publicationWord(i) === "hidden").length,
      archived: items.filter((i) => publicationWord(i) === "archived").length,
    };
  }, [items]);

  const attention = useMemo(() => {
    const live = items.filter((i) => publicationWord(i) !== "archived");
    return {
      noPhoto: live.filter((i) => i.imageUrls.length === 0).length,
      noPrice: live.filter((i) => i.amountCents == null).length,
      soldOut: live.filter((i) => i.inventoryQty === 0).length,
    };
  }, [items]);
  const attentionTotal = attention.noPhoto || attention.noPrice || attention.soldOut ? new Set([
    ...items.filter((i) => i.imageUrls.length === 0),
    ...items.filter((i) => i.amountCents == null),
    ...items.filter((i) => i.inventoryQty === 0),
  ]).size : 0;

  const openEditor = (item: TalentOffering | null, nextKind?: OfferingKind) => {
    const draft =
      item ??
      blankOffering({ kind: "talent", talentProfileId: talentId }, editor.defaultCurrency, items.length);
    setEditing(item ? item : { ...draft, kind: nextKind ?? kind, status: "draft" });
    setScreen("editor");
    setTypeOpen(false);
  };

  const refreshExtras = async () => {
    const [d, c, a, dest] = await Promise.all([
      loadSellingDefaults(talentId),
      loadCategoryOrder(talentId),
      loadAddonGroups(talentId),
      loadOfferingDestinations(talentId),
    ]);
    if (d.ok) setDefaults(d.defaults);
    if (c.ok) setCategoryOrder(c.order);
    if (a.ok) setAddons(a.groups);
    if (dest.ok) setDestinations(dest.destinations);
  };

  const chips: Array<{ id: Filter; label: string; count: number }> = [
    { id: "all", label: copy.t("All"), count: counts.all },
    { id: "service", label: copy.t("Services"), count: counts.service },
    { id: "package", label: copy.t("Packages"), count: counts.package },
    { id: "product", label: copy.t("Products"), count: counts.product },
    { id: "draft", label: copy.t("Drafts"), count: counts.draft },
    { id: "hidden", label: copy.t("Hidden"), count: counts.hidden },
    { id: "archived", label: copy.t("Archived"), count: counts.archived },
  ];

  if (screen === "defaults" && defaults) {
    return (
      <DefaultsScreen
        defaults={defaults}
        onChange={setDefaults}
        onBack={() => setScreen("list")}
        onSave={async () => {
          const res = await saveSellingDefaults(talentId, defaults);
          setToast(res.ok ? copy.t("Saved") : res.error ?? copy.t("Could not save"));
          setScreen("list");
        }}
      />
    );
  }

  if (screen === "organize") {
    const names = Array.from(new Set(items.map((i) => i.category).filter((v): v is string => Boolean(v))));
    const ordered = [...categoryOrder.filter((n) => names.includes(n)), ...names.filter((n) => !categoryOrder.includes(n))];
    return (
      <OrganizeScreen
        names={ordered}
        items={items}
        talentId={talentId}
        onBack={() => setScreen("list")}
        onRename={async (from, to) => {
          const ids = items.filter((i) => i.category === from).map((i) => i.id);
          await renameCategory(talentId, from, to);
          pushCategoryUndo(talentId, { from, to, itemIds: ids });
          editor.reload?.();
        }}
        onUndo={async () => {
          const last = popCategoryUndo(talentId);
          if (!last) return;
          await renameCategory(talentId, last.to, last.from);
          editor.reload?.();
        }}
        onOrder={async (next) => {
          setCategoryOrder(next);
          await saveCategoryOrder(talentId, next);
        }}
      />
    );
  }

  if (screen === "addMany") {
    return <AddManyScreen talentId={talentId} editor={editor} onBack={() => setScreen("list")} />;
  }

  if (screen === "camera") {
    return <CameraAddScreen talentId={talentId} editor={editor} onBack={() => setScreen("list")} locale={locale} />;
  }

  if (screen === "firstRun") {
    return (
      <FirstRunScreen
        itemCount={items.length}
        onBack={() => setScreen("list")}
        onPick={(path) => {
          if (path === "list") setScreen("addMany");
          else if (path === "camera") setScreen("camera");
          else {
            setKind("service");
            openEditor(null, "service");
          }
        }}
      />
    );
  }

  if (screen === "patterns") {
    return <SellingPatternsScreen onBack={() => setScreen("list")} />;
  }

  if (extraOpen && editing) {
    return (
      <ExtraScreen
        talentId={talentId}
        source={editing}
        items={items}
        onBack={() => setExtraOpen(false)}
        onSaved={async () => {
          const a = await loadAddonGroups(talentId);
          if (a.ok) setAddons(a.groups);
        }}
      />
    );
  }

  if (dupPair) {
    return (
      <DuplicateReviewScreen
        original={dupPair.original}
        copyItem={dupPair.copy}
        bookingCount={null}
        reviewCount={null}
        onDiscard={async () => {
          await deleteTalentOfferingForever(talentId, dupPair.copy.id);
          editor.reload();
          setDupPair(null);
        }}
        onSaveDraft={async () => {
          setDupPair(null);
          setScreen("list");
        }}
        onPublish={async () => {
          await setOfferingPublication(talentId, dupPair.copy.id, "published");
          editor.reload();
          setDupPair(null);
          setScreen("list");
        }}
        onEdit={() => {
          setEditing(dupPair.copy);
          setDupPair(null);
          setScreen("editor");
        }}
      />
    );
  }

  if (screen === "editor" && editing) {
    return (
      <EditorScreen
        item={editing}
        setItem={setEditing}
        locale={locale}
        defaults={defaults}
        destinations={destinations}
        addons={addons}
        items={items}
        talentId={talentId}
        rates={editor.usdRates}
        onBack={() => setScreen("list")}
        onSave={async (next, publish, pendingImageIds) => {
          // Direct write, not editor.saveDraft: saveDraft reads the hook's own
          // draft state, which this screen never starts, so a new item saved
          // through it returned null and nothing was written.
          const payload: TalentOffering = { ...next, status: publish ? "published" : next.status };
          const res = await upsertTalentOffering(talentId, payload);
          if (!res.ok) throw new Error(res.error);
          if (pendingImageIds?.length) {
            await setOfferingImages(talentId, res.item.id, pendingImageIds);
          }
          editor.reload();
          if (publicationWord(res.item) === "live") setBannerId(res.item.id);
          setScreen("list");
        }}
        onRefreshAddons={async () => {
          const a = await loadAddonGroups(talentId);
          if (a.ok) setAddons(a.groups);
        }}
        onOpenExtra={() => setExtraOpen(true)}
        catalogNames={Array.from(new Set(items.map((i) => i.category).filter((v): v is string => Boolean(v))))}
      />
    );
  }

  return (
    <div className="font-admin-body">
      <div className="flex flex-wrap items-end justify-between gap-3" data-tulala-page-header>
        <div>
          <h1 className="font-admin-display text-[28px] font-semibold text-admin-ink">{copy.t("Services")}</h1>
          <p className="text-[13px] text-admin-ink-muted">
            {hideTarget
              ? `${copy.t("Hiding")} "${hideTarget.title}"`
              : editor.loading
              ? copy.t("Your services are loading.")
              : `${copy.t("Manage your services, packages and products")} · ${counts.all} ${copy.t("items")}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="rounded-full border border-admin-border-soft px-3 py-1.5 text-[13px]" onClick={() => { void refreshExtras(); setScreen("organize"); }}>
            {copy.t("Organize")}
          </button>
          <button type="button" className="rounded-full border border-admin-border-soft px-3 py-1.5 text-[13px]" onClick={() => { void refreshExtras(); setScreen("defaults"); }}>
            {copy.t("Defaults")}
          </button>
          <button type="button" className="rounded-full bg-admin-brand px-3 py-1.5 text-[13px] font-semibold text-white" onClick={() => setTypeOpen(true)}>
            + {copy.t("Add item")}
          </button>
          <div className="relative">
            <button type="button" aria-label={copy.t("More")} className="rounded-full px-2 py-1.5 text-[16px] text-admin-ink-muted" onClick={() => setMoreOpen((open) => !open)}>
              ···
            </button>
            {moreOpen && (
              <div className="absolute right-0 z-20 mt-1 w-48 rounded-xl border border-admin-border-soft bg-white py-1 shadow-admin-rest">
                <button type="button" className="block w-full px-3 py-2 text-left text-[13px]" onClick={() => { setMoreOpen(false); setScreen("addMany"); }}>
                  {copy.t("Add many")}
                </button>
                <button type="button" className="block w-full px-3 py-2 text-left text-[13px]" onClick={() => { setMoreOpen(false); setScreen("camera"); }}>
                  {copy.t("From the camera")}
                </button>
                <button type="button" className="block w-full px-3 py-2 text-left text-[13px]" onClick={() => { setMoreOpen(false); setScreen("firstRun"); }}>
                  {copy.t("First run")}
                </button>
                <button type="button" className="block w-full px-3 py-2 text-left text-[13px]" onClick={() => { setMoreOpen(false); setScreen("patterns"); }}>
                  {copy.t("Selling patterns")}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <label className="min-w-[200px] flex-1">
          <span className="sr-only">{copy.t("Search by name")}</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={copy.t("Search by name")}
            className="w-full rounded-[10px] border border-admin-border-soft bg-white px-3 py-2 text-[14px]"
          />
        </label>
        <div className="flex flex-wrap gap-1.5">
          {chips.map((chip) => (
            <button
              key={chip.id}
              type="button"
              onClick={() => setFilter(chip.id)}
              className={`rounded-full px-2.5 py-1 text-[12px] ${filter === chip.id ? "bg-admin-ink text-white" : "bg-[rgba(11,11,13,0.06)] text-admin-ink"}`}
            >
              {chip.label}{editor.loading ? "" : ` ${chip.count}`}
            </button>
          ))}
        </div>
      </div>

      {attentionTotal > 0 && filter !== "attention" && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-[12px] border border-admin-border-soft bg-white px-4 py-3 text-[13px]">
          <p>
            {attentionTotal} {copy.t("items need attention.")} {attention.noPhoto} {copy.t("have no photo")}, {attention.noPrice} {copy.t("have no price yet")}, {attention.soldOut} {copy.t("is sold out.")} {copy.t("Some have more than one of these.")}
          </p>
          <button type="button" className="font-semibold text-admin-brand" onClick={() => setFilter("attention")}>
            {copy.t("Show them")}
          </button>
        </div>
      )}

      {bannerId && (
        <PublishedBanner
          item={items.find((i) => i.id === bannerId) ?? null}
          destinations={destinations}
          onClose={() => setBannerId(null)}
          onAddAnother={() => {
            setBannerId(null);
            setTypeOpen(true);
          }}
        />
      )}

      {editor.loading && (
        <div className="mt-6 text-[13px] text-admin-ink-muted" role="status">
          <p>{slowLoad ? copy.t("Still trying") : copy.t("Loading")}</p>
          <p className="mt-1">
            {slowLoad
              ? copy.t("This is taking longer than usual. Still trying. Nothing is lost.")
              : copy.t("Your services are loading. No number is shown until they arrive.")}
          </p>
          {slowLoad && (
            <button type="button" className="mt-2 font-semibold text-admin-brand" onClick={() => editor.reload()}>
              {copy.t("Try now")}
            </button>
          )}
        </div>
      )}
      {!editor.loading && editor.error && (
        <div className="mt-4 rounded-[12px] border border-admin-border-soft bg-white px-4 py-3 text-[13px]" role="alert">
          <p className="font-semibold">{copy.t("Failed")}</p>
          <p className="mt-1 text-admin-ink-muted">
            {items.length > 0
              ? copy.t("We could not refresh your services. You are looking at the last version we had. Nothing was changed.")
              : copy.t("We could not refresh your services. Nothing was changed.")}
          </p>
          <button type="button" className="mt-2 font-semibold text-admin-brand" onClick={() => editor.reload()}>
            {copy.t("Try again")}
          </button>
        </div>
      )}
      {!editor.loading && !editor.error && items.length === 0 && (
        <div className="mt-8 text-[13px] text-admin-ink-muted">
          <p className="font-semibold text-admin-ink">{copy.t("Genuinely empty")}</p>
          <p className="mt-1">{copy.t("No services yet. Add your first one. It takes about twenty seconds and nothing is public until you save.")}</p>
          <button type="button" className="mt-2 font-semibold text-admin-brand" onClick={() => setTypeOpen(true)}>
            + {copy.t("Add a service")}
          </button>
        </div>
      )}
      {!editor.loading && !editor.error && items.length > 0 && derived.length === 0 && (
        <div className="mt-8 text-[13px] text-admin-ink-muted">
          <p>{copy.t("No items match.")}</p>
        </div>
      )}

      <ul className="mt-4 divide-y divide-admin-border-soft overflow-hidden rounded-[12px] border border-admin-border-soft bg-white">
        {derived.map((item) => (
          <li key={item.id} className={`relative flex items-center gap-3 px-3 py-3 ${bannerId === item.id ? "bg-[rgba(15,79,62,0.06)]" : ""}`}>
            <button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => openEditor(item)}>
              {item.imageUrls[0] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.imageUrls[0]} alt="" className="h-12 w-12 rounded-md object-cover" />
              ) : (
                <span className="grid h-12 w-12 place-items-center rounded-md border border-dashed border-admin-border text-lg text-admin-ink-muted">+</span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold text-admin-ink">{item.title}</span>
                <span className="block truncate text-[12px] text-admin-ink-muted">
                  {[item.category, item.durationMinutes ? `${item.durationMinutes} min` : null, item.imageUrls.length === 0 ? copy.t("add a photo") : null, (item.addOns?.length ?? 0) > 0 ? `${item.addOns?.length} ${copy.t("extras")}` : null]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block text-[13px] font-semibold">
                  {listPrice(item, copy.t("Quoted"))}
                </span>
                <span className="block text-[11px] text-admin-ink-muted">
                  {usdEquivalentLabel(item.amountCents, item.currency, editor.usdRates, locale)}
                </span>
              </span>
            </button>
            <ItemStateChips item={item} locale={locale} />
            <button type="button" aria-label={copy.t("Row menu")} className="px-2" onClick={() => setMenuId(menuId === item.id ? null : item.id)}>
              ⋯
            </button>
            {menuId === item.id && (
              <RowMenu
                item={item}
                filter={filter}
                onClose={() => setMenuId(null)}
                onEdit={() => openEditor(item)}
                onPreview={async () => {
                  await refreshExtras();
                  openEditor(item);
                }}
                onShare={async () => {
                  const dest = destinations[0]?.href;
                  if (dest && navigator.clipboard) {
                    await navigator.clipboard.writeText(window.location.origin + dest);
                    setToast(copy.t("Link copied"));
                  }
                }}
                onDuplicate={async () => {
                  const res = await duplicateTalentOffering(talentId, item.id);
                  if (res.ok) {
                    editor.reload();
                    setDupPair({ original: item, copy: res.item });
                  } else setToast(res.error ?? copy.t("Could not duplicate"));
                }}
                onHide={() => {
                  setHideTarget(item);
                  if (destinations.length === 0) void refreshExtras();
                }}
                onShow={async () => {
                  await setOfferingPublication(talentId, item.id, "published");
                  editor.reload();
                }}
                onArchive={async () => {
                  await setOfferingPublication(talentId, item.id, "archived");
                  editor.reload();
                  setToast(copy.t("Archived"));
                }}
                onRestore={async () => {
                  await setOfferingPublication(talentId, item.id, "draft");
                  editor.reload();
                }}
                onDelete={async () => {
                  const res = await deleteTalentOfferingForever(talentId, item.id);
                  setToast(res.ok ? copy.t("Deleted") : res.error ?? copy.t("Could not delete"));
                  editor.reload();
                }}
                onMove={(dir) => editor.move(item.id, dir)}
              />
            )}
          </li>
        ))}
      </ul>

      {typeOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" onClick={() => setTypeOpen(false)}>
          <div role="dialog" aria-label={copy.t("What are you adding?")} style={{ maxWidth: 640 }} className="w-full overflow-hidden rounded-2xl bg-white font-admin-body shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 pb-4 pt-5">
            <h2 className="text-[19px] font-semibold text-admin-ink">{copy.t("What are you adding?")}</h2>
            {(["service", "package", "product"] as const).map((k) => {
              const on = kind === k;
              return (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                aria-pressed={on}
                className={`mt-3 flex w-full items-center gap-4 rounded-xl border px-4 py-3 text-left ${on ? "border-emerald-900/60 bg-emerald-900/[0.06]" : "border-admin-border-soft bg-white"}`}
              >
                <svg aria-hidden viewBox="0 0 20 20" className="h-5 w-5 shrink-0 text-admin-ink-muted" fill="none" stroke="currentColor" strokeWidth="1.4">
                  {k === "service" ? (
                    <><rect x="2.5" y="6" width="15" height="10.5" rx="1.5" /><path d="M7 6V4.5A1 1 0 0 1 8 3.5h4a1 1 0 0 1 1 1V6M7.5 6v10.5M12.5 6v10.5" /></>
                  ) : k === "package" ? (
                    <path d="m10 2.8 2.2 4.5 4.9.7-3.6 3.5.9 4.9L10 14.1l-4.4 2.3.9-4.9L2.9 8l4.9-.7z" strokeLinejoin="round" />
                  ) : (
                    <><rect x="2.5" y="4.5" width="15" height="11" rx="1.5" /><path d="M2.5 8.5h15M5.5 12.5h3" /></>
                  )}
                </svg>
                <span className="min-w-0 flex-1">
                  <span className={`block text-[15px] font-semibold ${on ? "text-emerald-900" : "text-admin-ink"}`}>
                    {k === "service" ? copy.t("A service") : k === "package" ? copy.t("A package") : copy.t("A product")}
                  </span>
                  <span className="mt-0.5 block text-[13px] leading-snug text-admin-ink-muted">
                    {k === "service"
                      ? copy.t("Work you do for a client. Usually booked for a time, but it can also be agreed and delivered.")
                      : k === "package"
                        ? copy.t("Several visits or sessions sold together for one price.")
                        : copy.t("Something the client takes away or you send. Has stock, not a length.")}
                  </span>
                </span>
                {on && (
                  <svg aria-hidden viewBox="0 0 16 16" className="h-4 w-4 shrink-0 text-emerald-900" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m3.5 8.5 3 3 6-7" strokeLinecap="round" strokeLinejoin="round" /></svg>
                )}
              </button>
              );
            })}
            <p className="mt-4 text-[12px] leading-relaxed text-admin-ink-dim">
              {copy.t("Adding an extra, like glitter or a home visit? Open the service it belongs to and add it there, so it can never be booked on its own.")}
            </p>
            </div>
            <div className="flex items-center justify-end gap-4 border-t border-admin-border-soft px-5 py-3">
              <button type="button" className="text-[14px] text-admin-ink" onClick={() => setTypeOpen(false)}>{copy.t("Cancel")}</button>
              <button type="button" className="rounded-lg bg-emerald-900 px-4 py-2 text-[14px] font-semibold text-white" onClick={() => { void refreshExtras(); openEditor(null, kind); }}>
                {copy.t("Continue")}
              </button>
            </div>
          </div>
        </div>
      )}

      {hideTarget && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" onClick={() => setHideTarget(null)}>
          <div role="dialog" aria-labelledby="hide-title" className="w-full max-w-[440px] rounded-2xl bg-white p-5 shadow-admin-rest" onClick={(e) => e.stopPropagation()}>
            <h2 id="hide-title" className="font-admin-display text-[20px]">{copy.t("Hide this from your pages?")}</h2>
            <ul className="mt-3 space-y-2 text-[13px] text-admin-ink">
              <li>
                {copy.t("It comes off")} {destinations.map((d) => d.label).join(" and ") || copy.t("your connected pages")}. {copy.t("Within a few minutes. Nobody can book it after that.")}
              </li>
              <li>{copy.t("Bookings already made are untouched. Their price, their deposit and their conversation all stay as agreed.")}</li>
              <li>{copy.t("You can put it back at any time. It returns with the same content and the same link.")}</li>
            </ul>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="rounded-full px-3 py-2 text-[13px]" onClick={() => setHideTarget(null)}>{copy.t("Cancel")}</button>
              <button
                type="button"
                className="rounded-full bg-admin-brand px-4 py-2 text-[13px] text-white"
                onClick={async () => {
                  const target = hideTarget;
                  setHideTarget(null);
                  const res = await setOfferingPublication(talentId, target.id, "draft");
                  if (!res.ok) {
                    setToast(res.error ?? copy.t("Could not hide it. It is still public. Try again."));
                    return;
                  }
                  editor.reload();
                }}
              >
                {copy.t("Hide it")}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-20 right-4 rounded-full bg-admin-ink px-3 py-2 text-[12px] text-white">{toast}</div>
      )}
    </div>
  );
}

function RowMenu({
  item,
  filter,
  onClose,
  onEdit,
  onPreview,
  onShare,
  onDuplicate,
  onHide,
  onShow,
  onArchive,
  onRestore,
  onDelete,
  onMove,
}: {
  item: TalentOffering;
  filter: Filter;
  onClose: () => void;
  onEdit: () => void;
  onPreview: () => void;
  onShare: () => void;
  onDuplicate: () => void;
  onHide: () => void;
  onShow: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onDelete: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const copy = useDashboardText();
  const word = publicationWord(item);
  return (
    <div className="absolute right-0 top-10 z-20 w-52 rounded-xl border border-admin-border-soft bg-white py-1 shadow-admin-rest">
      <MenuBtn onClick={() => { onEdit(); onClose(); }}>{copy.t("Edit")}</MenuBtn>
      <MenuBtn onClick={() => { onPreview(); onClose(); }}>{copy.t("Preview as customer")}</MenuBtn>
      {word === "live" && <MenuBtn onClick={() => { onShare(); onClose(); }}>{copy.t("Share")}</MenuBtn>}
      <MenuBtn onClick={() => { onDuplicate(); onClose(); }}>{copy.t("Duplicate")}</MenuBtn>
      {word === "live" && <MenuBtn onClick={() => { onHide(); onClose(); }}>{copy.t("Hide")}</MenuBtn>}
      {word === "hidden" && <MenuBtn onClick={() => { onShow(); onClose(); }}>{copy.t("Show again")}</MenuBtn>}
      {word !== "archived" && <MenuBtn onClick={() => { onArchive(); onClose(); }}>{copy.t("Archive")}</MenuBtn>}
      {word === "archived" && <MenuBtn onClick={() => { onRestore(); onClose(); }}>{copy.t("Restore")}</MenuBtn>}
      {word === "archived" && <MenuBtn onClick={() => { onDelete(); onClose(); }}>{copy.t("Delete forever")}</MenuBtn>}
      {filter === "all" && (
        <>
          <MenuBtn onClick={() => { onMove(-1); onClose(); }}>{copy.t("Move up")}</MenuBtn>
          <MenuBtn onClick={() => { onMove(1); onClose(); }}>{copy.t("Move down")}</MenuBtn>
        </>
      )}
    </div>
  );
}

function listPrice(item: TalentOffering, quoted: string): string {
  if (item.amountCents == null || item.priceDisplay === "quote") return quoted;
  const amount = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(item.amountCents / 100);
  return `$${amount} ${item.currency}`;
}

function MenuBtn({ children, onClick }: { children: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="block w-full px-3 py-2 text-left text-[13px] hover:bg-[rgba(11,11,13,0.04)]">
      {children}
    </button>
  );
}
