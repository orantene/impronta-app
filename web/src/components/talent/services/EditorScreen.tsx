"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  listTalentPortfolioPhotos,
  setOfferingImages,
  type PortfolioPhoto,
} from "@/lib/talent/offerings-actions";
import {
  upsertAddonGroup,
  type AddonGroup,
  type OfferingDestination,
  type SellingDefaults,
} from "@/lib/talent/services-settings-actions";
import { publicationWord } from "@/lib/talent/publication-state";
import { offeringPriceLabel, type TalentOffering } from "@/lib/talent/offerings-types";
import { usdEquivalentLabel } from "@/lib/pricing/usd-equivalent";
import { useOfferingsEditor } from "./use-offerings-editor";
import { useDashboardText } from "@/components/admin/shell/internal/dashboard-i18n";
import { uploadTalentMedia } from "@/lib/client/signed-upload";
import { ProductEditorCard } from "./ProductEditorCard";
import { categoryNearMatch } from "@/lib/talent/publication-state";

type Photo = { id: string; url: string };
type Where = "studio" | "client" | "remote" | "agreed";
const WHERE: Where[] = ["studio", "client", "remote", "agreed"];

const LABEL = "text-[11px] font-semibold uppercase tracking-[0.1em] text-admin-ink-dim";
const INPUT =
  "mt-1.5 w-full rounded-lg border border-admin-border-soft bg-white px-3 py-2.5 text-[15px] text-admin-ink outline-none focus:border-emerald-900/50";

function attr<T>(item: TalentOffering, key: string, fallback: T): T {
  const v = item.attributes?.[key];
  return v === undefined || v === null ? fallback : (v as T);
}

function money(cents: number, currency: string): string {
  return `${Math.round(cents / 100).toLocaleString("en-US")} ${currency}`;
}

function Card({ title, sub, children }: { title: string; sub: string; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-admin-border-soft bg-white">
      <header className="flex items-baseline gap-3 border-b border-admin-border-soft px-5 py-4">
        <h2 className="font-admin-body text-[16px] font-semibold tracking-normal text-admin-ink">{title}</h2>
        <span className="text-[13px] text-admin-ink-dim">{sub}</span>
      </header>
      <div className="space-y-5 px-5 py-5">{children}</div>
    </section>
  );
}

export function EditorScreen({
  item,
  setItem,
  locale,
  defaults,
  destinations,
  addons,
  talentId,
  sellerName,
  sellerCity,
  rates,
  onBack,
  onSave,
  onRefreshAddons,
  onOpenExtra,
  catalogNames,
  needsWorkingHours = false,
  onOpenWorkingHours,
}: {
  item: TalentOffering;
  setItem: (next: TalentOffering) => void;
  locale: string;
  defaults: SellingDefaults | null;
  destinations: OfferingDestination[];
  addons: AddonGroup[];
  items: TalentOffering[];
  talentId: string;
  sellerName?: string | null;
  sellerCity?: string | null;
  rates: ReturnType<typeof useOfferingsEditor>["usdRates"];
  onBack: () => void;
  onSave: (next: TalentOffering, publish: boolean, pendingImageIds?: string[]) => Promise<void>;
  onRefreshAddons: () => Promise<void>;
  onOpenExtra?: (existingId?: string) => void;
  catalogNames?: string[];
  needsWorkingHours?: boolean;
  onOpenWorkingHours?: () => void;
}) {
  const copy = useDashboardText();
  const es = copy.isSpanish;
  const [preview, setPreview] = useState(false);
  const [photosOpen, setPhotosOpen] = useState(false);
  const [busy, setBusy] = useState<null | "draft" | "publish">(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [openRule, setOpenRule] = useState<null | "deposit" | "cancel">(null);
  const [extra, setExtra] = useState({ name: "", price: "", minutes: "" });
  const [photos, setPhotos] = useState<Photo[]>(
    item.imageAssets ?? item.imageUrls.map((url, i) => ({ id: `url-${i}`, url })),
  );

  const word = publicationWord(item);
  const isLive = word === "live";
  const isNew = !item.id;
  const kind = item.kind;
  const kindWord =
    kind === "package" ? copy.t("Package") : kind === "product" ? copy.t("Product") : copy.t("Service");
  const patch = (partial: Partial<TalentOffering>) => setItem({ ...item, ...partial });
  const patchAttr = (key: string, value: unknown) =>
    setItem({ ...item, attributes: { ...(item.attributes ?? {}), [key]: value } });

  const quote = item.priceDisplay === "quote";
  const needsLength = kind !== "product" && !quote;
  const ready =
    Boolean(item.title.trim()) && (quote || item.amountCents != null) && (!needsLength || item.durationMinutes != null);
  const readyWhy = quote
    ? copy.t("Priced by quote, so it needs only a name.")
    : kind === "product"
      ? ready
        ? copy.t("Sold at a fixed price, so it needs a price. It has one.")
        : copy.t("Sold at a fixed price, so it needs a price.")
      : ready
        ? copy.t("Sold at a fixed price, so it needs a price and a length. It has both.")
        : copy.t("Sold at a fixed price, so it needs a price and a length.");

  const depositPct = item.depositPct ?? defaults?.depositPct ?? null;
  const depositOwn = item.depositPct != null;
  const cancelHours = item.cancellationHours ?? defaults?.cancelHours ?? null;
  const cancelOwn = item.cancellationHours != null;
  const depositCents =
    depositPct && item.amountCents ? Math.round((item.amountCents * depositPct) / 100) : null;
  const where = attr<Where[]>(item, "where", (defaults?.where as Where[] | undefined)?.length ? (defaults!.where as Where[]) : ["studio"]);
  const bufferAfter = attr<number | null>(item, "bufferAfterMin", defaults?.bufferAfterMin ?? null);

  const syncPhotos = async (next: Photo[]) => {
    setPhotos(next);
    const urls = next.map((p) => p.url);
    const assets = next.filter((p) => !p.id.startsWith("url-"));
    setItem({ ...item, imageUrls: urls, imageAssets: assets });
    if (item.id && assets.length === next.length) {
      await setOfferingImages(talentId, item.id, assets.map((p) => p.id));
    }
  };

  const save = async (publish: boolean) => {
    if (busy) return;
    setBusy(publish ? "publish" : "draft");
    setError(null);
    try {
      const pending = isNew ? photos.filter((p) => !p.id.startsWith("url-")).map((p) => p.id) : undefined;
      await onSave(item, publish, pending);
    } catch {
      setError(copy.t("It did not save. Everything you entered is still here. Try again."));
    } finally {
      setBusy(null);
    }
  };

  const whereLabel: Record<Where, string> = {
    studio: copy.t("At my studio"),
    client: copy.t("At the client's place"),
    remote: copy.t("Remote"),
    agreed: copy.t("Agreed after enquiry"),
  };

  const modes = [
    { id: "instant", title: copy.t("Instant booking"), sub: copy.t("They pick a free time and it is booked") },
    { id: "request", title: copy.t("Request to book"), sub: copy.t("You approve before anything is held") },
    { id: "quote", title: copy.t("Request a quote"), sub: copy.t("You agree the amount with each client") },
  ] as const;
  const activeMode = quote ? "quote" : item.bookingMode === "instant" ? "instant" : "request";

  const savedLine = isNew
    ? `${kindWord} · ${copy.t("not saved yet")}`
    : isLive
      ? `${copy.t("Live")} · ${copy.t("changes apply to new bookings only")}`
      : `${kindWord} · ${word === "hidden" ? copy.t("Hidden") : copy.t("Draft")}`;

  const btn = "rounded-lg border border-admin-border-soft bg-white px-4 py-2 text-[14px] font-semibold text-admin-ink disabled:opacity-60";
  const primary = "rounded-lg bg-emerald-900 px-4 py-2 text-[14px] font-semibold text-white disabled:border disabled:border-admin-border-soft disabled:bg-white disabled:text-admin-ink";

  return (
    <div className="font-admin-body">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <button type="button" onClick={onBack} className="mb-1 text-[13px] text-admin-ink-muted">
            ← {copy.t("Services")}
          </button>
          <h1 className="font-admin-body text-[24px] font-semibold leading-tight tracking-normal text-admin-ink">
            {isNew ? (kind === "package" ? copy.t("New package") : kind === "product" ? copy.t("New product") : copy.t("New service")) : item.title || kindWord}
          </h1>
          <p className="mt-0.5 text-[14px] text-admin-ink-dim">{savedLine}</p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <button type="button" className={btn} onClick={() => setPreview(true)}>{copy.t("Preview")}</button>
          {isLive ? (
            <button type="button" className={primary} disabled={Boolean(busy)} onClick={() => void save(false)}>
              {busy ? copy.t("Saving…") : copy.t("Save changes")}
            </button>
          ) : (
            <>
              <button type="button" className={btn} disabled={Boolean(busy)} onClick={() => void save(false)}>
                {busy === "draft" ? copy.t("Saving…") : copy.t("Save draft")}
              </button>
              <button type="button" className={primary} disabled={Boolean(busy) || !ready} onClick={() => void save(true)}>
                {busy === "publish"
                  ? copy.t("Publishing…")
                  : kind === "package" ? copy.t("Publish package") : kind === "product" ? copy.t("Publish product") : copy.t("Publish service")}
              </button>
            </>
          )}
        </div>
      </div>
      {error && (
        <div className="mt-3 flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-[13px] text-red-800">
          {error}
          <button type="button" className="font-semibold" onClick={() => void save(busy === "publish")}>{copy.t("Retry")}</button>
        </div>
      )}

      <div className="mt-5 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <Card title={copy.t("Details")} sub={copy.t("What it is and what it looks like")}>
            <label className="block">
              <span className={LABEL}>{copy.t("Name")}</span>
              <input className={INPUT} maxLength={120} value={item.title} onChange={(e) => patch({ title: e.target.value })} />
            </label>

            <div>
              <p className={LABEL}>
                {copy.t("Photos")} <span className="ml-1 normal-case tracking-normal text-admin-ink-dim">{copy.t("the first one is the cover")}</span>
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2.5">
                {photos.map((p, i) => (
                  <div key={p.id + i} className={`group relative h-[68px] w-[68px] overflow-hidden rounded-lg ${i === 0 ? "ring-2 ring-emerald-900" : ""}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.url} alt="" className="h-full w-full object-cover" />
                    {i === 0 ? (
                      <span className="absolute inset-x-1 bottom-1 rounded bg-emerald-900 py-0.5 text-center text-[10px] font-semibold text-white">{copy.t("Cover")}</span>
                    ) : (
                      <button type="button" onClick={() => void syncPhotos([p, ...photos.filter((_, j) => j !== i)])} className="absolute inset-x-1 bottom-1 hidden rounded bg-white/90 py-0.5 text-[10px] font-semibold text-admin-ink group-hover:block">
                        {copy.t("Make cover")}
                      </button>
                    )}
                    <button type="button" aria-label={copy.t("Remove photo")} onClick={() => void syncPhotos(photos.filter((_, j) => j !== i))} className="absolute right-1 top-1 hidden h-5 w-5 place-items-center rounded-full bg-white/90 text-[12px] leading-none text-admin-ink group-hover:grid">×</button>
                  </div>
                ))}
                <label className="grid h-[68px] w-[68px] cursor-pointer place-items-center rounded-lg border border-dashed border-admin-border-soft text-[20px] text-admin-ink-dim" aria-label={copy.t("Upload")}>
                  {uploading ? "…" : "+"}
                  <input type="file" accept="image/*" className="sr-only" onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (!file) return;
                    setUploading(true);
                    const up = await uploadTalentMedia({ file, variantKind: "gallery", talentProfileId: talentId });
                    setUploading(false);
                    if (up.ok) await syncPhotos([...photos, { id: up.id, url: up.publicUrl }]);
                    else setError(copy.t("That photo did not upload. Try another one."));
                  }} />
                </label>
                <div className="flex flex-col gap-2">
                  <label className="cursor-pointer rounded-lg border border-admin-border-soft bg-white px-7 py-1.5 text-center text-[13px] font-semibold text-admin-ink">
                    {copy.t("Upload")}
                    <input type="file" accept="image/*" className="sr-only" onChange={async (e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (!file) return;
                      setUploading(true);
                      const up = await uploadTalentMedia({ file, variantKind: "gallery", talentProfileId: talentId });
                      setUploading(false);
                      if (up.ok) await syncPhotos([...photos, { id: up.id, url: up.publicUrl }]);
                      else setError(copy.t("That photo did not upload. Try another one."));
                    }} />
                  </label>
                  <button type="button" className="rounded-lg border border-admin-border-soft bg-white px-3 py-1.5 text-[13px] font-semibold text-admin-ink" onClick={() => setPhotosOpen(true)}>
                    {copy.t("From portfolio")}
                  </button>
                </div>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className={LABEL}>{copy.t("How the price works")}</span>
                <select className={INPUT} value={item.priceDisplay} onChange={(e) => {
                  const v = e.target.value as TalentOffering["priceDisplay"];
                  patch(v === "quote" ? { priceDisplay: v, bookingMode: "request" } : { priceDisplay: v });
                }}>
                  <option value="exact">{copy.t("Fixed price")}</option>
                  <option value="from">{copy.t("Starting at")}</option>
                  <option value="quote">{copy.t("Quote each time")}</option>
                </select>
              </label>
              <label className="block">
                <span className={LABEL}>{copy.t("Category")}</span>
                <input list="services-category-names" className={INPUT} maxLength={80} value={item.category ?? ""} onChange={(e) => patch({ category: e.target.value || null })} />
                <datalist id="services-category-names">
                  {(catalogNames ?? []).map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
                {item.category && (catalogNames ?? []).some((name) => name !== item.category && categoryNearMatch(name, item.category ?? "")) && (
                  <p className="mt-1 text-[12.5px] text-amber-800">{copy.t("That looks like")} {(catalogNames ?? []).find((name) => name !== item.category && categoryNearMatch(name, item.category ?? ""))}.</p>
                )}
              </label>
            </div>

            {kind === "product" ? (
              <ProductEditorCard item={item} onChange={setItem} />
            ) : (
            <div className="grid gap-4 sm:grid-cols-3">
              {!quote && (
                <label className="block">
                  <span className={LABEL}>{copy.t("Price")}</span>
                  <div className="relative">
                    <input type="number" min={0} inputMode="decimal" className={`${INPUT} pr-14`} value={item.amountCents != null ? item.amountCents / 100 : ""} onChange={(e) => patch({ amountCents: e.target.value ? Math.round(Number(e.target.value) * 100) : null })} />
                    <span className="pointer-events-none absolute right-3 top-1/2 mt-[3px] -translate-y-1/2 text-[14px] text-admin-ink-dim">{item.currency}</span>
                  </div>
                </label>
              )}
              <>
                  <label className="block">
                    <span className={LABEL}>{copy.t("How long it takes")}</span>
                    <div className="relative">
                      <input type="number" min={0} className={`${INPUT} pr-12`} value={item.durationMinutes ?? ""} onChange={(e) => patch({ durationMinutes: e.target.value ? Number(e.target.value) : null })} />
                      <span className="pointer-events-none absolute right-3 top-1/2 mt-[3px] -translate-y-1/2 text-[14px] text-admin-ink-dim">min</span>
                    </div>
                  </label>
                  <label className="block">
                    <span className={LABEL}>{copy.t("Buffer after")}</span>
                    <div className="relative">
                      <input type="number" min={0} className={`${INPUT} pr-12`} value={bufferAfter ?? ""} onChange={(e) => patchAttr("bufferAfterMin", e.target.value === "" ? null : Number(e.target.value))} />
                      <span className="pointer-events-none absolute right-3 top-1/2 mt-[3px] -translate-y-1/2 text-[14px] text-admin-ink-dim">min</span>
                    </div>
                  </label>
                </>
            </div>
            )}

            <label className="block">
              <span className={LABEL}>{copy.t("Short description")}</span>
              <textarea rows={2} maxLength={280} className={INPUT} value={item.description ?? ""} onChange={(e) => patch({ description: e.target.value || null })} />
            </label>
          </Card>

          <Card title={copy.t("How clients buy it")} sub={copy.t("You can change any of this later")}>
            <div className="grid gap-3 md:grid-cols-3">
              {modes.map((m) => {
                const on = activeMode === m.id;
                return (
                  <button key={m.id} type="button" aria-pressed={on} onClick={() => {
                    if (m.id === "quote") patch({ priceDisplay: "quote", bookingMode: "request" });
                    else patch({ bookingMode: m.id, priceDisplay: quote ? "exact" : item.priceDisplay });
                  }} className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-left ${on ? "border-emerald-900/60 bg-emerald-900/[0.06]" : "border-admin-border-soft bg-white"}`}>
                    <span aria-hidden className={`mt-0.5 grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full border ${on ? "border-emerald-900" : "border-admin-ink-dim/50"}`}>
                      {on && <span className="h-2.5 w-2.5 rounded-full bg-emerald-900" />}
                    </span>
                    <span>
                      <span className={`block text-[15px] font-semibold ${on ? "text-emerald-900" : "text-admin-ink"}`}>{m.title}</span>
                      <span className="mt-0.5 block text-[13px] leading-snug text-admin-ink-dim">{m.sub}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            {activeMode === "instant" && needsWorkingHours && onOpenWorkingHours ? (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-950">
                {copy.t(
                  "Instant booking needs your working hours before clients can pick a time. Set them on Calendar.",
                )}{" "}
                <button
                  type="button"
                  className="font-semibold underline"
                  onClick={onOpenWorkingHours}
                >
                  {copy.t("Open Calendar")}
                </button>
              </p>
            ) : null}

            {kind !== "product" && (
              <div>
                <p className={LABEL}>{copy.t("Where it happens")}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {WHERE.map((w) => {
                    const on = where.includes(w);
                    return (
                      <button key={w} type="button" aria-pressed={on} onClick={() => {
                        const next = on ? where.filter((x) => x !== w) : [...where, w];
                        patchAttr("where", next.length ? next : [w]);
                      }} className={`rounded-lg px-3 py-1.5 text-[14px] font-semibold ${on ? "bg-emerald-900/[0.1] text-emerald-900" : "bg-black/[0.05] text-admin-ink-muted"}`}>
                        {whereLabel[w]}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="border-t border-admin-border-soft pt-5">
              <p className={LABEL}>
                {kind === "product" ? copy.t("Rules this product uses") : kind === "package" ? copy.t("Rules this package uses") : copy.t("Rules this service uses")}
              </p>
              <div className="mt-2 space-y-2.5">
                <RuleRow
                  title={copy.t("Deposit")}
                  line={
                    depositPct
                      ? `${depositOwn ? copy.t("Just for this item:") : copy.t("Uses your default:")} ${depositPct}%${depositCents && item.amountCents ? ` · ${money(depositCents, item.currency)} ${es ? "de" : "of"} ${Math.round(item.amountCents / 100)}, ${es ? "quedan" : "leaving"} ${Math.round((item.amountCents - depositCents) / 100)} ${es ? "en el estudio" : "at the studio"}` : ""}`
                      : `${depositOwn ? copy.t("Just for this item:") : copy.t("Uses your default:")} ${copy.t("No deposit")}`
                  }
                  open={openRule === "deposit"}
                  onEdit={() => setOpenRule(openRule === "deposit" ? null : "deposit")}
                  editLabel={copy.t("Edit")}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    {[0, 20, 25, 30, 50].map((pct) => (
                      <button key={pct} type="button" onClick={() => patch({ depositPct: pct || null, reserveMode: pct ? "deposit" : item.reserveMode })} className={`rounded-lg px-3 py-1.5 text-[13px] font-semibold ${depositPct === pct || (!depositPct && pct === 0) ? "bg-emerald-900/[0.1] text-emerald-900" : "bg-black/[0.05] text-admin-ink-muted"}`}>
                        {pct ? `${pct}%` : copy.t("None")}
                      </button>
                    ))}
                    {depositOwn && (
                      <button type="button" className="ml-2 text-[13px] text-admin-ink-muted underline" onClick={() => patch({ depositPct: null })}>{copy.t("Use my default")}</button>
                    )}
                  </div>
                </RuleRow>
                {kind !== "product" && (
                  <RuleRow
                    title={copy.t("Cancelling")}
                    line={`${cancelOwn ? copy.t("Just for this item:") : copy.t("Uses your default:")} ${cancelHours != null ? `${es ? "Gratis hasta" : "Free until"} ${cancelHours} h ${es ? "antes, luego se queda el depósito" : "before, then the deposit is kept"}` : copy.t("Flexible")}`}
                    open={openRule === "cancel"}
                    onEdit={() => setOpenRule(openRule === "cancel" ? null : "cancel")}
                    editLabel={copy.t("Edit")}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      {[12, 24, 48, 72].map((h) => (
                        <button key={h} type="button" onClick={() => patch({ cancellationHours: h })} className={`rounded-lg px-3 py-1.5 text-[13px] font-semibold ${cancelHours === h ? "bg-emerald-900/[0.1] text-emerald-900" : "bg-black/[0.05] text-admin-ink-muted"}`}>
                          {h} h
                        </button>
                      ))}
                      {cancelOwn && (
                        <button type="button" className="ml-2 text-[13px] text-admin-ink-muted underline" onClick={() => patch({ cancellationHours: null })}>{copy.t("Use my default")}</button>
                      )}
                    </div>
                  </RuleRow>
                )}
              </div>
            </div>
          </Card>

          {kind === "service" && (
            <Card title={copy.t("Options and extras")} sub={copy.t("Create once, attach to many")}>
              {addons.length > 0 && (
                <ul className="space-y-2">
                  {addons.map((g) => {
                    const on = Boolean(item.id) && g.offeringIds.includes(item.id);
                    return (
                      <li key={g.id} className="flex items-center justify-between gap-3 rounded-xl border border-admin-border-soft px-4 py-2.5">
                        <span>
                          <span className="block text-[14px] font-semibold text-admin-ink">{g.name}</span>
                          <span className="block text-[12.5px] text-admin-ink-dim">
                            +{money(g.amountCents, item.currency)}{g.durationMinutes ? ` · +${g.durationMinutes} min` : ""} · {g.offeringIds.length} {copy.t("services")}
                          </span>
                        </span>
                        <button type="button" disabled={!item.id} onClick={async () => {
                          if (!item.id) return;
                          const ids = on ? g.offeringIds.filter((x) => x !== item.id) : [...g.offeringIds, item.id];
                          await upsertAddonGroup(talentId, { id: g.id, name: g.name, amountCents: g.amountCents, durationMinutes: g.durationMinutes, offeringIds: ids });
                          await onRefreshAddons();
                        }} className={`rounded-lg px-3 py-1.5 text-[13px] font-semibold disabled:opacity-50 ${on ? "bg-emerald-900/[0.1] text-emerald-900" : "border border-admin-border-soft text-admin-ink"}`}>
                          {on ? copy.t("On this service") : copy.t("Add to this service")}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_120px_110px_auto]">
                <input className={INPUT} placeholder={copy.t("Extra name, like glitter")} value={extra.name} onChange={(e) => setExtra({ ...extra, name: e.target.value })} />
                <input className={INPUT} type="number" min={0} placeholder={item.currency} value={extra.price} onChange={(e) => setExtra({ ...extra, price: e.target.value })} />
                <input className={INPUT} type="number" min={0} placeholder="+ min" value={extra.minutes} onChange={(e) => setExtra({ ...extra, minutes: e.target.value })} />
                <button type="button" className="mt-1.5 rounded-lg border border-admin-border-soft px-4 text-[14px] font-semibold" onClick={() => onOpenExtra?.()}>
                  {copy.t("Create an extra")}
                </button>
                <button type="button" disabled={!extra.name.trim()} className="mt-1.5 rounded-lg bg-emerald-900 px-4 text-[14px] font-semibold text-white disabled:opacity-50" onClick={async () => {
                  const res = await upsertAddonGroup(talentId, {
                    name: extra.name,
                    amountCents: Math.round(Number(extra.price || 0) * 100),
                    durationMinutes: extra.minutes ? Number(extra.minutes) : null,
                    offeringIds: item.id ? [item.id] : [],
                  });
                  if (!res.ok) { setError(res.error); return; }
                  setExtra({ name: "", price: "", minutes: "" });
                  await onRefreshAddons();
                }}>
                  {copy.t("Add an extra")}
                </button>
              </div>
              <p className="text-[12.5px] text-admin-ink-dim">
                {copy.t("An extra is always booked with a service, never on its own.")}
              </p>
            </Card>
          )}
        </div>

        <aside className="space-y-4 xl:border-l xl:border-admin-border-soft xl:pl-6">
          <div className="flex items-center justify-between">
            <p className={LABEL}>{copy.t("What the client sees")}</p>
            <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${isLive ? "bg-emerald-900/[0.1] text-emerald-900" : "bg-black/[0.06] text-admin-ink-muted"}`}>
              {isLive ? copy.t("Live") : word === "hidden" ? copy.t("Hidden") : copy.t("Draft")}
            </span>
          </div>
          <ClientCard item={item} locale={locale} rates={rates} depositCents={depositCents} cancelHours={cancelHours} />
          <div className="rounded-2xl border border-admin-border-soft bg-white px-4 py-4">
            <div className="flex items-center justify-between">
              <p className={LABEL}>{copy.t("Ready to publish?")}</p>
              <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${ready ? "bg-emerald-900/[0.1] text-emerald-900" : "bg-amber-100 text-amber-900"}`}>
                {ready ? copy.t("Yes") : copy.t("Not yet")}
              </span>
            </div>
            <p className="mt-2 text-[13.5px] leading-snug text-admin-ink">{readyWhy}</p>
          </div>
        </aside>
      </div>

      {preview && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4" onClick={() => setPreview(false)}>
          <div style={{ maxWidth: 460 }} className="w-full overflow-hidden rounded-2xl bg-white" onClick={(e) => e.stopPropagation()}>
            <div className="border-b border-admin-border-soft px-5 py-4">
              <h2 className="font-admin-body text-[18px] font-semibold tracking-normal text-admin-ink">{copy.t("Preview as customer")}</h2>
              <p className="mt-0.5 text-[13px] text-admin-ink-dim">{copy.t("This is how it looks on your pages. Nothing is booked from here.")}</p>
            </div>
            <div className="px-5 py-4">
              <ClientCard
                item={item}
                locale={locale}
                rates={rates}
                depositCents={depositCents}
                cancelHours={cancelHours}
                sellerName={sellerName}
                sellerCity={sellerCity}
              />
              {destinations.length > 0 && (
                <ul className="mt-4 space-y-2 text-[13px]">
                  {destinations.map((d) => (
                    <li key={d.id} className="flex items-center justify-between gap-3 rounded-lg bg-black/[0.03] px-3 py-2">
                      <span>
                        <span className="block font-semibold text-admin-ink">{d.label}</span>
                        <span className="block text-admin-ink-dim">{copy.t("Who gets the enquiry")}: {d.enquiryTo}</span>
                      </span>
                      {d.href && isLive && (
                        <a className="shrink-0 font-semibold text-emerald-900" href={d.href} target="_blank" rel="noreferrer">{copy.t("Open live page")}</a>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="flex justify-end border-t border-admin-border-soft px-5 py-3">
              <button type="button" className={btn} onClick={() => setPreview(false)}>{copy.t("Back to editing")}</button>
            </div>
          </div>
        </div>
      )}

      {photosOpen && (
        <PortfolioSheet
          talentId={talentId}
          item={item}
          current={photos}
          onClose={() => setPhotosOpen(false)}
          onPick={async (picked) => {
            setPhotosOpen(false);
            const keep = photos.filter((p) => !picked.some((q) => q.id === p.id));
            await syncPhotos([...keep, ...picked]);
          }}
        />
      )}
    </div>
  );
}

function RuleRow({ title, line, open, onEdit, editLabel, children }: { title: string; line: string; open: boolean; onEdit: () => void; editLabel: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-admin-border-soft bg-black/[0.015] px-4 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0">
          <span className="block text-[14.5px] font-semibold text-admin-ink">{title}</span>
          <span className="block text-[13px] text-admin-ink-dim">{line}</span>
        </span>
        <button type="button" onClick={onEdit} className="shrink-0 rounded-lg border border-admin-border-soft bg-white px-3 py-1.5 text-[13px] font-semibold text-admin-ink">{editLabel}</button>
      </div>
      {open && <div className="mt-3 border-t border-admin-border-soft pt-3">{children}</div>}
    </div>
  );
}

function savedWhen(iso: string | null | undefined, es: boolean): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString(es ? "es-MX" : "en-US", { dateStyle: "medium", timeStyle: "short" });
}

function ClientCard({ item, locale, rates, depositCents, cancelHours, sellerName, sellerCity }: {
  item: TalentOffering;
  locale: string;
  rates: ReturnType<typeof useOfferingsEditor>["usdRates"];
  depositCents: number | null;
  cancelHours: number | null;
  sellerName?: string | null;
  sellerCity?: string | null;
}) {
  const copy = useDashboardText();
  const es = locale.startsWith("es");
  const who = [sellerName?.trim(), sellerCity?.trim()].filter(Boolean).join(" · ");
  const saved = savedWhen(item.updatedAt, es);
  const cover = item.imageUrls[0];
  const quote = item.priceDisplay === "quote";
  const usd = quote ? null : usdEquivalentLabel(item.amountCents, item.currency, rates ?? null, locale);
  const price = offeringPriceLabel(item, locale);
  const cta = quote
    ? es ? "Pedir cotización" : "Ask for a quote"
    : item.kind === "product"
      ? es ? "Comprar" : "Buy"
      : item.bookingMode === "instant"
        ? depositCents ? `${es ? "Reservar" : "Book"} · ${money(depositCents, item.currency)} ${es ? "de depósito" : "deposit"}` : es ? "Reservar" : "Book"
        : es ? "Pedir reserva" : "Request to book";
  return (
    <div className="overflow-hidden rounded-2xl border border-admin-border-soft bg-white">
      {cover ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={cover} alt="" className="aspect-[16/9] w-full object-cover" />
      ) : (
        <div className="grid aspect-[16/9] w-full place-items-center bg-black/[0.04] text-[13px] text-admin-ink-dim">{es ? "Sin foto todavía" : "No photo yet"}</div>
      )}
      <div className="px-4 pb-4 pt-3">
        <p className="text-[18px] font-semibold text-admin-ink">{item.title || (es ? "Sin nombre" : "Untitled")}</p>
        {who ? <p className="text-[13px] text-admin-ink-dim">{who}</p> : null}
        {item.category && <p className="text-[13px] text-admin-ink-dim">{item.category}</p>}
        {item.description && <p className="mt-2 text-[14px] leading-snug text-admin-ink-muted">{item.description}</p>}
        <p className="mt-3 flex flex-wrap items-baseline gap-x-2 text-[13px] text-admin-ink-dim">
          {quote || item.amountCents == null ? (
            <span className="text-[20px] font-semibold text-admin-ink">{price}</span>
          ) : (
            <>
              {item.priceDisplay === "from" && <span className="text-[14px] text-admin-ink-muted">{es ? "Desde" : "From"}</span>}
              <span className="text-[24px] font-semibold text-admin-ink">${Math.round(item.amountCents / 100).toLocaleString("en-US")}</span>
              <span>
                {item.currency}
                {item.durationMinutes && item.kind !== "product" ? ` · ${item.durationMinutes} min` : ""}
              </span>
            </>
          )}
          {usd && <span>{usd}</span>}
        </p>
        <div className="mt-3 rounded-lg bg-emerald-900 py-2.5 text-center text-[14.5px] font-semibold text-white">{cta}</div>
        {cancelHours != null && item.kind !== "product" && (
          <p className="mt-2 text-center text-[12px] text-admin-ink-dim">
            {es ? `Cambios gratis hasta ${cancelHours} h antes` : `Free changes until ${cancelHours} h before`}
          </p>
        )}
        {saved ? (
          <p className="mt-2 text-center text-[12px] text-admin-ink-dim">
            {copy.t("Last saved {when}").replace("{when}", saved)}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function PortfolioSheet({
  talentId,
  item,
  current,
  onClose,
  onPick,
}: {
  talentId: string;
  item: TalentOffering;
  current: Photo[];
  onClose: () => void;
  onPick: (picked: Photo[]) => void | Promise<void>;
}) {
  const copy = useDashboardText();
  const [photos, setPhotos] = useState<PortfolioPhoto[] | null>(null);
  const [picked, setPicked] = useState<string[]>(current.map((p) => p.id));
  useEffect(() => {
    let alive = true;
    void listTalentPortfolioPhotos(talentId).then((res) => {
      if (alive && res.ok) setPhotos(res.photos);
    });
    return () => {
      alive = false;
    };
  }, [talentId]);
  const chosen = (photos ?? []).filter((p) => picked.includes(p.id));
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 md:items-center md:p-4" onClick={onClose}>
      <div style={{ maxWidth: 680 }} className="flex max-h-[85vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white md:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="border-b border-admin-border-soft px-5 py-4">
          <h2 className="font-admin-body text-[18px] font-semibold tracking-normal text-admin-ink">{copy.t("Pick photos from your portfolio")}</h2>
          <p className="mt-0.5 text-[13px] text-admin-ink-dim">
            {copy.t("For")} {item.title || copy.t("this item")} · {copy.t("the first one you pick is the cover")}
          </p>
        </div>
        <div className="grid flex-1 grid-cols-3 gap-2.5 overflow-auto p-5 sm:grid-cols-4">
          {photos === null && <p className="col-span-full text-[13px] text-admin-ink-dim">{copy.t("Loading")}…</p>}
          {photos?.length === 0 && <p className="col-span-full text-[13px] text-admin-ink-dim">{copy.t("Your portfolio has no photos yet.")}</p>}
          {(photos ?? []).map((photo) => {
            const idx = picked.indexOf(photo.id);
            const on = idx >= 0;
            const elsewhere = photo.onOfferings.filter((o) => o.id !== item.id);
            return (
              <button key={photo.id} type="button" onClick={() => setPicked((cur) => (on ? cur.filter((id) => id !== photo.id) : [...cur, photo.id]))} className={`relative overflow-hidden rounded-lg text-left ${on ? "ring-2 ring-emerald-900 ring-offset-2" : ""}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.url} alt="" className="aspect-square w-full object-cover" />
                {on && (
                  <span className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-emerald-900 text-[12px] font-bold text-white">{idx + 1}</span>
                )}
                {elsewhere.length > 0 && (
                  <span className="absolute inset-x-1.5 bottom-1.5 truncate rounded bg-white/90 px-1.5 py-0.5 text-[10.5px] text-admin-ink">
                    {copy.t("On")} {elsewhere[0].title}{elsewhere.length > 1 ? ` +${elsewhere.length - 1}` : ""}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div className="flex items-center justify-between border-t border-admin-border-soft px-5 py-3">
          <span className="text-[13px] text-admin-ink-dim">{picked.length} {copy.t("selected")}</span>
          <span className="flex gap-3">
            <button type="button" className="text-[14px] text-admin-ink" onClick={onClose}>{copy.t("Cancel")}</button>
            <button type="button" className="rounded-lg bg-emerald-900 px-4 py-2 text-[14px] font-semibold text-white" onClick={() => void onPick(picked.map((id) => chosen.find((p) => p.id === id)).filter((p): p is PortfolioPhoto => Boolean(p)).map((p) => ({ id: p.id, url: p.url })))}>
              {copy.t("Use these photos")}
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}
